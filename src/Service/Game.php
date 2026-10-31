<?php

namespace App\Service;

use App\Entity\Battle;
use App\Entity\ChatMessage;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Party;
use App\Game\Combatants;
use App\Game\Dungeons;
use App\Game\Heritage;
use App\Game\Items;
use App\Game\Marks;
use App\Game\Rules;
use App\Game\Simulator;
use App\Game\Stats;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * The game clock. Battles are simulated in full when they start and their results land when they end.
 * Nothing needs to run live: whenever anyone looks at a group (or the cron command runs), every battle
 * that has finished since is settled and the next one starts, up to the offline cap.
 */
class Game
{
    /** Chance that a boss drops an item: the first, any in the middle, the last. */
    private const BOSS_DROP = [0.35, 0.45, 0.6];
    private const MAX_CATCH_UP = 12;

    public function __construct(
        private EntityManagerInterface $em,
        #[Autowire('%game.battle_seconds%')] private int $battleSeconds,
        #[Autowire('%game.chest_seconds%')] private int $chestSeconds,
        #[Autowire('%game.offline_cap_seconds%')] private int $offlineCapSeconds,
        private Notifier $notifier,
    ) {
    }

    public function battleSeconds(): int
    {
        return $this->battleSeconds;
    }

    // ------------------------------------------------------------------ builds

    /** @return Item[] */
    public function equipped(Hero $hero): array
    {
        return $this->em->getRepository(Item::class)->createQueryBuilder('i')
            ->where('i.owner = :h')->andWhere('i.equipped IS NOT NULL')->setParameter('h', $hero)
            ->getQuery()->getResult();
    }

    public function build(Hero $hero): array
    {
        return [
            'race' => $hero->race, 'cls' => $hero->cls, 'origin' => $hero->origin, 'level' => $hero->level,
            'spent' => $hero->spent, 'path' => $hero->path, 'legend' => $hero->legend, 'keystones' => $hero->keystones,
            'talents' => $hero->talents, 'heritage' => $hero->heritage, 'culture' => $hero->culture, 'backstory' => $hero->backstory, 'story' => $hero->story,
            'items' => array_map(fn (Item $i) => Items::spec($i), $this->equipped($hero)),
        ];
    }

    public function loadout(Hero $hero): array
    {
        $avail = Combatants::available($hero->cls, $hero->level, $hero->path, $hero->talents);
        $ids = array_values(array_filter($hero->loadout, fn ($id) => isset($avail[$id])));

        return $ids ?: Combatants::defaultLoadout($hero->cls, $hero->level, $hero->path, $hero->talents);
    }

    public function combatant(Hero $hero): array
    {
        $c = Combatants::make($this->build($hero), $hero->id, $hero->name, $this->loadout($hero), $hero->skillRanks);
        if ($hero->signature) {
            $c['signature'] = ['id' => $hero->signature, 'name' => $hero->signatureName, 'mastery' => Rules::signatureMastery($hero->signatureXp)];
        }

        return $c;
    }

    // ------------------------------------------------------------------ the clock

    /** Settle every battle of this group that has ended, and start the next ones. */
    public function progress(Party $party, ?int $now = null): void
    {
        $now ??= time();
        for ($n = 0; $n < self::MAX_CATCH_UP; ++$n) {
            $running = $this->em->getRepository(Battle::class)->findOneBy(['party' => $party, 'state' => 'running']);
            if ($running && $running->endsAt <= $now) {
                $this->finish($running);
                $this->em->flush();
                $next = $running->endsAt;
                if ($this->canStart($party) && $this->withinOfflineCap($party, $next)) {
                    $this->start($party, $next);
                    $this->em->flush();
                }
                continue;
            }
            if (!$running && $this->canStart($party) && $this->withinOfflineCap($party, $now)) {
                $this->start($party, $now);
                $this->em->flush();
            }
            break;
        }
        foreach ($this->em->getRepository(Battle::class)->findBy(['party' => $party, 'state' => 'chest']) as $b) {
            $this->settleChest($b, $now);
        }
        $this->em->flush();
    }

    public function canStart(Party $party): bool
    {
        return $party->running && $party->members->count() === Party::SIZE;
    }

