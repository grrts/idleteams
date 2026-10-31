<?php

namespace App\Service;

use App\Entity\Battle;
use App\Entity\ChatMessage;
use App\Entity\ChatReport;
use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Party;
use App\Entity\PartyRequest;
use App\Entity\TavernPost;
use App\Entity\User;
use App\Game\Combatants;
use App\Game\Heritage;
use App\Game\LifeStory;
use App\Game\Items;
use App\Game\Legends;
use App\Game\Rules;
use App\Game\Dungeons;
use App\Game\Stats;
use App\Game\Talents;
use Doctrine\ORM\EntityManagerInterface;

/** Turns entities into the JSON the menus read. */
class Present
{
    public function __construct(private EntityManagerInterface $em, private Game $game, private WebPush $push)
    {
    }

    /** Everything the client needs that never changes while the server runs. */
    public function config(): array
    {
        $classes = [];
        foreach (Rules::CLASSES as $id => $c) {
            $classes[$id] = $c + ['allSkills' => Rules::classSkills($id)];
        }

        return [
            'attributes' => Rules::ATTRIBUTES, 'races' => Rules::RACES, 'origins' => Rules::ORIGINS, 'originPoints' => Rules::ORIGIN_POINTS,
            'classes' => $classes, 'keystones' => Rules::KEYSTONES, 'slots' => Rules::SLOTS, 'bases' => Rules::BASES,
            'rarities' => Rules::RARITIES, 'glyphs' => Rules::GLYPHS, 'powers' => Rules::LEGENDARY_POWERS, 'caps' => Stats::CAPS,
            'pointsPerLevel' => Rules::POINTS_PER_LEVEL, 'softCapShare' => Rules::SOFT_CAP_SHARE, 'oathLevel' => Rules::OATH_LEVEL,
            'pathLevel' => Rules::PATH_LEVEL, 'keystoneLevels' => Rules::KEYSTONE_LEVELS, 'ultimateLevel' => Rules::ULTIMATE_LEVEL,
            'signatureLevel' => Rules::SIGNATURE_LEVEL, 'legendLevel' => Legends::LEVEL, 'scarceRolls' => Rules::SCARCE_ROLLS, 'mentorLevel' => Rules::MENTOR_LEVEL, 'mentorBonus' => Rules::MENTOR_BONUS, 'signatureTraits' => Rules::SIGNATURE_TRAITS,
            'reforgeLevel' => Rules::REFORGE_LEVEL, 'loadoutSize' => Rules::LOADOUT_SIZE, 'maxSkillRank' => HeroActions::MAX_RANK,
            'dungeon' => self::dungeon(Dungeons::get()), 'dungeons' => array_map(self::dungeon(...), Dungeons::all()), 'battleSeconds' => $this->game->battleSeconds(), 'partySize' => Party::SIZE,
            'marks' => HeroActions::MARKS,
            'cultures' => array_map(fn ($t) => array_map(fn ($c) => $c[0], $t['cultures']), Heritage::TREES),
            'cultureInfo' => array_map(fn ($t) => array_map(fn ($c) => [$c[0], $c[1]], $t['cultures']), Heritage::TREES),
            'talentPointsPerLevel' => Talents::POINTS_PER_LEVEL, 'treeShape' => ['talent' => Talents::SHAPE, 'heritage' => Heritage::SHAPE],
            'backstories' => Heritage::backstoryInfo(), 'backstoryNodes' => Heritage::BACKSTORY_NODES, 'backstoryRenown' => Heritage::BACKSTORY_RENOWN,
            'lifeStory' => ['chapters' => LifeStory::CHAPTERS, 'questions' => LifeStory::QUESTIONS, 'scenes' => LifeStory::SCENES, 'tale' => LifeStory::TALE, 'notesMax' => LifeStory::NOTES_MAX, 'lean' => [LifeStory::LEAN_ATTRS, LifeStory::LEAN_POINTS]],
            'pushKey' => $this->push->enabled() ? $this->push->publicKey() : null,
            'renown' => ['alone' => Heritage::RENOWN_ALONE, 'perKin' => Heritage::RENOWN_PER_KIN, 'swapGold' => Heritage::CULTURE_SWAP_GOLD],
        ];
    }

    /** What the client needs of a dungeon: names, plan, wings and scenery, enemy art. */
    public static function dungeon(array $d): array
    {
        return [
            'id' => $d['id'], 'name' => $d['name'], 'summary' => $d['summary'], 'levels' => $d['levels'], 'lore' => $d['lore'], 'plan' => Dungeons::plan($d),
            'wings' => $d['wings'], 'enemies' => array_column(array_values($d['enemies']), null, 'name'),
            'bosses' => array_column(array_map(fn ($b) => ['name' => $b['name'], 'lore' => $b['lore'] ?? null, 'art' => $b['art'], 'tint' => $b['tint'] ?? null, 'scale' => $b['scale'], 'hit' => $b['hit']], array_values($d['bosses'])), null, 'name'),
            'mechanics' => array_map(fn ($m) => $m['name'], $d['mechanics']),
        ];
    }

