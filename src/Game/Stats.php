<?php

namespace App\Game;

/**
 * Turns a build (race, class, Origin, level, spent points, worn items) into attributes and combat stats.
 * Every number comes from attributes or gear. Percentage stats follow a curve that gets steep past 50%
 * and never reaches 100%.
 *
 * A build is a plain array so heroes, reference heroes and tests share the same maths:
 * [race, cls, origin, level, spent => [attr => n], path, keystones => [lvl => id], items => [item spec, ...]]
 */
final class Stats
{
    public const CAPS = ['dodge' => 0.60, 'block' => 0.75, 'cdr' => 0.60, 'resist' => 0.80, 'dr' => 0.85, 'crit' => 0.95, 'mega' => 0.90];

    /** K in "points for p% = K * p / (1 - p)^2". Grows with level so an uncapped hero keeps the same curve shape. */
    public static function k(int $level): float
    {
        return 6 + 1.2 * max(1, $level);
    }

    /** Percentage reached with these points. */
    public static function curve(float $points, int $level): float
    {
        if ($points <= 0) {
            return 0.0;
        }
        $k = self::k($level);
        $b = 2 * $points + $k;

        return ($b - sqrt($b * $b - 4 * $points * $points)) / (2 * $points);
    }

    /** Points needed to reach a percentage. */
    public static function pointsFor(float $p, int $level): float
    {
        $p = min(0.999, max(0, $p));

        return self::k($level) * $p / ((1 - $p) ** 2);
    }

    public static function temperMult(array $item): float
    {
        return 1 + 0.03 * ($item['temper'] ?? 0);
    }

    /** Base stats an item brings by itself (before affixes): damage, health, armor, block. */
    public static function itemBase(array $item): array
    {
        $t = self::temperMult($item);
        $i = $item['ilvl'];
        $g = 1.045 ** $i;

        return match ($item['slot']) {
            'weapon' => ['damage' => 8 * $g * $t],
            'offhand' => match ($item['base']) {
                'shield' => ['armor' => $i * 0.6 * $t, 'block' => $i * 0.5 * $t, 'health' => 10 * $g * $t],
                'buckler' => ['armor' => $i * 0.3 * $t, 'block' => $i * 0.6 * $t, 'health' => 6 * $g * $t],
                default => ['damage' => 2.5 * $g * $t],
            },
            'top', 'bottom' => ['health' => 20 * $g * $t, 'armor' => $i * 0.15 * $t],
            'head', 'shoes', 'gloves', 'cape' => ['health' => 12 * $g * $t, 'armor' => $i * 0.08 * $t],
            default => [],
        };
    }

    /** Attribute totals with where each point comes from. */
    public static function attributes(array $build): array
    {
        $tot = array_fill_keys(array_keys(Rules::ATTRIBUTES), 0.0);
        $src = [];
        $add = function (string $attr, float $n, string $from) use (&$tot, &$src) {
            if ($n == 0) {
                return;
            }
            $tot[$attr] += $n;
            $src[$attr][] = [$from, round($n, 1)];
        };
        $race = Rules::RACES[$build['race']];
        foreach ($race['points'] as $a => $n) {
            $add($a, $n, $race['name']);
        }
        $cls = Rules::CLASSES[$build['cls']];
        foreach ($cls['points'] as $a => $n) {
            $add($a, $n, $cls['name']);
        }
        $origin = Rules::ORIGINS[$build['origin']];
        $add($origin[1], Rules::ORIGIN_POINTS, 'Origin: '.$origin[0]);
        foreach ($build['spent'] ?? [] as $a => $n) {
            $add($a, $n, 'Your points');
        }
        foreach ($build['items'] ?? [] as $item) {
            $t = self::temperMult($item);
            foreach ($item['affixes'] as [$a, $v]) {
                $add($a, $v * $t, Items::name($item));
            }
            foreach ($item['glyphs'] ?? [] as $gl) {
                if ($gl) {
                    $add(Rules::GLYPHS[$gl[0]][1], $gl[1], Rules::GLYPHS[$gl[0]][0].' glyph');
                }
            }
        }
        // Passives that change how an attribute counts.
        if (in_array('unmovable', $build['keystones'] ?? [], true)) {
            $add('resolve', $tot['resolve'] * 0.2, 'Keystone: Unmovable');
        }
        if ($build['race'] === 'draka') {
            $add('recovery', $tot['recovery'] * 0.1, 'Ember Heart');
        }

        return ['total' => $tot, 'sources' => $src];
    }

    /** Linear stats get a soft cap: past 20% of all your points in one attribute, each point counts half. */
    public static function effective(array $tot): array
    {
        $sum = max(1, array_sum($tot));
        $cap = Rules::SOFT_CAP_SHARE * $sum;
        $eff = [];
        foreach ($tot as $a => $n) {
            $eff[$a] = $n <= $cap ? $n : $cap + ($n - $cap) / 2;
        }

        return $eff;
    }

    public static function resonance(array $items): array
    {
        $count = [];
        foreach ($items as $item) {
            foreach ($item['glyphs'] ?? [] as $gl) {
                if ($gl) {
                    $count[$gl[0]] = ($count[$gl[0]] ?? 0) + 1;
                }
            }
        }
        $out = [];
        foreach ($count as $theme => $n) {
            $tier = min(3, intdiv($n, 3));
            if ($tier > 0) {
                $out[$theme] = $tier;
            }
        }

        return ['counts' => $count, 'tiers' => $out];
    }

