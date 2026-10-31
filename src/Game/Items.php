<?php

namespace App\Game;

use App\Entity\Item;
use Random\Randomizer;

/** Item generation and naming. Items are plain specs until they are saved as an Item entity. */
final class Items
{
    public static function name(array $item): string
    {
        if ($item['slot'] === 'glyph') {
            return Rules::GLYPHS[$item['base']][0].' Glyph';
        }
        $pre = [];
        $suf = null;
        foreach ($item['affixes'] as [$a]) {
            [$kind, $word] = Rules::AFFIXES[$a];
            if ($kind === 'pre' && count($pre) < 1) {
                $pre[] = $word;
            } elseif ($kind === 'suf' && !$suf) {
                $suf = $word;
            }
        }
        $base = Art::bases()[$item['slot']][$item['base']] ?? ucfirst($item['base']);
        $name = trim(implode(' ', $pre).' '.$base.($suf ? ' '.$suf : ''));
        if (($item['temper'] ?? 0) > 0) {
            $name .= ' +'.$item['temper'];
        }

        return $name;
    }

    public static function affixValue(int $ilvl, float $roll): int
    {
        return max(1, (int) round((2 + $ilvl * 0.18) * (0.7 + 0.6 * $roll)));
    }

    public static function rollRarity(Randomizer $r, float $bonus = 0.0): string
    {
        $x = $r->getFloat(0, 100);
        $x -= $bonus * $x;
        $acc = 0.0;
        foreach (array_reverse(Rules::RARITIES, true) as $id => $def) {
            $acc += $def[3];
            if ($x < $acc) {
                return $id;
            }
        }

        return 'common';
    }

    public static function generate(Randomizer $r, int $ilvl, string $rarity, ?string $slot = null, ?string $base = null, array $preferAttrs = []): array
    {
        $slots = array_keys(Rules::SLOTS);
        $slot ??= $slots[$r->getInt(0, count($slots) - 1)];
        $bases = array_keys(Art::dropBases()[$slot]);
        $base ??= $bases[$r->getInt(0, count($bases) - 1)];
        [, $nAffix, $sockets] = Rules::RARITIES[$rarity];
        if (in_array($slot, ['ring1', 'ring2', 'amulet', 'trinket'], true)) {
            $nAffix = min(4, $nAffix + 1);
        }
        $pool = array_keys(Rules::ATTRIBUTES);
        $chosen = [];
        foreach ($preferAttrs as $a) {
            if (count($chosen) < $nAffix && !in_array($a, $chosen, true)) {
                $chosen[] = $a;
            }
        }
        while (count($chosen) < $nAffix) {
            $a = $pool[$r->getInt(0, count($pool) - 1)];
            if (!in_array($a, $chosen, true)) {
                $chosen[] = $a;
            }
        }
        $affixes = array_map(fn ($a) => [$a, self::affixValue($ilvl, $preferAttrs ? 0.5 : $r->getFloat(0, 1))], $chosen);
        $powers = array_keys(Rules::LEGENDARY_POWERS);

        return [
            'slot' => $slot === 'ring2' ? 'ring1' : $slot,
            'base' => $base,
            'rarity' => $rarity,
            'ilvl' => $ilvl,
            'affixes' => $affixes,
            'sockets' => $sockets,
            'glyphs' => array_fill(0, $sockets, null),
            'power' => $rarity === 'legendary' ? $powers[$r->getInt(0, count($powers) - 1)] : null,
            'imprint' => null,
            'temper' => 0,
            'seed' => $r->getInt(1, 999999),
        ];
    }

    public static function glyph(Randomizer $r, int $ilvl, ?string $theme = null): array
    {
        $themes = array_keys(Rules::GLYPHS);
        $theme ??= $themes[$r->getInt(0, count($themes) - 1)];

        return ['slot' => 'glyph', 'base' => $theme, 'rarity' => 'rare', 'ilvl' => $ilvl, 'value' => (int) round(3 + $ilvl * 0.12), 'affixes' => [], 'sockets' => 0, 'glyphs' => [], 'power' => null, 'imprint' => null, 'temper' => 0, 'seed' => $r->getInt(1, 999999)];
    }

    public static function spec(Item $i): array
    {
        return [
            'id' => $i->id, 'slot' => $i->slot, 'base' => $i->base, 'rarity' => $i->rarity, 'ilvl' => $i->ilvl,
            'affixes' => $i->affixes, 'sockets' => $i->sockets, 'glyphs' => $i->glyphs, 'power' => $i->power,
            'imprint' => $i->imprint, 'temper' => $i->temper, 'seed' => $i->seed, 'dye' => $i->dye, 'equipped' => $i->equipped,
            'price' => $i->price !== null ? (int) $i->price : null,
            'value' => $i->slot === 'glyph' ? ($i->affixes[0][1] ?? 0) : null,
        ];
    }

    /** The colours an item is drawn in: its dye, else its rarity's palette from the seed; null wears the hero's own. */
    public static function tint(array $spec): ?array
    {
        if (!empty($spec['dye'])) {
            return $spec['dye'];
        }
        $p = Rules::ITEM_PALETTES[$spec['rarity'] ?? 'common'] ?? null;

        return $p ? $p[abs((int) ($spec['seed'] ?? 0)) % count($p)] : null;
    }

    /** A look the wardrobe keeps: slot, base and colours, as one string. */
    public static function lookKey(array $spec): string
    {
        return implode('|', [$spec['slot'], $spec['base'], ...(self::tint($spec) ?? ['', '', ''])]);
    }

    public static function fromSpec(array $s): Item
    {
        $i = new Item();
        $i->slot = $s['slot'];
        $i->base = $s['base'];
        $i->rarity = $s['rarity'];
        $i->ilvl = $s['ilvl'];
        $i->affixes = $s['slot'] === 'glyph' ? [[Rules::GLYPHS[$s['base']][1], $s['value']]] : $s['affixes'];
        $i->sockets = $s['sockets'];
        $i->glyphs = $s['glyphs'];
        $i->power = $s['power'];
        $i->imprint = $s['imprint'] ?? null;
        $i->temper = $s['temper'] ?? 0;
        $i->seed = $s['seed'];
        $i->dye = $s['dye'] ?? null;
        $i->createdAt = time();

        return $i;
    }

    public static function temperCost(array $item, bool $anvil): array
    {
        $t = $item['temper'];
        $m = $anvil ? 0.9 : 1.0;

        return [
            'gold' => (int) round((15 + 4 * $item['ilvl']) * 1.35 ** $t * $m),
            'materials' => (int) round((2 + $item['ilvl'] / 20) * 1.3 ** $t * $m),
        ];
    }

    public static function salvageValue(array $item): int
    {
        return match ($item['rarity']) {
            'common' => 1, 'rare' => 3, 'epic' => 8, 'legendary' => 25, default => 1,
        } + intdiv($item['ilvl'], 20);
    }
}