    /** Battles keep chaining while someone in the group has been around in the last offline-cap window. */
    private function withinOfflineCap(Party $party, int $at): bool
    {
        $last = 0;
        foreach ($party->members as $m) {
            $last = max($last, $m->user->demo ? 0 : $m->user->lastSeenAt);
        }

        return $at < $last + $this->offlineCapSeconds;
    }

    public function medianLevel(Party $party): int
    {
        $levels = array_map(fn (Hero $h) => $h->level, $party->members->toArray());
        sort($levels);

        return $levels ? $levels[intdiv(count($levels), 2)] : 1;
    }

    /** The dungeon the group runs next: the leader's pick while the group still qualifies, else the newest reached. */
    public function dungeonFor(Party $party): array
    {
        $median = $this->medianLevel($party);
        $open = Dungeons::unlocked($median);

        return $party->dungeon && isset($open[$party->dungeon]) ? $open[$party->dungeon] : Dungeons::newest($median);
    }

    public function dungeonLevel(Party $party): int
    {
        return Dungeons::clamp($this->dungeonFor($party), max(1, $this->medianLevel($party) + $party->dungeonOffset));
    }

    public function start(Party $party, int $at): Battle
    {
        $b = new Battle();
        $b->party = $party;
        $b->seed = random_int(1, 2_000_000_000);
        $b->dungeonLevel = $this->dungeonLevel($party);
        $b->dungeon = $this->dungeonFor($party)['id'];
        $b->startedAt = $at;
        $b->endsAt = $at + $this->battleSeconds;
        $heroes = $party->members->toArray();
        usort($heroes, fn (Hero $a, Hero $c) => [array_search($a->role(), ['tank', 'healer', 'dps']), $a->id] <=> [array_search($c->role(), ['tank', 'healer', 'dps']), $c->id]);
        $combatants = array_map(fn (Hero $h) => $this->combatant($h), $heroes);
        // Heroes above the dungeon's level band are scaled down to it.
        foreach ($combatants as $k => $c) {
            if ($c['level'] > $b->dungeonLevel + 5) {
                $scale = Combatants::make(array_merge($this->build($heroes[$k]), ['level' => $b->dungeonLevel + 5]), $c['id'], $c['name'], $c['loadout'], $c['ranks']);
                $combatants[$k]['stats'] = $scale['stats'];
            }
        }
        $result = (new Simulator())->run($combatants, $b->dungeonLevel, $b->seed, Dungeons::get($b->dungeon));
        $b->timeline = $result['timeline'];
        $b->report = $result['report'];
        $b->roster = array_map(fn (Hero $h, array $c) => [
            'id' => $h->id, 'name' => $h->name, 'cls' => $h->cls, 'race' => $h->race, 'level' => $h->level, 'role' => $h->role(),
            'look' => $this->look($h), 'resource' => $c['stats']['resource'], 'maxHp' => (int) $c['stats']['maxHp'],
        ], $heroes, $combatants);
        $this->em->persist($b);

        return $b;
    }

    /** Pixel renderer look including worn gear. */
    public function look(Hero $hero): array
    {
        $look = $hero->look + ['race' => $hero->race, 'hat' => 'none', 'top' => 'tunic', 'bottom' => 'pants', 'shoes' => 'boots', 'gloves' => 'none', 'cape' => 'none', 'weapon' => 'sword', 'offhand' => 'none'];
        $look['race'] = $hero->race;
        $hasWeapon = false;
        foreach ($this->equipped($hero) as $i) {
            $layer = Rules::SLOTS[$i->equipped][1] ?? null;
            if ($layer) {
                $look[$layer] = $i->base;
                $hasWeapon = $hasWeapon || $layer === 'weapon';
            }
        }
        if (!$hasWeapon) {
            $look['weapon'] = Rules::CLASSES[$hero->cls]['kit']['weapon'];
        }

        return $look;
    }

    // ------------------------------------------------------------------ results

