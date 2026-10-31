<?php

namespace App\Game;

use App\Entity\User;

/**
 * The first days, measured: when each account first reached each step (kept on the account, deleted with it) and
 * cohort totals by sign-up day for moderators (GET /api/admin/funnel, app:funnel). No names or addresses leave it.
 */
final class Funnel
{
    public const STEPS = [
        'registered' => 'Made an account',
        'hero' => 'Made a hero',
        'prologue' => 'Finished the prologue',
        'group' => 'Joined a group',
        'run' => 'Started a run',
        'clear' => 'Cleared a dungeon',
        'level10' => 'Reached level 10',
        'level20' => 'Reached level 20',
        'returned' => 'Came back the next day',
        'week' => 'Came back after a week',
    ];

    public static function mark(User $u, string $step, ?int $now = null): void
    {
        if ($u->demo || isset($u->funnel[$step]) || !isset(self::STEPS[$step])) {
            return;
        }
        $f = $u->funnel ?? [];
        $f[$step] = $now ?? time();
        $u->funnel = $f;
    }

    /** Marks the returns: the next day (24 to 48 hours after sign-up) and after a week. */
    public static function seen(User $u, ?int $now = null): void
    {
        $age = ($now ??= time()) - $u->createdAt;
        if ($age >= 86400 && $age < 172800) {
            self::mark($u, 'returned', $now);
        }
        if ($age >= 7 * 86400) {
            self::mark($u, 'week', $now);
        }
    }

    /**
     * Cohorts by sign-up day (UTC): how many signed up and how many reached each step, in all and within their first
     * 24 hours.
     *
     * @param iterable<array{createdAt: int, funnel: ?array}> $users
     *
     * @return list<array{day: string, users: int, steps: array<string, array{all: int, day1: int}>}>
     */
    public static function cohorts(iterable $users): array
    {
        $out = [];
        foreach ($users as $u) {
            $day = gmdate('Y-m-d', $u['createdAt']);
            $out[$day] ??= ['day' => $day, 'users' => 0, 'steps' => array_map(fn () => ['all' => 0, 'day1' => 0], self::STEPS)];
            ++$out[$day]['users'];
            foreach ($u['funnel'] ?? [] as $step => $at) {
                if (isset(self::STEPS[$step])) {
                    ++$out[$day]['steps'][$step]['all'];
                    $out[$day]['steps'][$step]['day1'] += $at - $u['createdAt'] < 86400 ? 1 : 0;
                }
            }
        }
        krsort($out);

        return array_values($out);
    }
}
