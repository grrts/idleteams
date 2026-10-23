<?php

namespace App\Game;

/** Builds the simulator's input from a build array. */
final class Combatants
{
    /** Skills a hero can slot at a level: core skills, plus the chosen Path's skill from level 10. */
    public static function available(string $cls, int $level, ?string $path): array
    {
        $out = [];
        foreach (Rules::classSkills($cls) as $id => $sk) {
            if ($sk[7] === 'ultimate' || $sk[1] > $level) {
                continue;
            }
            if ($sk[7] !== 'core' && $sk[7] !== $path) {
                continue;
            }
            $out[$id] = $sk;
        }

        return $out;
    }

    public static function defaultLoadout(string $cls, int $level, ?string $path): array
    {
        $ids = array_keys(self::available($cls, $level, $path));
        // Path skill first so a new Path is felt right away.
        usort($ids, fn ($a, $b) => (Rules::classSkills($cls)[$a][7] === 'core') <=> (Rules::classSkills($cls)[$b][7] === 'core'));

        return array_slice($ids, 0, Rules::LOADOUT_SIZE);
    }

    public static function make(array $build, int $id, string $name, ?array $loadout = null, array $ranks = []): array
    {
        $loadout ??= self::defaultLoadout($build['cls'], $build['level'], $build['path'] ?? null);

        return [
            'id' => $id, 'name' => $name, 'cls' => $build['cls'], 'race' => $build['race'], 'origin' => $build['origin'],
            'level' => $build['level'], 'path' => $build['path'] ?? null, 'keystones' => array_values($build['keystones'] ?? []),
            'loadout' => $loadout, 'ranks' => $ranks, 'stats' => Stats::derive($build),
        ];
    }
}
