<?php

namespace App\Game;

use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The crowd check (Phase 4 gate): a random crowd of heroes, each made the way players make them (every creator
 * choice, picked at random, since the creator itself starts from a random look) and dressed the way a hero of a
 * random level is dressed (starter kit, drops of every base with their rarity's colours, now and then a dye). Counts
 * heroes who look exactly like another hero in the crowd, and heroes who share a silhouette (colours aside).
 */
final class Crowd
{
    /** Look keys that make the shape, without colours. */
    public const SHAPE = ['race', 'hair', 'beard', 'acc', 'feature', 'build', 'height', 'hat', 'top', 'bottom', 'shoes', 'gloves', 'cape', 'weapon', 'offhand'];

    /** @return list<array> looks, as Game::look() returns them */
    public static function make(int $size, int $seed): array
    {
        $r = new Randomizer(new Mt19937($seed));
        $pick = fn (array $a) => $a[$r->getInt(0, count($a) - 1)];
        $c = Art::creator();
        $bases = Art::bases();
        $out = [];
        for ($n = 0; $n < $size; ++$n) {
            $race = $pick(array_keys(Rules::RACES));
            $cls = $pick(array_keys(Rules::CLASSES));
            $feats = $c['features'][$race] ?? [];
            $look = [
                'race' => $race, 'skin' => $pick($c['skins'][$race]), 'hair' => $pick($c['hair']), 'hairColor' => $pick($c['hairColor']),
                'eyes' => $pick($c['eyes']), 'eyeColor' => $pick($c['eyeColor']), 'mouth' => $pick($c['mouth']),
                'beard' => $race === 'dwarf' ? $pick(['full', 'braided', 'moustache']) : ($r->getFloat(0, 1) < 0.2 ? $pick($c['beard']) : 'none'),
                'acc' => $r->getFloat(0, 1) < 0.3 ? $pick($c['acc']) : 'none',
                'feature' => $feats && $r->getFloat(0, 1) < 0.6 ? $pick($feats) : 'none',
                'build' => $pick($c['build']), 'height' => $pick($c['height']),
                'dye1' => $pick($c['dyes']), 'dye2' => $pick($c['dyes']), 'metal' => $pick($c['metal']),
                'hat' => 'none', 'top' => 'tunic', 'bottom' => 'pants', 'shoes' => 'boots', 'gloves' => 'none', 'cape' => 'none', 'weapon' => 'sword', 'offhand' => 'none',
            ];
            // gear: the class kit, then each slot holds a drop with a chance that grows with level
            $level = $r->getInt(1, 50);
            $tint = [];
            foreach (Rules::CLASSES[$cls]['kit'] as $slot => $base) {
                $look[Rules::SLOTS[$slot][1]] = $base;
            }
            foreach (Rules::SLOTS as $slot => [, $layer]) {
                if (!$layer || $r->getFloat(0, 1) > min(0.95, 0.1 + $level / 40)) {
                    continue;
                }
                $spec = ['slot' => $slot, 'base' => $pick(array_keys($bases[$slot])), 'rarity' => Items::rollRarity($r, min(0.5, $level / 100)), 'seed' => $r->getInt(1, 999999), 'dye' => null];
                if ($r->getFloat(0, 1) < 0.1) {
                    $spec['dye'] = [$pick(Rules::DYES), $pick(Rules::DYES), $pick(Rules::METALS)];
                }
                $look[$layer] = $spec['base'];
                $tint[$layer] = Items::tint($spec);
            }
            $look['tint'] = array_filter($tint);
            $out[] = $look;
        }

        return $out;
    }

    /** @return array{exact: int, shape: int} heroes who share their exact look, or their silhouette, with another */
    public static function duplicates(array $crowd): array
    {
        $exact = $shape = [];
        foreach ($crowd as $look) {
            ksort($look);
            $exact[] = json_encode($look);
            $shape[] = json_encode(array_map(fn ($k) => $look[$k] ?? null, self::SHAPE));
        }
        $count = fn (array $keys) => array_sum(array_filter(array_count_values($keys), fn ($n) => $n > 1));

        return ['exact' => $count($exact), 'shape' => $count($shape)];
    }
}
