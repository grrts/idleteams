<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\User;
use App\Game\Combatants;
use App\Game\Heritage;
use App\Game\Items;
use App\Game\Rules;
use App\Game\Talents;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;

/** Character growth: creating a hero, spending points, Path, Keystones, talents, Heritage, skill ranks and the loadout. */
class HeroActions
{
    public const MAX_RANK = 10;

    /** Marks are earned, never bought, and shown on the hero card. */
    public const MARKS = [
        'firstBattle' => ['First Blood', 'Finished a first battle'],
        'oathsworn' => ['Oathsworn', 'Took the Oath at level 20'],
        'centurion' => ['Centurion', '100 bosses defeated'],
        'scarred' => ['Scarred', 'Died three times in one battle and kept going'],
        'dentedShield' => ['Dented Shield', 'Blocked three Tank Busters in one battle'],
        'legendFound' => ['Legend Finder', 'Won a legendary from a group chest'],
    ];

    /** Look keys the creator may set, with the values the pixel renderer knows. */
    private const LOOK = ['skin', 'hair', 'hairColor', 'eyes', 'eyeColor', 'mouth', 'beard', 'acc', 'build', 'height', 'dye1', 'dye2', 'metal'];

    public function __construct(private EntityManagerInterface $em, private Game $game, private Present $present)
    {
    }

    public function create(User $user, array $in): Hero
    {
        if ($this->em->getRepository(Hero::class)->findOneBy(['user' => $user])) {
            throw new GameError('You already have a hero.');
        }
        $name = trim((string) ($in['name'] ?? ''));
        if (!preg_match('/^[\p{L}][\p{L}\' -]{2,19}$/u', $name)) {
            throw new GameError('Names are 3 to 20 letters (spaces, hyphens and apostrophes are fine).');
        }
        if ($this->em->getRepository(Hero::class)->findOneBy(['name' => $name])) {
            throw new GameError('That name is taken.');
        }
        foreach (['race' => Rules::RACES, 'cls' => Rules::CLASSES, 'origin' => Rules::ORIGINS] as $k => $list) {
            if (!isset($list[$in[$k] ?? ''])) {
                throw new GameError("Pick a $k.");
            }
        }
        $look = [];
        foreach (self::LOOK as $k) {
            $v = $in['look'][$k] ?? null;
            if (is_string($v) && preg_match('/^[#a-zA-Z0-9]{1,16}$/', $v) || is_int($v) || is_float($v)) {
                $look[$k] = $v;
            }
        }
        $h = new Hero();
        $h->user = $user;
        $h->name = $name;
        $h->race = $in['race'];
        $h->cls = $in['cls'];
        $h->origin = $in['origin'];
        $h->look = $look;
        $h->createdAt = time();
        $this->em->persist($h);

        // Starter kit: plain commons in the class's own style. Everything after this drops, gets crafted or traded.
        $c = Rules::CLASSES[$h->cls];
        $r = new Randomizer(new Mt19937(crc32($name)));
        foreach ($c['kit'] as $slot => $base) {
            if ($base === 'none') {
                continue;
            }
            $item = Items::fromSpec(Items::generate($r, 1, 'common', $slot, $base, array_keys($c['suggest'])));
            $item->owner = $h;
            $item->equipped = $slot;
            $this->em->persist($item);
        }
        $this->game->post('tavern', sprintf('%s the %s %s arrived at the tavern.', $name, Rules::RACES[$h->race]['name'], $c['name']));

        return $h;
    }

    /** Spend (positive) or refund (negative) points. Points carved in at Oath Day can't be refunded. */
    public function spend(Hero $h, array $delta): void
    {
        $spent = $h->spent;
        foreach ($delta as $attr => $n) {
            if (!isset(Rules::ATTRIBUTES[$attr]) || !is_int($n)) {
                throw new GameError('Unknown attribute.');
            }
            $new = ($spent[$attr] ?? 0) + $n;
            if ($new < ($h->carved[$attr] ?? 0)) {
                throw new GameError(sprintf('%s points spent before your Oath are carved in.', Rules::ATTRIBUTES[$attr][0]));
            }
            $spent[$attr] = $new;
        }
        $spent = array_filter($spent);
        if (array_sum($spent) > $h->totalPoints()) {
            throw new GameError('Not enough unspent points.');
        }
        $h->spent = $spent;
    }