    public function finish(Battle $b): void
    {
        $rep = $b->report;
        $dl = $b->dungeonLevel;
        $r = new Randomizer(new Mt19937($b->seed ^ 0x5bd1e995));
        $heroes = [];
        foreach ($b->roster as $row) {
            if ($h = $this->em->find(Hero::class, $row['id'])) {
                $heroes[] = $h;
            }
        }
        $dungeon = Dungeons::get($b->dungeon);
        $plan = $dungeon['plan'];
        $units = Dungeons::units($dungeon, $rep);
        $keenEye = false;
        foreach ($heroes as $h) {
            $keenEye = $keenEye || $h->cls === 'rogue';
        }
        $group = array_map(fn (Hero $h) => ['race' => $h->race, 'real' => !$h->user->demo], $heroes);
        foreach ($heroes as $k => $h) {
            $stats = Stats::derive($this->build($h));
            $xp = Rules::battleXp($dl, $units, $h->race, $b->party->battlesTogether, $stats['xpBonus']);
            // Heritage: Renown for running with your own race, twice for your own culture.
            $others = [];
            foreach ($heroes as $o) {
                if ($o !== $h) {
                    $others[] = [$o->race, $o->culture, $o->backstory];
                }
            }
            $kin = Heritage::kin($h->race, $h->culture, $others, $h->backstory);
            $renown = Heritage::renownGain($units, $kin, $stats['renownBonus']);
            $rankBefore = $h->heritageRank();
            $h->renown += $renown;
            if ($h->heritageRank() > $rankBefore) {
                $this->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf("%s's %s Heritage reached rank %d.", $h->name, Rules::RACES[$h->race]['name'], $h->heritageRank()), ['type' => 'hero', 'hero' => $h->id]);
            }
            $rep['heroes'][$k]['renown'] = $renown;
            $rep['heroes'][$k]['kin'] = $kin;
            $gold = (int) round(5 * 1.045 ** (2 * $dl) * $units * $stats['fortune']);
            // Every run pays materials, even one that ends early.
            $mats = (int) round((3 + 0.5 * $units) * (1 + $dl / 10) * $stats['fortune']);
            $h->gold = (string) ((int) $h->gold + $gold);
            $h->materials += $mats;
            $c = $h->career + ['battles' => 0, 'dungeons' => 0, 'bossKills' => 0, 'deaths' => 0];
            $c['battles']++;
            $c['dungeons'] = ($c['dungeons'] ?? 0) + ($rep['wiped'] ? 0 : 1);
            $c['bossKills'] += $rep['bossesKilled'];
            $c['deaths'] += $rep['heroes'][$k]['deaths'] ?? 0;
            if (!$rep['wiped']) {
                $c['cleared'] = array_values(array_unique([...$c['cleared'] ?? [], $dungeon['id']]));
            }
            $h->career = $c;
            $rep['heroes'][$k]['xp'] = $xp;
            $rep['heroes'][$k]['gold'] = $gold;
            $rep['heroes'][$k]['materials'] = $mats;
            $this->addXp($h, $xp);
            $this->addSignatureXp($h, (int) ($rep['heroes'][$k]['sigXp'] ?? 0));
            $this->earnMarks($h, $k, $rep, $group, $dungeon['id']);
            if ($h->guild) {
                $h->guild->xp += (int) round($units);
            }
        }
        $b->party->battlesTogether++;

        // The group chest: each boss may drop an item, the later ones more often. Never guaranteed.
        $chest = [];
        $bossCount = Dungeons::bossCount($dungeon);
        foreach (array_slice(array_values(array_filter($plan, fn ($x) => $x[0] === 'boss')), 0, $rep['bossesKilled']) as $n => [, $bossId]) {
            $boss = $dungeon['bosses'][$bossId]['name'];
            if ($r->getFloat(0, 1) < self::BOSS_DROP[$n === $bossCount - 1 ? 2 : min($n, 1)]) {
                $chest[] = ['spec' => Items::generate($r, 2 * $dl, Items::rollRarity($r, $keenEye ? 0.08 : 0.0)), 'rolls' => [], 'winner' => null, 'from' => $boss];
            }
            if ($dl >= 15 && $r->getFloat(0, 1) < 0.2) {
                $chest[] = ['spec' => Items::glyph($r, 2 * $dl), 'rolls' => [], 'winner' => null, 'from' => $boss];
            }
        }
        $b->chest = $chest;
        $b->report = $rep;
        $b->state = 'chest';
        $b->chestClosesAt = $b->endsAt + $this->chestSeconds;
        $b->timeline = null;

