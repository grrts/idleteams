<?php

namespace App\Game;

/**
 * Builds the big talent and heritage maps. A map is a root with branches fanned out around it. A branch has an odd
 * number of lanes: the middle lane (the spine) starts next to the root and the others fork off further out. Every
 * node links to the one before it in its lane. On hub rings, neighbouring lanes link across, and so do the outer
 * lanes of neighbouring branches of the same culture, so there are many ways through. A node can be learned once a
 * node linked to it is learned (the root needs nothing).
 *
 * Branch spec: [id, name, theme, colour, culture|null, spine, lanes] where
 *   spine = [a => effect, b => effect, hubs => [depth => [name|null, effect, kind]], end => [name, effect]]
 *   lanes = [lane => [minor => effect, notable => effect, end => [name|null, effect, kind]]]
 * Shape: [starts => [lane => first depth], depth, hub, value, cls|null]. Value scales every node but keystones and
 * skills, so the same handwritten numbers can be tuned for how many points the map hands out.
 */
final class TreeMap
{
    public const R0 = 70;
    public const STEP = 34;

    private const ADJ = [
        'Ancient', 'Steady', 'Gleaming', 'Grim', 'Bold', 'Endless', 'Hidden', 'Burning', 'Silent', 'Iron', 'Golden', 'Wild',
        'Ashen', 'Starlit', 'Deep', 'Fierce', 'Patient', 'Bright', 'Restless', 'Sacred', 'Cold', 'Hungry', 'Sworn', 'Rising',
        'Shattered', 'Proud', 'Quiet', 'Living', 'Brazen', 'Unbroken', 'Wandering', 'Thundering', 'Hallowed', 'Crimson',
        'Verdant', 'Sunlit', 'Moonlit', 'Twin', 'Last', 'First',
    ];

    private const NOUN = [
        'block' => ['Bulwark', 'Rampart', 'Bastion', 'Wall', 'Gate'], 'threat' => ['Challenge', 'Glare', 'Roar', 'Banner', 'Call'],
        'hp' => ['Heart', 'Frame', 'Oak', 'Mountain', 'Root'], 'dmg' => ['Edge', 'Wrath', 'Blade', 'Fang', 'Hammer'],
        'heal' => ['Mercy', 'Grace', 'Hymn', 'Light', 'Spring'], 'crit' => ['Eye', 'Mark', 'Needle', 'Star', 'Point'],
        'critDmg' => ['Ruin', 'Cleaver', 'Talon', 'Verdict', 'Storm'], 'haste' => ['Gale', 'Rush', 'Tempo', 'Spark', 'Current'],
        'cdr' => ['Rhythm', 'Patience', 'Breath', 'Clockwork', 'Cycle'], 'dodge' => ['Shadow', 'Wind', 'Step', 'Mist', 'Feather'],
        'regen' => ['Sap', 'Bloom', 'Mending', 'Wellspring', 'Moss'], 'taken' => ['Hide', 'Shell', 'Stone', 'Ward', 'Scale'],
        'resRegen' => ['Font', 'Tide', 'Well', 'Wellspring', 'River'], 'rageGain' => ['Blood', 'Fury', 'Pyre', 'Ember', 'Howl'],
        'healRecv' => ['Vessel', 'Chalice', 'Cradle', 'Hearth', 'Haven'], 'fortune' => ['Coin', 'Purse', 'Crown', 'Hoard', 'Charm'],
        'xp' => ['Lesson', 'Tome', 'Memory', 'Scroll', 'Path'], 'lifesteal' => ['Thirst', 'Leech', 'Feast', 'Maw', 'Bloodline'],
        'kin' => ['Kinship', 'Clan', 'Hearth', 'Bond', 'Blood'], 'renown' => ['Saga', 'Legend', 'Song', 'Name', 'Glory'],
        'cost' => ['Thrift', 'Economy', 'Discipline', 'Measure', 'Restraint'],
        'offense' => ['Edge', 'Strike', 'Fang', 'Spear', 'Ember'], 'tempo' => ['Gale', 'Pulse', 'Rhythm', 'Spark', 'Dance'],
        'defense' => ['Bastion', 'Aegis', 'Mantle', 'Anvil', 'Shell'], 'sustain' => ['Bloom', 'Spring', 'Root', 'Vigil', 'Ember'],
        'resources' => ['Font', 'Reserve', 'Well', 'Hoard', 'Furnace'], 'group' => ['Banner', 'Oath', 'Anthem', 'Covenant', 'Crown'],
        'type' => ['Art', 'Form', 'School', 'Way', 'Craft'], 'default' => ['Vigil', 'Oath', 'Rune', 'Echo', 'Pact'],
    ];

