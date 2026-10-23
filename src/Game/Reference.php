<?php

namespace App\Game;

use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The reference group: a sensible party at a dungeon level, wearing rare gear of that level and spending points
 * the suggested way. Enemies are tuned against it, so balance holds at every level without hand-written tables.
 */
final class Reference
{
    private static array $cache = [];

    public const COMP = ['guardian', 'cleric', 'ranger', 'mage', 'rogue'];

    /**
     * What a group at this level is expected to wear. Level 1 is exactly the starter kit; drops (about one item per
     * hero every two levels, at up to twice the level) fill the other slots and replace the kit over time.
     */
    public static function build(string $cls, int $level, ?string $quality = null): array
    {
        $c = Rules::CLASSES[$cls];
        $points = ($level - 1) * Rules::POINTS_PER_LEVEL;
        $w = $c['suggest'];
        $sumW = array_sum($w);
        $spent = [];
        foreach ($w as $a => $n) {
            $spent[$a] = (int) floor($points * $n / $sumW);
        }
        $quality ??= $level < 15 ? 'common' : 'rare';
        $ilvl = max(1, (int) round(1.5 * $level - 0.5));
        $r = new Randomizer(new Mt19937($level * 31 + crc32($cls)));
        $prefer = array_keys($w);
        $kit = array_filter($c['kit'], fn ($b) => $b !== 'none');
        $extra = intdiv($level, 2);
        $items = [];
        foreach (array_keys(Rules::SLOTS) as $slot) {
            $base = $kit[$slot] ?? null;
            if ($base === null) {
                if ($slot === 'offhand' || $extra <= 0) {
                    continue;
                }
                --$extra;
            }
            $shift = array_merge(array_slice($prefer, count($items) % 3), array_slice($prefer, 0, count($items) % 3));
            $items[] = Items::generate($r, $ilvl, $base !== null && $level === 1 ? 'common' : $quality, $slot, $base, $shift);
        }

        return ['race' => 'human', 'cls' => $cls, 'origin' => 'anvil', 'level' => $level, 'spent' => $spent, 'path' => null, 'keystones' => [], 'items' => $items];
    }

    /** Numbers the enemies are scaled from. */
    public static function forLevel(int $level): array
    {
        if (isset(self::$cache[$level])) {
            return self::$cache[$level];
        }
        $s = [];
        foreach (self::COMP as $cls) {
            $s[$cls] = Stats::derive(self::build($cls, $level));
        }
        $party = [];
        foreach (self::COMP as $n => $cls) {
            $b = self::build($cls, $level);
            $b['path'] = $level >= Rules::PATH_LEVEL ? array_key_first(Rules::CLASSES[$cls]['paths']) : null;
            $party[] = Combatants::make($b, $n + 1, $cls);
        }
        $dps = (new Simulator())->measureDps($party);
        $tank = $s['guardian'];
        // Healing is the average of both healer classes, so neither one is the only healer that keeps up.
        $druid = Stats::derive(self::build('druid', $level));
        $hps = ($s['cleric']['spirit'] * $s['cleric']['haste'] + $druid['spirit'] * $druid['haste']) / 2 * 1.3;
        $hp = array_sum(array_map(fn ($x) => $x['maxHp'], $s)) / 5;

        return self::$cache[$level] = [
            'dps' => $dps,
            'hps' => $hps,
            'tankHp' => $tank['maxHp'],
            'tankDr' => $tank['dr'],
            'avgHp' => $hp,
            'avgDr' => array_sum(array_map(fn ($x) => $x['dr'], $s)) / 5,
        ];
    }
}