    public function signature(Hero $h): ?array
    {
        if (!$h->signature) {
            return $h->level >= Rules::SIGNATURE_LEVEL ? ['open' => true] : null;
        }
        $m = Rules::signatureMastery($h->signatureXp);
        $base = Rules::classSkills($h->cls)[$h->signature][0];

        return [
            'open' => false, 'skill' => $h->signature, 'skillName' => $base, 'name' => $h->signatureName ?: $base,
            'mastery' => $m, 'xp' => $h->signatureXp, 'from' => Rules::signatureXpFor($m), 'next' => Rules::signatureXpFor($m + 1),
            'traits' => Rules::signatureTraits($m), 'power' => round((1 + 0.01 * $m) * 1.1 ** Rules::signatureTraits($m)['potent'] - 1, 3),
            'inLoadout' => in_array($h->signature, [...$this->game->loadout($h), Rules::CLASSES[$h->cls]['ultimate'][0]], true),
        ];
    }

    /** The Legend panel: nothing before level 50, both forms of the Path to choose from, then the form taken. */
    public function legend(Hero $h): ?array
    {
        if ($h->level < Legends::LEVEL || !$h->path) {
            return null;
        }
        $view = fn (string $id, array $f) => [
            'id' => $id, 'title' => $f[0], 'titled' => Legends::titled($h->name, $h->path, $id), 'flavour' => $f[1], 'capstone' => $f[2],
            'capstoneText' => Talents::describe(['stat' => $f[3]]), 'ultimate' => $f[4],
            'ultimateText' => Talents::describe(['skill' => Legends::effect($h->cls, $h->path, $id)['skill']], 1, $h->cls),
        ];
        if ($h->legend && ($f = Legends::get($h->path, $h->legend))) {
            return ['open' => false, 'form' => $view($h->legend, $f)];
        }

        return ['open' => true, 'forms' => array_values(array_map($view, array_keys(Legends::forPath($h->path)), Legends::forPath($h->path)))];
    }

    /** A hero card other players see: name, look, level, role and a few highlights. */
    public function heroCard(Hero $h): array
    {
        return [
            'id' => $h->id, 'name' => $h->name, 'race' => $h->race, 'culture' => $h->culture, 'backstory' => $h->backstory, 'heritageRank' => $h->heritageRank(), 'cls' => $h->cls, 'origin' => $h->origin, 'path' => $h->path,
            'legend' => $h->legend, 'title' => Legends::get($h->path, $h->legend)[0] ?? null, 'newcomer' => $h->isNewcomer(),
            'role' => $h->role(), 'level' => $h->level, 'look' => $this->game->look($h), 'marks' => $h->marks,
            'guild' => $h->guild ? ['id' => $h->guild->id, 'name' => $h->guild->name, 'tag' => $h->guild->tag] : null,
            'party' => $h->party?->id, 'keystones' => $h->keystones, 'codex' => count($h->codex), 'demo' => $h->user->demo,
        ];
    }

