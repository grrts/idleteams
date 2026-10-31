<?php

namespace App\Game;

/** Builds the simulator's input from a build array. */
final class Combatants
{
    /** Skills a hero can slot at a level: core skills, the chosen Path's skill from level 10, and skills talents teach. */
    public static function available(string $cls, int $level, ?string $path, array $talents = []): array
    {
        $out = [];
        $taught = $talents ? Talents::grants($cls, $talents) : [];
        foreach (Rules::classSkills($cls) as $id => $sk) {
            if ($sk[7] === 'ultimate' || $sk[1] > $level) {
                continue;
            }
            if ($sk[7] === 'talent' ? !isset($taught[$id]) : ($sk[7] !== 'core' && $sk[7] !== $path)) {
                continue;
            }
            $out[$id] = $sk;
        }

        return $out;
    }

    public static function defaultLoadout(string $cls, int $level, ?string $path, array $talents = []): array
    {
        $ids = array_keys(self::available($cls, $level, $path, $talents));
        // Path skill first so a new Path is felt right away, then core skills, then skills talents teach.
        $all = Rules::classSkills($cls);
        $rank = fn ($id) => match ($all[$id][7]) { 'core' => 1, 'talent' => 2, default => 0 };
        usort($ids, fn ($a, $b) => $rank($a) <=> $rank($b));

        return array_slice($ids, 0, Rules::LOADOUT_SIZE);
    }

    public static function make(array $build, int $id, string $name, ?array $loadout = null, array $ranks = []): array
    {
        $loadout ??= self::defaultLoadout($build['cls'], $build['level'], $build['path'] ?? null, $build['talents'] ?? []);

        return [
            'id' => $id, 'name' => $name, 'cls' => $build['cls'], 'race' => $build['race'], 'culture' => $build['culture'] ?? null, 'backstory' => $build['backstory'] ?? null, 'origin' => $build['origin'],
            'level' => $build['level'], 'path' => $build['path'] ?? null, 'keystones' => array_values($build['keystones'] ?? []),
            'loadout' => $loadout, 'ranks' => $ranks, 'stats' => Stats::derive($build),
        ];
    }
}