    /** The Path is picked at 10 and can be changed until the Oath at 20 seals it. */
    public function choosePath(Hero $h, string $path): void
    {
        if ($h->level < Rules::PATH_LEVEL) {
            throw new GameError('Paths open at level '.Rules::PATH_LEVEL.'.');
        }
        if ($h->oathTaken) {
            throw new GameError('Your Oath sealed your Path.');
        }
        if (!isset(Rules::CLASSES[$h->cls]['paths'][$path])) {
            throw new GameError('Unknown Path.');
        }
        $h->path = $path;
        $h->loadout = Combatants::defaultLoadout($h->cls, $h->level, $path, $h->talents);
    }

    /** Keystones are permanent: once picked at a level, that slot is filled for good. */
    public function chooseKeystone(Hero $h, int $level, string $id): void
    {
        if (!in_array($level, $this->present->keystoneLevels($h->level), true)) {
            throw new GameError('That Keystone level is not open yet.');
        }
        if (isset($h->keystones[$level])) {
            throw new GameError('That Keystone is already chosen.');
        }
        if (!isset(Rules::KEYSTONES[$h->role()][$id]) || in_array($id, $h->keystones, true)) {
            throw new GameError('Pick a Keystone you do not have yet.');
        }
        $ks = $h->keystones;
        $ks[$level] = $id;
        ksort($ks);
        $h->keystones = $ks;
        if (count($ks) === 1) {
            $this->game->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf('%s chose the %s Keystone.', $h->name, Rules::KEYSTONES[$h->role()][$id][0]));
        }
    }

    public function rankUp(Hero $h, string $skill): void
    {
        $all = Rules::classSkills($h->cls);
        if (!isset($all[$skill])) {
            throw new GameError('Unknown skill.');
        }
        $s = $all[$skill];
        $taught = $s[7] === 'talent' && isset(Talents::grants($h->cls, $h->talents)[$skill]);
        if ($s[1] > $h->level || ($s[7] !== 'core' && $s[7] !== 'ultimate' && $s[7] !== $h->path && !$taught)) {
            throw new GameError('You have not unlocked that skill.');
        }
        if ($h->skillPoints() < 1) {
            throw new GameError('No skill points left. You get one per level.');
        }
        $rank = max(1, $h->skillRanks[$skill] ?? 1);
        if ($rank >= self::MAX_RANK) {
            throw new GameError('That skill is at its highest rank.');
        }
        $ranks = $h->skillRanks;
        $ranks[$skill] = $rank + 1;
        $h->skillRanks = $ranks;
    }

    /** Skill points are free to move: resetting ranks costs nothing but a little gold. */
    public function resetRanks(Hero $h): void
    {
        $cost = 10 * $h->level;
        if ((int) $h->gold < $cost) {
            throw new GameError("Resetting skill ranks costs $cost gold.");
        }
        $h->gold = (string) ((int) $h->gold - $cost);
        $h->skillRanks = [];
    }

    public function setLoadout(Hero $h, array $ids): void
    {
        $avail = Combatants::available($h->cls, $h->level, $h->path, $h->talents);
        $ids = array_values(array_unique(array_filter($ids, 'is_string')));
        if (count($ids) > Rules::LOADOUT_SIZE) {
            throw new GameError('Your loadout holds '.Rules::LOADOUT_SIZE.' skills.');
        }
        foreach ($ids as $id) {
            if (!isset($avail[$id])) {
                throw new GameError('You cannot slot that skill.');
            }
        }
        $h->loadout = $ids;
    }

    /** Learns class talents in order (a whole path at once): all of them or none. */
    public function learnTalent(Hero $h, array $nodes): void
    {
        $tree = Talents::tree($h->cls);
        $t = $h->talents;
        $free = $h->talentPoints();
        if (!$nodes) {
            throw new GameError('Pick a talent.');
        }
        foreach ($nodes as $node) {
            if ($err = Talents::check($tree, $t, (string) $node, $free)) {
                throw new GameError($err === 'No points left.' ? 'Not enough talent points. You get two per level.' : $err);
            }
            $t[$node] = 1;
            --$free;
        }
        $h->talents = $t;
        foreach ($nodes as $node) {
            $n = $tree['nodes'][$node];
            if (in_array($n['kind'], ['capstone', 'keystone'], true)) {
                $this->game->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf('%s mastered %s.', $h->name, $n['name']), ['type' => 'hero', 'hero' => $h->id]);
            }
        }
    }

    /** Talents can be moved for gold; skills they taught leave the loadout. */
    public function resetTalents(Hero $h): void
    {
        $cost = self::talentResetCost($h);
        if ((int) $h->gold < $cost) {
            throw new GameError("Resetting talents costs $cost gold.");
        }
        $h->gold = (string) ((int) $h->gold - $cost);
        $h->talents = [];
        $avail = Combatants::available($h->cls, $h->level, $h->path);
        $h->loadout = array_values(array_filter($h->loadout, fn ($id) => isset($avail[$id])));
    }

    public static function talentResetCost(Hero $h): int
    {
        return 25 * $h->level;
    }

    /** Follow one culture of your race. Switching later costs gold and gives back the points in the old culture. */
    public function chooseCulture(Hero $h, string $culture): void
    {
        $tree = Heritage::tree($h->race);
        if (!isset($tree['cultures'][$culture])) {
            throw new GameError('Unknown culture.');
        }
        if (($h->heritage['root'] ?? 0) < 1) {
            throw new GameError(sprintf('Learn %s first.', $tree['nodes']['root']['name']));
        }
        if ($h->culture === $culture) {
            return;
        }
        if ($h->culture !== null) {
            $cost = Heritage::CULTURE_SWAP_GOLD * $h->level;
            if ((int) $h->gold < $cost) {
                throw new GameError("Following another culture costs $cost gold.");
            }
            $h->gold = (string) ((int) $h->gold - $cost);
            $h->heritage = array_filter($h->heritage, fn ($id) => $tree['nodes'][$id]['culture'] === null, ARRAY_FILTER_USE_KEY);
        }
        $h->culture = $culture;
        $this->game->post($h->guild ? 'guild:'.$h->guild->id : 'tavern', sprintf('%s now follows the ways of %s.', $h->name, $tree['cultures'][$culture][0]), ['type' => 'hero', 'hero' => $h->id]);
    }

    /** Learns Heritage nodes in order (a whole path at once): all of them or none. */
    public function learnHeritage(Hero $h, array $nodes): void
    {
        $tree = Heritage::tree($h->race);
        $t = $h->heritage;
        $free = $h->heritagePoints();
        if (!$nodes) {
            throw new GameError('Pick a node.');
        }
        foreach ($nodes as $node) {
            if ($err = Talents::check($tree, $t, (string) $node, $free, $h->culture)) {
                throw new GameError($err === 'No points left.' ? 'Not enough Heritage points. Run dungeons with your own race to earn Renown.' : $err);
            }
            $t[$node] = 1;
            --$free;
        }
        $h->heritage = $t;
    }

    public function setLootPolicy(Hero $h, string $policy): void
    {
        if (!in_array($policy, ['upgrades', 'greed', 'pass'], true)) {
            throw new GameError('Unknown loot setting.');
        }
        $h->lootPolicy = $policy;
    }

    /** Spends unspent points the class's suggested way. Used by the "suggest" button and by demo heroes. */
    public function autoSpend(Hero $h): void
    {
        $left = $h->unspentPoints();
        if ($left <= 0) {
            return;
        }
        $w = Rules::CLASSES[$h->cls]['suggest'];
        $sum = array_sum($w);
        $spent = $h->spent;
        $target = array_sum($spent) + $left;
        foreach ($w as $a => $n) {
            $want = (int) floor($target * $n / $sum);
            $add = max(0, min($left, $want - ($spent[$a] ?? 0)));
            $spent[$a] = ($spent[$a] ?? 0) + $add;
            $left -= $add;
        }
        $first = array_key_first($w);
        $spent[$first] = ($spent[$first] ?? 0) + $left;
        $h->spent = array_filter($spent);
    }

    /** Owned items not worn, for convenience. @return Item[] */
    public function bag(Hero $h): array
    {
        return $this->em->getRepository(Item::class)->findBy(['owner' => $h, 'equipped' => null, 'price' => null]);
    }
}