    /** The full sheet for the hero's own player. */
    public function hero(Hero $h): array
    {
        $build = $this->game->build($h);
        $attrs = Stats::attributes($build);
        $stats = Stats::derive($build);
        $L = $h->level;
        $curves = [];
        foreach (['crit' => 'precision', 'haste' => 'swiftness', 'cdr' => 'focus', 'dodge' => 'agility', 'resist' => 'resolve', 'mega' => 'ferocity'] as $stat => $attr) {
            $curves[$stat] = ['attr' => $attr, 'points' => round($attrs['total'][$attr], 1)];
        }
        $avail = Combatants::available($h->cls, $L, $h->path, $h->talents);
        $teachers = [];
        foreach (Talents::tree($h->cls)['nodes'] as $nid => $n) {
            if (isset($n['effect']['grant'])) {
                $teachers[$n['effect']['grant']] = $nid;
            }
        }
        $skills = [];
        foreach (Rules::classSkills($h->cls) as $id => $s) {
            $skills[] = [
                'id' => $id, 'name' => $s[0], 'level' => $s[1], 'type' => $s[2], 'mult' => $s[3], 'cost' => $s[4], 'cd' => $s[5],
                'opts' => $s[6], 'source' => $s[7], 'rank' => max(1, $h->skillRanks[$id] ?? 1), 'talent' => $teachers[$id] ?? null,
                'talentName' => isset($teachers[$id]) ? Talents::tree($h->cls)['nodes'][$teachers[$id]]['name'] : null,
                'unlocked' => $s[7] === 'ultimate' ? $L >= Rules::ULTIMATE_LEVEL : isset($avail[$id]),
            ];
        }
        $twists = [];
        foreach (Stats::twists($h->cls, Stats::effective($attrs['total']), $L) as $a => [$now, $per]) {
            $twists[$a] = ['per' => $per, 'now' => isset(Rules::TWISTS[$h->cls][$a]['as']) ? $per : Talents::describe($now)];
        }
        $rank = $h->heritageRank();
        $others = [];
        foreach ($h->party?->members ?? [] as $m) {
            if ($m !== $h) {
                $others[] = [$m->race, $m->culture, $m->backstory];
            }
        }
        $openKeystones = [];
        foreach ($this->keystoneLevels($L) as $kl) {
            if (!isset($h->keystones[$kl])) {
                $openKeystones[] = $kl;
            }
        }

        return $this->heroCard($h) + [
            'xp' => (int) $h->xp, 'xpNext' => Rules::xpForLevel($L), 'oathTaken' => $h->oathTaken,
            'points' => ['total' => $h->totalPoints(), 'unspent' => $h->unspentPoints(), 'spent' => (object) $h->spent, 'carved' => (object) $h->carved],
            'attributes' => $attrs['total'], 'sources' => $attrs['sources'], 'effective' => Stats::effective($attrs['total']),
            'stats' => $stats, 'k' => Stats::k($L), 'curves' => $curves,
            'skills' => $skills, 'skillPoints' => $h->skillPoints(), 'loadout' => $this->game->loadout($h),
            'signature' => $this->signature($h), 'legendForm' => $this->legend($h),
            'bonusRolls' => $h->bonusRolls,
            'prologue' => !$h->prologueDone && $h->level <= 2 && ($h->career['battles'] ?? 0) === 0,
            'openKeystones' => $openKeystones, 'codexPowers' => $h->codex, 'career' => (object) $h->career,
            'gold' => (int) $h->gold, 'materials' => $h->materials, 'essence' => $h->essence, 'lootPolicy' => $h->lootPolicy,
            'resonance' => Stats::resonance($build['items']), 'guildRank' => $h->guildRank,
            'twists' => $twists,
            'talents' => (object) $h->talents, 'talentPoints' => ['total' => Talents::points($L), 'free' => $h->talentPoints()],
            'talentTotal' => Talents::describe(Talents::total(Talents::tree($h->cls), $h->talents), 1, $h->cls),
            'story' => $h->story ?: null, 'biography' => $h->story ? LifeStory::biography($h->race, $h->name, $h->story) : [],
            'heritageTotal' => Talents::describe(Talents::total(Heritage::tree($h->race), $h->heritage)),
            'treeVersion' => Talents::VERSION,
            'talentResetCost' => HeroActions::talentResetCost($h),
            'heritage' => (object) $h->heritage,
            'renown' => ['total' => $h->renown, 'rank' => $rank, 'from' => Heritage::renownFor($rank), 'to' => Heritage::renownFor($rank + 1), 'free' => $h->heritagePoints(), 'kin' => Heritage::kin($h->race, $h->culture, $others, $h->backstory)],
        ];
    }

    /** Keystone levels reached: 15, 25, 35, 45, then every 25 levels past 50. */
    public function keystoneLevels(int $level): array
    {
        $out = array_values(array_filter(Rules::KEYSTONE_LEVELS, fn ($l) => $l <= $level));
        for ($l = 75; $l <= $level; $l += 25) {
            $out[] = $l;
        }

        return $out;
    }

    public function item(Item $i, ?Hero $viewer = null): array
    {
        $spec = Items::spec($i);
        $out = $spec + ['name' => Items::name($spec), 'owner' => $i->owner ? ['id' => $i->owner->id, 'name' => $i->owner->name] : null];
        if ($viewer && $i->slot !== 'glyph') {
            $out['score'] = Stats::itemScore($spec, $viewer->cls);
            $out['base_stats'] = array_map(fn ($v) => round($v, 1), Stats::itemBase($spec));
        }

        return $out;
    }

    /** @return array[] */
    public function inventory(Hero $h): array
    {
        $items = $this->em->getRepository(Item::class)->findBy(['owner' => $h], ['id' => 'DESC']);

        return array_map(fn (Item $i) => $this->item($i, $h), $items);
    }