        $loot = $chest ? sprintf(' The chest holds %d item%s.', count($chest), count($chest) === 1 ? '' : 's') : ' No loot this time, only materials.';
        $line = $rep['wiped']
            ? sprintf('%s: the group fell after %d of %d bosses. %s', $dungeon['name'], $rep['bossesKilled'], Dungeons::bossCount($dungeon), $rep['cause']).$loot
            : sprintf('%s cleared!', $dungeon['name']).$loot;
        if ($rep['wiped']) {
            // A wipe stops the chain: the group rests until someone comes back, changes what they need and sends it in.
            $b->party->running = false;
            $line .= ' The group rests until someone sends it back in.';
        }
        $this->post('party:'.$b->party->id, $line, ['type' => 'report', 'battle' => $b->id]);
        foreach ($heroes as $h) {
            if ($rep['wiped']) {
                $this->notifier->notify($h, 'wipe', 'Your group fell', sprintf('%s: after %d of %d bosses. Change what you need and send it back in.', $dungeon['name'], $rep['bossesKilled'], Dungeons::bossCount($dungeon)));
            } elseif ($chest) {
                $this->notifier->notify($h, 'chest', 'Loot in the group chest', sprintf('%d item%s to roll on before the chest closes.', count($chest), count($chest) === 1 ? '' : 's'));
            }
            if ($h->user->demo) {
                foreach ($chest as $idx => $_) {
                    $this->autoRoll($b, $h, $idx);
                }
            }
        }
    }

    public function addXp(Hero $h, int $xp): void
    {
        $total = (int) $h->xp + $xp;
        $before = $h->level;
        while ($total >= Rules::xpForLevel($h->level)) {
            $total -= Rules::xpForLevel($h->level);
            ++$h->level;
            if ($h->level === Rules::OATH_LEVEL && !$h->oathTaken) {
                $this->takeOath($h);
            }
            if (in_array($h->level, [Rules::PATH_LEVEL, 50, 100], true) || $h->level % 25 === 0) {
                $this->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf('%s reached level %d.', $h->name, $h->level), ['type' => 'hero', 'hero' => $h->id]);
            }
        }
        $h->xp = (string) $total;
        if ($h->level > $before) {
            $this->notifier->notify($h, 'level', sprintf('%s reached level %d', $h->name, $h->level), 'New points to spend.', '#/hero');
        }
    }

    private function addSignatureXp(Hero $h, int $xp): void
    {
        if (!$h->signature || $xp <= 0) {
            return;
        }
        $before = Rules::signatureMastery($h->signatureXp);
        $h->signatureXp += $xp;
        $now = Rules::signatureMastery($h->signatureXp);
        if (intdiv($now, 10) > intdiv($before, 10)) {
            $skill = $h->signatureName ?: Rules::classSkills($h->cls)[$h->signature][0];
            $this->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf("%s's %s reached Mastery %d.", $h->name, $skill, $now), ['type' => 'hero', 'hero' => $h->id]);
        }
    }

    /** Level 20: the Path and every point spent so far are carved in. */
    public function takeOath(Hero $h): void
    {
        $h->oathTaken = true;
        $h->carved = $h->spent;
        $h->marks = array_values(array_unique([...$h->marks, 'oathsworn']));
        $what = $h->path ? Rules::CLASSES[$h->cls]['paths'][$h->path][0] : 'their Path';
        $this->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf('Oath Day: %s swore to %s.', $h->name, $what), ['type' => 'hero', 'hero' => $h->id]);
    }

    private function earnMarks(Hero $h, int $k, array $rep, array $group, string $dungeon): void
    {
        $hero = ['level' => $h->level, 'role' => $h->role(), 'career' => $h->career];
        $h->marks = array_values(array_unique([...$h->marks, ...Marks::fromBattle($hero, $k, $rep, $group, $dungeon, array_keys(Dungeons::all()))]));
    }

    // ------------------------------------------------------------------ chest

    public function roll(Battle $b, Hero $h, int $idx, string $choice): void
    {
        if ($b->state !== 'chest' || !isset($b->chest[$idx]) || !in_array($choice, ['need', 'greed', 'pass'], true)) {
            return;
        }
        if (!in_array($h->id, array_column($b->roster, 'id'), true)) {
            return;
        }
        $chest = $b->chest;
        $chest[$idx]['rolls'][(string) $h->id] = $choice;
        $b->chest = $chest;
        $this->settleChest($b, time());
    }

    public function autoRoll(Battle $b, Hero $h, int $idx): void
    {
        $spec = $b->chest[$idx]['spec'];
        $choice = match ($h->lootPolicy) {
            'pass' => 'pass',
            'greed' => 'greed',
            default => $this->isUpgrade($h, $spec) ? 'need' : 'greed',
        };
        $chest = $b->chest;
        $chest[$idx]['rolls'][(string) $h->id] = $choice;
        $b->chest = $chest;
    }

    public function isUpgrade(Hero $h, array $spec): bool
    {
        if ($spec['slot'] === 'glyph') {
            return true;
        }
        $best = 0.0;
        $slots = $spec['slot'] === 'ring1' ? ['ring1', 'ring2'] : [$spec['slot']];
        $worst = null;
        foreach ($this->equipped($h) as $i) {
            if (in_array($i->equipped, $slots, true)) {
                $s = Stats::itemScore(Items::spec($i), $h->cls);
                $worst = $worst === null ? $s : min($worst, $s);
            }
        }
        if ($worst === null || ($spec['slot'] === 'ring1' && count(array_filter($this->equipped($h), fn ($i) => in_array($i->equipped, $slots, true))) < 2)) {
            return true;
        }

        return Stats::itemScore($spec, $h->cls) > $worst;
    }

    /** Hand out items once everyone has rolled, or when the chest closes (absent players roll by their loot policy). */
    public function settleChest(Battle $b, int $now): void
    {
        if ($b->state !== 'chest') {
            return;
        }
        $ids = array_column($b->roster, 'id');
        $closing = $now >= $b->chestClosesAt;
        $chest = $b->chest;
        foreach ($chest as $idx => $entry) {
            if (count($entry['rolls']) >= count($ids)) {
                continue;
            }
            if (!$closing) {
                return;
            }
            foreach ($ids as $id) {
                if (!isset($entry['rolls'][(string) $id]) && ($h = $this->em->find(Hero::class, $id))) {
                    $b->chest = $chest;
                    $this->autoRoll($b, $h, $idx);
                    $chest = $b->chest;
                }
            }
        }
        $r = new Randomizer(new Mt19937($b->seed ^ 0x1234567));
        foreach ($chest as $idx => $entry) {
            $best = null;
            $rolls = [];
            foreach (['need', 'greed'] as $tier) {
                foreach ($entry['rolls'] as $id => $choice) {
                    if ($choice === $tier) {
                        $rolls[$id] = $r->getInt(1, 100);
                    }
                }
                if ($rolls) {
                    arsort($rolls);
                    $best = (int) array_key_first($rolls);
                    break;
                }
            }
            $chest[$idx]['numbers'] = $rolls;
            $chest[$idx]['winner'] = $best;
            $spec = $entry['spec'];
            if ($best && ($winner = $this->em->find(Hero::class, $best))) {
                $item = Items::fromSpec($spec);
                $item->owner = $winner;
                $this->em->persist($item);
                if ($spec['power'] ?? null) {
                    $winner->codex = array_values(array_unique([...$winner->codex, $spec['power']]));
                    $winner->marks = array_values(array_unique([...$winner->marks, 'legendFound']));
                    $this->post($winner->guild ? 'guild:'.$winner->guild->id : 'tavern', sprintf('%s found a legendary: %s!', $winner->name, Items::name($spec)), ['type' => 'item', 'spec' => $spec]);
                }
            } else {
                // Nobody wanted it: everyone gets a share of Essence instead.
                foreach ($ids as $id) {
                    if ($h = $this->em->find(Hero::class, $id)) {
                        $h->essence += max(1, intdiv(Items::salvageValue($spec), 2));
                    }
                }
            }
        }
        $b->chest = $chest;
        $b->state = 'done';
    }

    // ------------------------------------------------------------------ chat

    public function post(string $channel, string $body, ?array $card = null, ?Hero $author = null): ChatMessage
    {
        $m = new ChatMessage();
        $m->channel = $channel;
        $m->body = mb_substr($body, 0, 500);
        $m->card = $card;
        $m->author = $author;
        $m->createdAt = time();
        $this->em->persist($m);

        return $m;
    }
}