    private const SKILL_NOUN = ['Mastery', 'Drills', 'Form', 'Discipline', 'Secrets', 'Technique'];

    public const STAT_NAME = [
        'dmg' => 'Damage', 'heal' => 'Healing', 'hp' => 'Max Health', 'threat' => 'Threat', 'taken' => 'Toughness', 'crit' => 'Crit Chance',
        'critDmg' => 'Crit Damage', 'haste' => 'Haste', 'cdr' => 'Cooldowns', 'dodge' => 'Dodge', 'block' => 'Block', 'regen' => 'Regen',
        'resRegen' => 'Resource Regen', 'rageGain' => 'Rage', 'healRecv' => 'Healing Received', 'fortune' => 'Fortune', 'xp' => 'Experience',
        'lifesteal' => 'Lifesteal',
    ];

    public const TYPE_NAME = [
        'strike' => 'Strikes', 'aoe' => 'Area Skills', 'heal' => 'Heals', 'groupheal' => 'Group Heals', 'hot' => 'Heals over Time',
        'shield' => 'Shields', 'wall' => 'Walls', 'mark' => 'Marks', 'slow' => 'Slows', 'dot' => 'Damage over Time', 'pet' => 'Companions', 'buff' => 'Self Buffs',
    ];

    /** The effect multiplied by f (attribute points stay whole and at least 1). */
    public static function scale(array $e, float $f): array
    {
        $out = [];
        foreach ($e as $k => $v) {
            if ($k === 'attr') {
                foreach ($v as $a => $n) {
                    $out['attr'][$a] = max(1, (int) round($n * $f));
                }
            } elseif (in_array($k, ['stat', 'type', 'skill'], true)) {
                foreach ($v as $x => $n) {
                    $out[$k][$x] = round($n * $f, 4);
                }
            } elseif (in_array($k, ['cost', 'kin', 'renown'], true)) {
                $out[$k] = round($v * $f, 4);
            }
        }

        return $out;
    }

    /** Two effects added together. */
    public static function merge(array ...$effects): array
    {
        $out = [];
        foreach ($effects as $e) {
            foreach ($e as $k => $v) {
                if (is_array($v)) {
                    foreach ($v as $x => $n) {
                        $out[$k][$x] = round(($out[$k][$x] ?? 0) + $n, 4);
                    }
                } elseif ($k === 'grant') {
                    $out['grant'] = $v;
                } else {
                    $out[$k] = round(($out[$k] ?? 0) + $v, 4);
                }
            }
        }

        return $out;
    }

    /** The word that names what an effect does most. */
    private static function key(array $e): array
    {
        if (!empty($e['grant'])) {
            return ['grant', $e['grant']];
        }
        foreach (['skill', 'type', 'stat', 'attr'] as $k) {
            if (!empty($e[$k])) {
                return [$k, array_key_first($e[$k])];
            }
        }
        foreach (['kin', 'renown', 'cost'] as $k) {
            if (!empty($e[$k])) {
                return [$k, $k];
            }
        }

        return ['default', 'default'];
    }

    public static function minorName(array $e, ?string $cls): string
    {
        [$k, $x] = self::key($e);

        return match ($k) {
            'attr' => Rules::ATTRIBUTES[$x][0],
            'stat' => self::STAT_NAME[$x] ?? ucfirst($x),
            'type' => self::TYPE_NAME[$x] ?? ucfirst($x),
            'skill' => $cls ? (Rules::classSkills($cls)[$x][0] ?? $x) : $x,
            'kin' => 'Kinship', 'renown' => 'Renown', 'cost' => 'Thrift',
            default => 'Talent',
        };
    }

    /** A name for a notable, unique within the map. */
    public static function notableName(array $e, string $seed, ?string $cls, array &$used): string
    {
        [$k, $x] = self::key($e);
        $h = crc32($seed);
        for ($try = 0; $try < 40; ++$try) {
            if ($k === 'skill' && $cls) {
                $name = (Rules::classSkills($cls)[$x][0] ?? $x).' '.self::SKILL_NOUN[($h + $try) % count(self::SKILL_NOUN)];
            } else {
                $nouns = match ($k) {
                    'stat' => self::NOUN[$x] ?? self::NOUN['default'],
                    'attr' => self::NOUN[Rules::ATTRIBUTES[$x][1]] ?? self::NOUN['default'],
                    'type' => self::NOUN['type'],
                    default => self::NOUN[$x] ?? self::NOUN['default'],
                };
                $adj = self::ADJ[($h + 7 * $try) % count(self::ADJ)];
                $noun = $nouns[intdiv($h, 7) % count($nouns)];
                if ($k === 'type') {
                    $name = $adj.' '.(self::TYPE_NAME[$x] ?? $x);
                } else {
                    $name = $adj.' '.$noun;
                }
            }
            if (!isset($used[$name])) {
                break;
            }
            $h = crc32($seed.$try);
        }
        $used[$name] = true;

        return $name;
    }