    public function party(?Party $p, Hero $viewer): ?array
    {
        if (!$p) {
            return null;
        }
        $requests = [];
        foreach ($this->em->getRepository(PartyRequest::class)->findBy(['party' => $p]) as $r) {
            $requests[] = $this->request($r);
        }

        return [
            'id' => $p->id, 'name' => $p->name, 'leader' => $p->leader?->id, 'dungeonOffset' => $p->dungeonOffset,
            'running' => $p->running, 'battlesTogether' => $p->battlesTogether, 'dungeonLevel' => $this->game->dungeonLevel($p),
            'dungeon' => $this->game->dungeonFor($p)['id'], 'dungeonPick' => $p->dungeon, 'unlocked' => array_keys(Dungeons::unlocked($this->game->medianLevel($p))),
            'members' => array_map(fn (Hero $m) => $this->heroCard($m), $p->members->toArray()),
            'requests' => $p->leader === $viewer ? $requests : array_values(array_filter($requests, fn ($r) => $r['hero']['id'] === $viewer->id)),
        ];
    }

    public function request(PartyRequest $r): array
    {
        return ['id' => $r->id, 'kind' => $r->kind, 'message' => $r->message, 'party' => ['id' => $r->party->id, 'name' => $r->party->name, 'size' => $r->party->members->count()], 'hero' => $this->heroCard($r->hero), 'createdAt' => $r->createdAt];
    }

    public function tavernPost(TavernPost $t): array
    {
        return [
            'id' => $t->id, 'kind' => $t->kind, 'text' => $t->text, 'roles' => $t->roles, 'createdAt' => $t->createdAt,
            'author' => $this->heroCard($t->author),
            'party' => $t->party ? ['id' => $t->party->id, 'name' => $t->party->name, 'members' => array_map(fn (Hero $m) => $this->heroCard($m), $t->party->members->toArray())] : null,
        ];
    }

    public function guild(Guild $g, bool $roster = false): array
    {
        $out = ['id' => $g->id, 'name' => $g->name, 'tag' => $g->tag, 'motto' => $g->motto, 'xp' => $g->xp, 'level' => $this->guildLevel($g->xp), 'size' => $g->members->count(), 'max' => Guild::MAX_MEMBERS];
        if ($roster) {
            $members = $g->members->toArray();
            usort($members, fn (Hero $a, Hero $b) => $b->level <=> $a->level);
            $out['members'] = array_map(fn (Hero $m) => $this->heroCard($m) + ['rank' => $m->guildRank, 'lastSeen' => $m->user->demo ? null : $m->user->lastSeenAt], $members);
        }

        return $out;
    }

    public function guildLevel(int $xp): int
    {
        return 1 + (int) floor(sqrt($xp / 20));
    }

    /** @return array<array{id:int,name:string}> heroes this account has blocked */
    public function blocked(User $u): array
    {
        $ids = $u->blockedIds();
        if (!$ids) {
            return [];
        }

        return array_map(fn (Hero $h) => ['id' => $h->id, 'name' => $h->name], $this->em->getRepository(Hero::class)->findBy(['id' => $ids]));
    }

    public function report(ChatReport $r): array
    {
        return ['id' => $r->id, 'message' => $r->message->id, 'channel' => $r->message->channel, 'body' => $r->body, 'reason' => $r->reason, 'at' => $r->createdAt,
            'author' => ['user' => $r->target->username, 'hero' => $r->message->author?->name, 'mutedUntil' => $r->target->isMuted() ? $r->target->mutedUntil : 0],
            'reporter' => $r->reporter->username];
    }

    public function chat(ChatMessage $m): array
    {
        return ['id' => $m->id, 'channel' => $m->channel, 'body' => $m->body, 'card' => $m->card, 'at' => $m->createdAt, 'author' => $m->author ? ['id' => $m->author->id, 'name' => $m->author->name, 'cls' => $m->author->cls] : null];
    }

    /** A battle for playback (running) or for its report and chest (chest, done). */
    public function battle(Battle $b, ?Hero $viewer, bool $withTimeline): array
    {
        $chest = [];
        foreach ($b->chest as $idx => $c) {
            $spec = $c['spec'];
            $chest[] = [
                'idx' => $idx, 'item' => $spec + ['name' => Items::name($spec), 'score' => $viewer && $spec['slot'] !== 'glyph' ? Stats::itemScore($spec, $viewer->cls) : null],
                'upgrade' => $viewer ? $this->game->isUpgrade($viewer, $spec) : false,
                'rolls' => (object) $c['rolls'], 'numbers' => (object) ($c['numbers'] ?? []), 'winner' => $c['winner'],
            ];
        }

        return [
            'id' => $b->id, 'state' => $b->state, 'dungeon' => $b->dungeon, 'dungeonLevel' => $b->dungeonLevel, 'startedAt' => $b->startedAt, 'endsAt' => $b->endsAt,
            'chestClosesAt' => $b->chestClosesAt, 'roster' => $b->roster,
            'report' => $b->state === 'running' ? null : $b->report,
            'timeline' => $withTimeline && $b->state === 'running' ? $b->timeline : null,
            'chest' => $b->state === 'running' ? [] : $chest,
        ];
    }
}
