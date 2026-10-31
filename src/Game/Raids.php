<?php

namespace App\Game;

/**
 * Guild raids are data: content/<pack>/raids/<id>.json. A raid has fronts and a final fight, each written like a
 * dungeon (see content/README.md). Up to forty heroes go in as eight squads of five; the raid planner puts each squad on
 * a front. A front is taken if any squad on it clears it. With at least three fronts taken the throne opens, and
 * every squad that took its front fights the final boss; each front lost makes him hit harder. The raid is won if
 * half or more of those squads (and at least two) bring him down.
 */
final class Raids
{
    public const SQUADS = 8;

    public const SQUAD_SIZE = 5;

    /** Fronts that must be taken before the throne opens. */
    public const FRONTS_NEEDED = 3;

    /** The final boss hits this much harder for every front lost. */
    public const LOST_FRONT_DAMAGE = 0.15;

    private static ?array $all = null;

    /** @return array<string, array> every raid by id */
    public static function all(?string $dir = null): array
    {
        if ($dir === null && self::$all !== null) {
            return self::$all;
        }
        $root = $dir ?? Dungeons::dir();
        $out = [];
        foreach (glob($root.'/*/raids/*.json') ?: [] as $file) {
            $r = json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
            $id = $r['id'] ?? basename($file, '.json');
            foreach (['name', 'fronts', 'final'] as $k) {
                isset($r[$k]) || throw new \RuntimeException(basename($file).": missing $k");
            }
            count($r['fronts']) >= self::FRONTS_NEEDED || throw new \RuntimeException(basename($file).': a raid needs at least '.self::FRONTS_NEEDED.' fronts');
            foreach ($r['fronts'] as $n => $f) {
                $r['fronts'][$n] = Dungeons::normalise($f + ['id' => "$id:$n", 'levels' => [$r['level'] ?? 50, 0]], $file);
            }
            $r['final'] = Dungeons::normalise($r['final'] + ['id' => "$id:final", 'levels' => [$r['level'] ?? 50, 0]], $file);
            $out[$id] = $r + ['id' => $id, 'summary' => '', 'level' => 50, 'health' => 1.5, 'damage' => 1.25];
        }

        return $dir === null ? self::$all = $out : $out;
    }

    public static function get(string $id): ?array
    {
        return self::all()[$id] ?? null;
    }

    /** Enemy modifiers in the raid (Modes::mods shape); the final boss hits harder for every lost front. */
    public static function mods(array $raid, int $frontsLost = 0): array
    {
        $hp = (float) $raid['health'];
        $dmg = (float) $raid['damage'] * (1 + self::LOST_FRONT_DAMAGE * $frontsLost);

        return ['pack' => [$hp, $dmg], 'boss' => [$hp, $dmg], 'affixes' => []];
    }

    /** The level the raid is fought at: its own, or the raiders' median if that is higher. */
    public static function level(array $raid, array $levels): int
    {
        sort($levels);

        return max((int) $raid['level'], $levels ? $levels[intdiv(count($levels), 2)] : 1);
    }

    /**
     * Fills squads from the sign-ups: a tank and a healer in each squad where there are enough, then the rest, and the
     * squads spread over the fronts in turn.
     *
     * @param array<int, string> $signups hero id => role
     *
     * @return array{squads: list<list<int>>, fronts: list<int>}
     */
    public static function autoFill(array $signups, int $fronts): array
    {
        $by = ['tank' => [], 'healer' => [], 'dps' => []];
        foreach ($signups as $id => $role) {
            $by[$role][] = (int) $id;
        }
        $n = min(self::SQUADS, max(1, (int) ceil(count($signups) / self::SQUAD_SIZE)));
        $squads = array_fill(0, $n, []);
        foreach (['tank', 'healer'] as $role) {
            for ($k = 0; $k < $n && $by[$role]; ++$k) {
                $squads[$k][] = array_shift($by[$role]);
            }
        }
        $rest = [...$by['dps'], ...$by['healer'], ...$by['tank']];
        foreach ($rest as $id) {
            $open = array_values(array_filter(array_keys($squads), fn ($k) => count($squads[$k]) < self::SQUAD_SIZE));
            if (!$open) {
                break;
            }
            usort($open, fn ($a, $b) => [count($squads[$a]), $a] <=> [count($squads[$b]), $b]);
            $squads[$open[0]][] = $id;
        }

        return ['squads' => $squads, 'fronts' => array_map(fn ($k) => $k % $fronts, array_keys($squads))];
    }

    /**
     * What a squad lineup lacks: "no tank", "no healer", "only 3 heroes".
     *
     * @param list<string> $roles
     */
    public static function warnings(array $roles): array
    {
        $out = [];
        if (!in_array('tank', $roles, true)) {
            $out[] = 'no tank';
        }
        if (!in_array('healer', $roles, true)) {
            $out[] = 'no healer';
        }
        if (count($roles) < self::SQUAD_SIZE) {
            $out[] = 'only '.count($roles).' of '.self::SQUAD_SIZE;
        }

        return $out;
    }

    /** Whether the raid is won: enough squads brought the final boss down. */
    public static function won(int $finalSquads, int $finalClears): bool
    {
        return $finalSquads >= 2 && $finalClears * 2 >= $finalSquads;
    }
}
