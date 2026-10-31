<?php

namespace App\Game;

/**
 * The guild hall: rooms that open with guild level, the bank's size, and the weekly goals.
 *
 * Guild levels unlock rooms and room, never combat power. Every Monday (UTC, as Mythic affixes) a guild gets three
 * goals from the pool, scaled to its size; members' runs fill them, and a finished goal pays every member who helped
 * that week. The browser build mirrors this file in browser-build/server.js (GuildHall).
 */
final class GuildHall
{
    /** [level, id, name, what it holds] */
    public const ROOMS = [
        [1, 'hall', 'Great hall', 'The roster, the guild channel and the bank.'],
        [2, 'notice', 'Notice board', 'The leader and officers pin a notice every member sees.'],
        [3, 'trophies', 'Trophy wall', 'The guild\'s records: its best Mythic, its Heroic clears and its boss count.'],
        [4, 'vault', 'Deep vault', 'The bank grows by 10 slots at every guild level from here.'],
        [6, 'banners', 'Banner hall', 'The guild tag shows beside members\' names in chat.'],
        [8, 'gallery', 'Mythic gallery', 'Every member\'s best Mythic tier, ranked.'],
    ];

    public const RANKS = ['leader', 'officer', 'member'];

    /** Items a plain member may take out of the bank per day; the leader and officers have no limit. */
    public const MEMBER_WITHDRAWALS = 2;

    public const LOG_SIZE = 30;

    /** [id, label with {n}, per member, minimum] */
    public const GOALS = [
        'clears' => ['Clear {n} dungeons', 3, 10],
        'bosses' => ['Defeat {n} bosses', 8, 25],
        'heroic' => ['Clear {n} Heroic or Mythic runs', 1, 3],
        'mythic' => ['Clear {n} Mythic tiers (a tier 4 clear counts 4)', 2, 6],
        'together' => ['Run {n} times with three or more guildmates in the group', 1, 3],
        'marks' => ['Earn {n} Marks', 1, 4],
    ];

    public static function level(int $xp): int
    {
        return 1 + (int) floor(sqrt($xp / 20));
    }

    public static function opened(int $level): array
    {
        return array_values(array_map(fn ($r) => $r[1], array_filter(self::ROOMS, fn ($r) => $r[0] <= $level)));
    }

    public static function bankSize(int $level): int
    {
        return min(100, 20 + 10 * max(0, $level - 3));
    }

    /**
     * The week's three goals for a guild of $members, drawn from the pool by week and guild id.
     *
     * @return list<array{id: string, target: int, progress: int, done: bool}>
     */
    public static function goals(int $week, int $guildId, int $members): array
    {
        $ids = array_keys(self::GOALS);
        $r = new \Random\Randomizer(new \Random\Engine\Mt19937($week * 7919 + $guildId));
        $pick = array_slice($r->shuffleArray($ids), 0, 3);
        sort($pick);

        return array_map(fn ($id) => ['id' => $id, 'target' => max(self::GOALS[$id][2], self::GOALS[$id][1] * $members), 'progress' => 0, 'done' => false], $pick);
    }

    public static function label(array $goal): string
    {
        return str_replace('{n}', (string) $goal['target'], self::GOALS[$goal['id']][0]);
    }

    /** What a finished goal pays each member who helped: gold and materials at their level, and guild XP. */
    public static function reward(int $level): array
    {
        return ['gold' => (int) round(40 * 1.045 ** (2 * $level)), 'materials' => 20 + $level, 'guildXp' => 60];
    }

    /**
     * How much one run adds to each goal for one hero.
     *
     * @param array{wiped: bool, bossesKilled: int} $report
     */
    public static function gains(array $report, string $mode, int $tier, int $guildmates, int $newMarks): array
    {
        $won = !$report['wiped'];

        return [
            'clears' => $won ? 1 : 0,
            'bosses' => $report['bossesKilled'],
            'heroic' => $won && $mode !== 'normal' ? 1 : 0,
            'mythic' => $won && $mode === 'mythic' ? $tier : 0,
            'together' => $guildmates >= 3 ? 1 : 0,
            'marks' => $newMarks,
        ];
    }
}
