<?php

namespace App\Game;

/**
 * Seasons are data: content/<pack>/seasons/<id>.json, each with a start (a Monday), a length in weeks and a cosmetic
 * track. Runs earn track points (points()); every tierPoints points is a tier. Each tier has a premium look and every
 * second tier a free one; the premium track is sold in the shop for the season. Looks are wardrobe keys
 * (Items::lookKey: slot|base|cloth|trim|metal), shared by every hero on the account. Nothing on the track adds power.
 */
final class Seasons
{
    private static ?array $all = null;

    /** @return array<string, array> every season by id, oldest first */
    public static function all(?string $dir = null): array
    {
        if ($dir === null && self::$all !== null) {
            return self::$all;
        }
        $out = [];
        foreach (glob(($dir ?? Dungeons::dir()).'/*/seasons/*.json') ?: [] as $file) {
            $s = json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
            $id = $s['id'] ?? basename($file, '.json');
            $start = strtotime(($s['starts'] ?? '').' 00:00:00 UTC') ?: throw new \RuntimeException(basename($file).': starts must be a date');
            gmdate('N', $start) === '1' || throw new \RuntimeException(basename($file).': a season starts on a Monday');
            $s += ['name' => $id, 'weeks' => 8, 'summary' => '', 'affix' => null, 'raid' => null, 'worldRaid' => null, 'track' => ['tierPoints' => 300, 'tiers' => []]];
            $s['affix'] === null || isset(Modes::AFFIXES[$s['affix']]) || throw new \RuntimeException(basename($file).': unknown affix '.$s['affix']);
            $s['id'] = $id;
            if ($s['worldRaid'] !== null) {
                $s['worldRaid'] += ['day' => 6, 'hour' => 18, 'level' => 50, 'squads' => 50, 'health' => 2.5, 'damage' => 1.4, 'needed' => 0.5, 'reward' => null, 'summary' => ''];
                $s['worldRaid']['fight'] = Dungeons::normalise($s['worldRaid']['fight'] + ['id' => "$id:world", 'levels' => [$s['worldRaid']['level'], 0]], $file);
            }
            $s['startsAt'] = $start;
            $s['endsAt'] = $start + 604800 * (int) $s['weeks'];
            foreach ($s['track']['tiers'] as $n => $t) {
                foreach (['free', 'premium'] as $k) {
                    if (($t[$k] ?? null) !== null && count(explode('|', $t[$k])) !== 5) {
                        throw new \RuntimeException(basename($file).": tier $n $k must be slot|base|cloth|trim|metal");
                    }
                }
            }
            $out[$id] = $s;
        }
        uasort($out, fn ($a, $b) => $a['startsAt'] <=> $b['startsAt']);

        return $dir === null ? self::$all = $out : $out;
    }

    /** The season running at $now, or null between seasons. */
    public static function current(?int $now = null): ?array
    {
        $now ??= time();
        foreach (self::all() as $s) {
            if ($s['startsAt'] <= $now && $now < $s['endsAt']) {
                return $s;
            }
        }

        return null;
    }

    public static function get(string $id): ?array
    {
        return self::all()[$id] ?? null;
    }

    /** Track points for one run: a clear, its bosses, and more on Heroic and Mythic. */
    public static function points(array $report, string $mode, int $tier): int
    {
        $won = !$report['wiped'];

        return ($won ? 10 : 0) + 4 * (int) $report['bossesKilled'] + ($won && $mode === 'heroic' ? 5 : 0) + ($won && $mode === 'mythic' ? 5 + 2 * $tier : 0);
    }

    public static function tier(array $season, int $points): int
    {
        return min(count($season['track']['tiers']), intdiv($points, max(1, (int) $season['track']['tierPoints'])));
    }

    /**
     * The looks earned between two tiers.
     *
     * @return list<string>
     */
    public static function rewards(array $season, int $fromTier, int $toTier, bool $premium): array
    {
        $out = [];
        foreach (array_slice($season['track']['tiers'], $fromTier, max(0, $toTier - $fromTier)) as $t) {
            foreach ($premium ? ['free', 'premium'] : ['free'] as $k) {
                if (!empty($t[$k])) {
                    $out[] = $t[$k];
                }
            }
        }

        return $out;
    }
}
