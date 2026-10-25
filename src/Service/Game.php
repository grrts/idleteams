<?php

namespace App\Service;

use App\Entity\Battle;
use App\Entity\ChatMessage;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Party;
use App\Game\Combatants;
use App\Game\Heritage;
use App\Game\Items;
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
    /** Chance that each boss (first, second, last) drops an item. */
    private const BOSS_DROP = [0.35, 0.45, 0.6];
    private const MAX_CATCH_UP = 12;

    public function __construct(
        private EntityManagerInterface $em,
        #[Autowire('%game.battle_seconds%')] private int $battleSeconds,
        #[Autowire('%game.chest_seconds%')] private int $chestSeconds,
        #[Autowire('%game.offline_cap_seconds%')] private int $offlineCapSeconds,
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
            'spent' => $hero->spent, 'path' => $hero->path, 'keystones' => $hero->keystones,
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
        return Combatants::make($this->build($hero), $hero->id, $hero->name, $this->loadout($hero), $hero->skillRanks);
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

    public function dungeonLevel(Party $party): int
    {
        $levels = array_map(fn (Hero $h) => $h->level, $party->members->toArray());
        sort($levels);
        $median = $levels ? $levels[intdiv(count($levels), 2)] : 1;

        return max(1, $median + $party->dungeonOffset);
    }

    public function start(Party $party, int $at): Battle
    {
        $b = new Battle();
        $b->party = $party;
        $b->seed = random_int(1, 2_000_000_000);
        $b->dungeonLevel = $this->dungeonLevel($party);
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
        $result = (new Simulator())->run($combatants, $b->dungeonLevel, $b->seed);
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
        // Rewards follow how far the group got: packs count 1, bosses 2, 3 and 4. A full run is 15.
        $plan = Simulator::DUNGEON;
        $done = $rep['encountersDone'];
        $units = 0.0;
        foreach ($plan as $n => [$kind]) {
            $w = $kind === 'boss' ? 1 + count(array_filter(array_slice($plan, 0, $n + 1), fn ($x) => $x[0] === 'boss')) : 1;
            if ($n < $done) {
                $units += $w;
            } elseif ($n === $done && $rep['wiped']) {
                $units += $w / 2; // half credit for the fight the group fell in
            }
        }
        $keenEye = false;
        foreach ($heroes as $h) {
            $keenEye = $keenEye || $h->cls === 'rogue';
        }
        foreach ($heroes as $k => $h) {
            $stats = Stats::derive($this->build($h));
            $xp = (int) round(12 * $dl ** 1.5 * $units * ($h->race === 'human' ? 1.05 : 1.0) * (1 + 0.01 * min(10, $b->party->battlesTogether)) * (1 + $stats['xpBonus']));
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
            $h->career = $c;
            $rep['heroes'][$k]['xp'] = $xp;
            $rep['heroes'][$k]['gold'] = $gold;
            $rep['heroes'][$k]['materials'] = $mats;
            $this->addXp($h, $xp);
            $this->earnMarks($h, $rep['heroes'][$k] ?? []);
            if ($h->guild) {
                $h->guild->xp += (int) round($units);
            }
        }
        $b->party->battlesTogether++;

        // The group chest: each boss may drop an item, the later ones more often. Never guaranteed.
        $chest = [];
        foreach (array_slice(array_values(array_filter($plan, fn ($x) => $x[0] === 'boss')), 0, $rep['bossesKilled']) as $n => [, $boss]) {
            if ($r->getFloat(0, 1) < self::BOSS_DROP[$n]) {
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
            ? sprintf('%s: the group fell after %d of %d bosses. %s', Simulator::DUNGEON_NAME, $rep['bossesKilled'], 3, $rep['cause']).$loot
            : sprintf('%s cleared!', Simulator::DUNGEON_NAME).$loot;
        if ($rep['wiped']) {
            // A wipe stops the chain: the group rests until someone comes back, changes what they need and sends it in.
            $b->party->running = false;
            $line .= ' The group rests until someone sends it back in.';
        }
        $this->post('party:'.$b->party->id, $line, ['type' => 'report', 'battle' => $b->id]);
        foreach ($heroes as $h) {
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

    private function earnMarks(Hero $h, array $row): void
    {
        $c = $h->career;
        $marks = $h->marks;
        if (($c['battles'] ?? 0) >= 1) {
            $marks[] = 'firstBattle';
        }
        if (($c['bossKills'] ?? 0) >= 100) {
            $marks[] = 'centurion';
        }
        if (($row['deaths'] ?? 0) >= 3) {
            $marks[] = 'scarred';
        }
        if (($row['mechanics']['busterBlocked'] ?? 0) >= 3) {
            $marks[] = 'dentedShield';
        }
        $h->marks = array_values(array_unique($marks));
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