    public static function powers(array $items): array
    {
        $p = [];
        foreach ($items as $item) {
            foreach ([$item['power'] ?? null, $item['imprint'] ?? null] as $x) {
                if ($x) {
                    $p[$x] = true;
                }
            }
        }

        return array_keys($p);
    }

    /** Combat stats for a build. */
    public static function derive(array $build): array
    {
        $L = $build['level'];
        $attrs = self::attributes($build);
        $tot = $attrs['total'];
        $e = self::effective($tot);
        $items = $build['items'] ?? [];
        $powers = self::powers($items);

        $damage = 0.0;
        $health = 0.0;
        $armor = 0.0;
        $block = 0.0;
        foreach ($items as $item) {
            $b = self::itemBase($item);
            $damage += $b['damage'] ?? 0;
            $health += $b['health'] ?? 0;
            $armor += $b['armor'] ?? 0;
            $block += $b['block'] ?? 0;
        }
        $damage = max(3.0, $damage);
        if (in_array('titanGrip', $powers, true)) {
            $damage *= 1.25;
        }
        $health += 30;

        $cls = Rules::CLASSES[$build['cls']];
        $resource = $cls['resource'];
        [$resMax, $resRegen] = match ($resource) {
            'mana' => [30 * $e['wisdom'], 0.45 * $e['wisdom']],
            'energy' => [12 * $e['stamina'], 0.9 * $e['stamina']],
            default => [10 * $e['fury'], 0.0],
        };

        $haste = 1 + self::curve($tot['swiftness'], $L);
        $crit = min(self::CAPS['crit'], self::curve($tot['precision'], $L));
        $maxHp = $health * (1 + $e['vitality'] / 20) + 20 * $e['vitality'];

        return [
            'level' => $L,
            'maxHp' => $maxHp,
            'weaponDamage' => $damage,
            'might' => $damage * (1 + $e['might'] / 10),
            'arcana' => $damage * (1 + $e['arcana'] / 10),
            'spirit' => $damage * (1 + $e['spirit'] / 10),
            'crit' => $crit,
            'mega' => min(self::CAPS['mega'], self::curve($tot['ferocity'], $L) * 0.5),
            'critMult' => 2 + $e['ferocity'] / (10 + 4 * $L),
            'haste' => $haste,
            'cdr' => min(self::CAPS['cdr'], self::curve($tot['focus'], $L)),
            'dodge' => min(self::CAPS['dodge'], self::curve($tot['agility'], $L)),
            'dr' => min(self::CAPS['dr'], self::curve($tot['guard'] + $armor, $L)),
            'block' => min(self::CAPS['block'], self::curve(0.4 * $tot['guard'] + $block, $L)),
            'resist' => min(self::CAPS['resist'], self::curve($tot['resolve'], $L)),
            'regen' => $maxHp * 0.0004 * $e['recovery'],
            'healRecv' => 1 + 0.5 * $e['recovery'] / ($e['recovery'] + 10 + 2 * $L),
            'threat' => 1 + $e['presence'] / (2 + 0.8 * $L),
            'command' => 1 + $e['command'] / (10 + 4 * $L),
            'fortune' => 1 + $e['fortune'] / (5 + 2 * $L),
            'resource' => $resource,
            'resMax' => $resMax,
            'resRegen' => $resRegen,
            'rageGain' => 3 + 0.3 * $e['fury'],
            'costScale' => match ($resource) { 'rage' => 1 + 0.02 * ($L - 1), 'energy' => 1 + 0.03 * ($L - 1), default => 1 + 0.10 * ($L - 1) },
            'powers' => $powers,
            'resonance' => self::resonance($items)['tiers'],
        ];
    }

    /** Rough value of an item for a class: used for "upgrade" hints and automatic need rolls. */
    public static function itemScore(array $item, string $cls): float
    {
        if ($item['slot'] === 'glyph') {
            return $item['value'] ?? 0;
        }
        $w = Rules::CLASSES[$cls]['suggest'];
        $t = self::temperMult($item);
        $s = 0.0;
        foreach ($item['affixes'] as [$a, $v]) {
            $s += $v * $t * (($w[$a] ?? 0) + 0.3);
        }
        $b = self::itemBase($item);
        $role = Rules::role($cls);
        $s += ($b['damage'] ?? 0) * ($role === 'tank' ? 0.5 : 1.2) / (1.045 ** $item['ilvl']) * $item['ilvl'] * 0.1;
        $s += ($b['health'] ?? 0) / (1.045 ** $item['ilvl']) * $item['ilvl'] * ($role === 'tank' ? 0.04 : 0.02);
        $s += ($b['armor'] ?? 0) * ($role === 'tank' ? 1.0 : 0.3) + ($b['block'] ?? 0) * ($role === 'tank' ? 0.8 : 0.0);
        $s += count($item['glyphs'] ?? []) * 2 + (($item['power'] ?? null) ? 30 : 0);

        return round($s, 1);
    }
}