    /** Lays out the map and returns [root, branches => [[id, name, theme, colour, culture, nodeIds]], nodes, size]. */
    public static function build(array $root, array $branches, array $shape): array
    {
        [$rootName, $rootEffect] = $root;
        $cls = $shape['cls'] ?? null;
        $starts = $shape['starts'];
        $depth = $shape['depth'];
        $hub = $shape['hub'];
        $mid = intdiv(count($starts), 2);
        $nb = count($branches);
        $used = [];
        $nodes = ['root' => self::node('root', $rootName, 'root', $rootEffect, 0, 0, null, null, $cls)];
        $out = [];
        $at = fn (string $bid, int $j, int $d) => $bid.'.'.$j.'.'.$d;
        foreach ($branches as $k => [$bid, $bname, $theme, $colour, $culture, $spine, $lanes]) {
            $theta = -M_PI / 2 + $k * 2 * M_PI / $nb;
            $ids = [];
            // Inner lanes first, so a lane can link across to the one on its spine side.
            $order = array_keys($starts);
            usort($order, fn ($p, $q) => abs($p - $mid) <=> abs($q - $mid) ?: $p <=> $q);
            foreach ($order as $j) {
                $start = $starts[$j];
                for ($d = $start; $d <= $depth; ++$d) {
                    $r = self::R0 + self::STEP * $d;
                    $lat = ($j - $mid) * max(38, 0.075 * $r);
                    $a = $theta + $lat / $r;
                    $x = (int) round(cos($a) * $r);
                    $y = (int) round(sin($a) * $r);
                    $id = $at($bid, $j, $d);
                    $seed = ($cls ?? 'h').$id;
                    if ($j === $mid) {
                        if ($d === $depth) {
                            [$name, $effect] = $spine['end'];
                            $kind = 'capstone';
                        } elseif (isset($spine['hubs'][$d])) {
                            [$name, $effect, $kind] = $spine['hubs'][$d];
                            $name ??= self::notableName($effect, $seed, $cls, $used);
                        } else {
                            $effect = $d % 2 ? $spine['a'] : $spine['b'];
                            $kind = 'minor';
                            $name = self::minorName($effect, $cls);
                        }
                    } else {
                        $lane = $lanes[$j];
                        if ($d === $depth) {
                            [$name, $effect, $kind] = $lane['end'];
                            $name ??= self::notableName($effect, $seed, $cls, $used);
                        } elseif ($d % $hub === 0) {
                            $effect = $lane['notable'];
                            $kind = 'notable';
                            $name = self::notableName($effect, $seed, $cls, $used);
                        } else {
                            $effect = $lane['minor'];
                            $kind = 'minor';
                            $name = self::minorName($effect, $cls);
                        }
                    }
                    if ($kind !== 'keystone' && empty($effect['grant'])) {
                        $effect = self::scale($effect, $shape['value'] ?? 1.0);
                    }
                    $n = self::node($id, $name, $kind, $effect, $x, $y, $bid, $culture, $cls);
                    // Back along the lane, or to the inner lane it forks from.
                    if ($d === $start) {
                        $prev = $j === $mid ? 'root' : $at($bid, $j + ($j < $mid ? 1 : -1), $d - 1);
                    } else {
                        $prev = $at($bid, $j, $d - 1);
                    }
                    $nodes[$id] = $n;
                    self::link($nodes, $id, $prev);
                    // Hub rings: across to the lane on the spine side.
                    if ($d % $hub === 0 && $j !== $mid && $d > $start) {
                        $inner = $at($bid, $j + ($j < $mid ? 1 : -1), $d);
                        if (isset($nodes[$inner])) {
                            self::link($nodes, $id, $inner);
                        }
                    }
                    $ids[] = $id;
                }
            }
            $out[] = [$bid, $bname, $theme, $colour, $culture, $ids];
        }
        // Hub rings: the outer lanes of neighbouring branches of the same culture meet.
        $last = count($starts) - 1;
        foreach ($branches as $k => $b) {
            $nbk = $branches[($k + $nb - 1) % $nb];
            if ($nb < 2 || $b[4] !== $nbk[4]) {
                continue;
            }
            for ($d = $hub; $d < $depth; $d += $hub) {
                $p = $at($b[0], 0, $d);
                $q = $at($nbk[0], $last, $d);
                if (isset($nodes[$p], $nodes[$q])) {
                    self::link($nodes, $p, $q);
                }
            }
        }
        $size = self::R0 + self::STEP * $depth + 60;

        return ['root' => 'root', 'branches' => $out, 'nodes' => $nodes, 'size' => $size];
    }

