<?php

namespace App\Game;

/**
 * After the story: every dungeon can be run on Heroic, and at level 50 on Mythic, an endless ladder of tiers.
 *
 * Heroic opens for a dungeon once the group has outgrown it (its median level reaches the top of the dungeon's band,
 * or 50 for the last one). It runs at the group's own level with tougher enemies and better loot.
 *
 * Mythic opens at level 50. Each tier adds health and damage, and the week's affixes change how fights play: one of
 * Fortified (packs) or Tyrannical (bosses) from tier 1, and a second affix from tier 4. A clear raises the group's
 * tier by one; the leader may pick any tier up to one above the best the group has cleared. The browser build mirrors
 * this file in browser-build/engine.js (Modes).
 */
final class Modes
{
    public const MODES = ['normal', 'heroic', 'mythic'];

    public const MYTHIC_LEVEL = 50;

    /** The second affix (tier 4 and up), rotating weekly. */
    public const SECOND = ['volcanic', 'raging', 'bolstering', 'quaking'];

    /** Tier at which the second affix joins. */
    public const SECOND_AT = 4;

    /** Tier at which the season's own affix joins (content/<pack>/seasons/*.json, "affix"). */
    public const SEASON_AT = 7;

    public const AFFIXES = [
        'fortified' => ['Fortified', 'Trash packs have 25% more health and hit 15% harder.'],
        'tyrannical' => ['Tyrannical', 'Bosses have 25% more health and hit 15% harder.'],
        'volcanic' => ['Volcanic', 'Every 9 seconds the ground erupts under a random hero who is not the tank.'],
        'raging' => ['Raging', 'Enemies below 30% health hit 50% harder.'],
        'bolstering' => ['Bolstering', 'When a pack enemy dies, the rest of its pack heals 10% and hits 15% harder.'],
        'quaking' => ['Quaking', 'Every 15 seconds the ground shakes and hurts every hero.'],
        // season affixes: a season names one of these
        'sundering' => ['Sundering', 'Season affix. Every 12 seconds the ground splits under the healer and one other hero.'],
        'frostbite' => ['Frostbite', 'Season affix. Every 10 seconds frost bites the tank and the hero lowest on health.'],
        'undertow' => ['Undertow', 'Season affix. Every 12 seconds the tide drags at the two healthiest heroes who are not the tank.'],
    ];

    /** Weeks since the first Monday of 1970 (Thursday 1 January + 4 days); weeks start Monday 00:00 UTC. */
    public static function week(int $time): int
    {
        return intdiv($time - 345600, 604800);
    }

    /** @return list<string> the affix ids of the week, in order (the second applies from SECOND_AT) */
    public static function weekly(int $week): array
    {
        return [$week % 2 ? 'tyrannical' : 'fortified', self::SECOND[intdiv($week, 2) % count(self::SECOND)]];
    }

    /** @return list<string> the affixes a run at this mode and tier fights with */
    public static function affixes(string $mode, int $tier, int $week): array
    {
        if ($mode !== 'mythic') {
            return [];
        }
        $w = self::weekly($week);
        $out = $tier >= self::SECOND_AT ? $w : [$w[0]];
        if ($tier >= self::SEASON_AT && ($s = self::seasonal($week))) {
            $out[] = $s;
        }

        return $out;
    }

    /** The affix of the season running in this week, if any. */
    public static function seasonal(int $week): ?string
    {
        return Seasons::current(345600 + 604800 * $week)['affix'] ?? null;
    }

    public static function heroicOpen(array $d, int $median): bool
    {
        return $median >= ($d['levels'][1] ?: self::MYTHIC_LEVEL);
    }

    public static function mythicOpen(int $median): bool
    {
        return $median >= self::MYTHIC_LEVEL;
    }

    /** The level a run is fought at: Heroic and Mythic use the group's own level, never below the dungeon's top. */
    public static function level(array $d, int $level, string $mode): int
    {
        if ($mode === 'normal') {
            return Dungeons::clamp($d, $level);
        }

        return max($d['levels'][1] ?: self::MYTHIC_LEVEL, $level);
    }

    /**
     * How much tougher enemies are: [hp, dmg] for packs and for bosses.
     *
     * @return array{pack: array{float, float}, boss: array{float, float}, affixes: list<string>}
     */
    public static function mods(string $mode, int $tier, array $affixes): array
    {
        [$hp, $dmg] = match ($mode) {
            'heroic' => [1.25, 1.1],
            'mythic' => [1.5 * 1.08 ** ($tier - 1), 1.25 * 1.05 ** ($tier - 1)],
            default => [1.0, 1.0],
        };
        $pack = [$hp, $dmg];
        $boss = [$hp, $dmg];
        if (in_array('fortified', $affixes, true)) {
            $pack = [$hp * 1.25, $dmg * 1.15];
        }
        if (in_array('tyrannical', $affixes, true)) {
            $boss = [$hp * 1.25, $dmg * 1.15];
        }

        return ['pack' => $pack, 'boss' => $boss, 'affixes' => array_values($affixes)];
    }

    /**
     * Rewards: a multiplier on XP, gold and materials, item levels added to drops, extra rarity luck and how much
     * likelier each boss is to drop something.
     *
     * @return array{units: float, ilvl: int, luck: float, drop: float}
     */
    public static function reward(string $mode, int $tier): array
    {
        return match ($mode) {
            'heroic' => ['units' => 1.25, 'ilvl' => 6, 'luck' => 0.05, 'drop' => 0.15],
            'mythic' => ['units' => 1.5 + 0.05 * $tier, 'ilvl' => 10 + 2 * min($tier, 20), 'luck' => min(0.25, 0.08 + 0.01 * $tier), 'drop' => 0.25],
            default => ['units' => 1.0, 'ilvl' => 0, 'luck' => 0.0, 'drop' => 0.0],
        };
    }

    /** "Heroic", "Mythic 7" or "" for display. */
    public static function label(string $mode, int $tier): string
    {
        return match ($mode) {
            'heroic' => 'Heroic',
            'mythic' => 'Mythic '.$tier,
            default => '',
        };
    }
}