    private static function link(array &$nodes, string $a, string $b): void
    {
        if (!in_array($b, $nodes[$a]['links'], true)) {
            $nodes[$a]['links'][] = $b;
            $nodes[$b]['links'][] = $a;
        }
    }

    private static function node(string $id, string $name, string $kind, array $effect, int $x, int $y, ?string $branch, ?string $culture, ?string $cls): array
    {
        return [
            'id' => $id, 'name' => $name, 'kind' => $kind, 'max' => 1, 'effect' => $effect, 'links' => [], 'x' => $x, 'y' => $y,
            'branch' => $branch, 'culture' => $culture, 'desc' => Talents::describe($effect, 1, $cls),
        ];
    }

    /** Whether one node can be learned now. Returns an error message or null. */
    public static function check(array $tree, array $have, string $id, int $free, ?string $culture = null): ?string
    {
        $n = $tree['nodes'][$id] ?? null;
        if (!$n) {
            return 'Unknown talent.';
        }
        if (($have[$id] ?? 0) >= $n['max']) {
            return 'You already have that.';
        }
        if ($n['culture'] !== null && $n['culture'] !== $culture) {
            return 'That belongs to another culture. Follow it first.';
        }
        if ($id !== $tree['root'] && !self::touches($n, $have)) {
            return 'Connect it to something you have learned first.';
        }
        if ($free < 1) {
            return 'No points left.';
        }

        return null;
    }

    private static function touches(array $n, array $have): bool
    {
        foreach ($n['links'] as $l) {
            if (($have[$l] ?? 0) > 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * The shortest run of unlearned nodes that connects what is learned to $target, in learning order (the root
     * first when nothing is learned yet). Null when culture rules make it unreachable.
     */
    public static function path(array $tree, array $have, string $target, ?string $culture = null): ?array
    {
        if (!isset($tree['nodes'][$target])) {
            return null;
        }
        if (($have[$target] ?? 0) > 0) {
            return [];
        }
        $ok = fn (string $id) => $tree['nodes'][$id]['culture'] === null || $tree['nodes'][$id]['culture'] === $culture;
        $prev = [];
        $queue = [];
        foreach ($have as $id => $r) {
            if ($r > 0 && isset($tree['nodes'][$id])) {
                $prev[$id] = false;
                $queue[] = $id;
            }
        }
        if (!$queue) {
            $prev['root'] = false;
            $queue[] = 'root';
            if ($target === 'root') {
                return ['root'];
            }
        }
        for ($i = 0; $i < count($queue); ++$i) {
            foreach ($tree['nodes'][$queue[$i]]['links'] as $l) {
                if (array_key_exists($l, $prev) || !$ok($l)) {
                    continue;
                }
                $prev[$l] = $queue[$i];
                if ($l === $target) {
                    $path = [];
                    for ($x = $l; $x !== false && ($have[$x] ?? 0) < 1; $x = $prev[$x]) {
                        $path[] = $x;
                    }

                    return array_reverse($path);
                }
                $queue[] = $l;
            }
        }

        return null;
    }

    /** Learns nodes in plan order until the points run out (nodes that cannot be learned yet are skipped). */
    public static function auto(array $tree, array $plan, int $points, ?string $culture = null): array
    {
        $have = [];
        foreach ($plan as $id) {
            if ($points < 1) {
                break;
            }
            if (self::check($tree, $have, $id, $points, $culture) === null) {
                $have[$id] = 1;
                --$points;
            }
        }

        return $have;
    }

    /** Learned nodes that still exist in the map (older saves may hold ids from smaller trees). */
    public static function clean(array $tree, array $have): array
    {
        return array_filter($have, fn ($r, $id) => $r > 0 && isset($tree['nodes'][$id]), ARRAY_FILTER_USE_BOTH);
    }
}
