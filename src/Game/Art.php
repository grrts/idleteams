<?php

namespace App\Game;

/**
 * The art catalogue is data: content/<pack>/art/*.json, in packs like dungeons and lore. Each file may add parts
 * (hair, hats, tops, weapons, off-hands, race features) and colours. The pixel renderer draws a part from its
 * layers, item bases gain every hat, top, weapon and off-hand, and the character creator offers every hair and
 * race feature, so new art needs no code. The in-game workshop (#/workshop) writes this format.
 *
 * A part: {"name": "Falchion", "layers": [["path", "M0 0 L1 1 Z", "steel"], ...], ...}. Layers are drawn in the
 * part's own space (head space for hair, hats and features, hand space for weapons and off-hands, torso space for
 * tops). See content/README.md for every layer type, colour name and field.
 */
final class Art
{
    /** Part kind => item slot it fills (null: chosen at hero creation, not worn). */
    public const KINDS = ['hair' => null, 'feature' => null, 'hat' => 'head', 'top' => 'top', 'weapon' => 'weapon', 'offhand' => 'offhand'];

    public const LAYERS = ['path', 'ellipse', 'line', 'glow', 'dot', 'poly'];

    public const COLOURS = ['metal', 'dye1', 'dye2', 'skin', 'hair', 'eye', 'gem', 'wood', 'darkwood', 'leather', 'steel', 'iron', 'bone', 'gold', 'paper', 'dark', 'white'];

    /** How a weapon is held and swung; the renderer has a pose for each. */
    public const GRIPS = ['sword', 'axe', 'hammer', 'spear', 'staff', 'wand', 'bow', 'daggers', 'pan', 'fish'];

    /** The base tops a data top is drawn over. */
    public const TOP_BASES = ['tunic', 'plate', 'leather', 'robe', 'sweater'];

    /**
     * The creator's built-in choices (pixel.js draws them; data parts and palettes add to them). The crowd check
     * samples from these, so keep them in step with pixel.js OPTIONS, HAIRS, EYES and RACES[..].skins.
     */
    public const CREATOR = [
        'hair' => ['bald', 'crop', 'spiky', 'long', 'ponytail', 'bob', 'buns', 'mohawk'],
        'eyes' => ['round', 'sharp', 'sleepy', 'sparkle'],
        'mouth' => ['smile', 'grin', 'flat', 'cat', 'tongue'],
        'beard' => ['none', 'stubble', 'moustache', 'full', 'braided'],
        'acc' => ['none', 'glasses', 'eyepatch', 'bandage', 'monocle'],
        'build' => [0.92, 1, 1.1],
        'height' => [0.95, 1, 1.05],
        'hairColor' => ['#2a2220', '#4a2f22', '#8a5a2b', '#d9a441', '#f0e2b0', '#c9502e', '#e9e6e0', '#8f8a85', '#4f6d9c', '#5f8f63', '#b05aa8', '#e88aa8'],
        'eyeColor' => ['#5a3a26', '#8a5a30', '#3f9a4a', '#2f7ae0', '#7a8a96', '#e0a02a', '#d23b3b', '#8a4ad0'],
        'metal' => ['#b8c2cc', '#e0b04a', '#7d7f88', '#c58a5a'],
        'skins' => [
            'human' => ['#f6d7c3', '#eac0a2', '#d9a37f', '#bd8461', '#9a6646', '#7a4d33'],
            'elf' => ['#f8e2d2', '#efd0b6', '#d8b090', '#b98b6c', '#c9c3d8', '#a7b6c9'],
            'dwarf' => ['#f3cfb6', '#e2b394', '#cc9474', '#b07656', '#8e5a3f'],
            'orc' => ['#9fb07a', '#7f9a5e', '#61804a', '#8a9a8c', '#a8876a'],
            'felkin' => ['#e9c9a0', '#c99b6a', '#8f6a4c', '#d8d2c8', '#5b4a43'],
            'draka' => ['#c98d5e', '#a85f4a', '#7c8e6a', '#5f8a8a', '#6d6a8f'],
        ],
    ];

    private static ?array $all = null;

    /** Every choice the hero creator offers, built-in and from data. */
    public static function creator(): array
    {
        $c = self::CREATOR;
        $pal = self::all()['palettes'];
        $c['hair'] = [...$c['hair'], ...array_keys(self::parts('hair'))];
        $c['hairColor'] = array_values(array_unique([...$c['hairColor'], ...($pal['hairs'] ?? [])]));
        $c['eyeColor'] = array_values(array_unique([...$c['eyeColor'], ...($pal['eyes'] ?? [])]));
        $c['dyes'] = Rules::DYES;
        foreach ($c['skins'] as $race => $list) {
            $c['skins'][$race] = array_values(array_unique([...$list, ...($pal['skins'][$race] ?? [])]));
        }
        $c['features'] = [];
        foreach (self::parts('feature') as $id => $f) {
            foreach ($f['races'] as $race) {
                $c['features'][$race][] = $id;
            }
        }

        return $c;
    }

    /** @return array{parts: array<string, array<string, array>>, palettes: array<string, list<string>>} */
    public static function all(?string $dir = null): array
    {
        if ($dir === null && self::$all !== null) {
            return self::$all;
        }
        $root = $dir ?? Dungeons::dir();
        $packs = [];
        foreach (glob($root.'/*/pack.json') ?: [] as $file) {
            $p = json_decode((string) file_get_contents($file), true) ?: [];
            if (($p['enabled'] ?? true) === false) {
                continue;
            }
            $packs[] = [$p['order'] ?? 0, $p['id'] ?? basename(dirname($file)), dirname($file)];
        }
        sort($packs);
        $out = ['parts' => array_fill_keys(array_keys(self::KINDS), []), 'palettes' => []];
        foreach ($packs as [, $pid, $pdir]) {
            $files = glob($pdir.'/art/*.json') ?: [];
            sort($files);
            foreach ($files as $file) {
                $data = json_decode((string) file_get_contents($file), true);
                if (!is_array($data)) {
                    throw new \RuntimeException(basename($file).' is not valid JSON.');
                }
                foreach ($data['parts'] ?? [] as $kind => $parts) {
                    if (!array_key_exists($kind, self::KINDS)) {
                        throw new \RuntimeException(basename($file).": unknown part kind $kind.");
                    }
                    foreach ($parts as $id => $part) {
                        if ($err = self::check($kind, (string) $id, $part)) {
                            throw new \RuntimeException(basename($file).": $err");
                        }
                        $out['parts'][$kind][$id] = $part + ['pack' => $pid];
                    }
                }
                foreach ($data['palettes'] ?? [] as $name => $colours) {
                    if ($name === 'skins') {
                        // more skin tones per race
                        foreach ($colours as $race => $list) {
                            $out['palettes']['skins'][$race] = array_values(array_unique([...($out['palettes']['skins'][$race] ?? []), ...$list]));
                        }
                        continue;
                    }
                    $out['palettes'][$name] = array_values(array_unique([...($out['palettes'][$name] ?? []), ...$colours]));
                }
            }
        }

        return $dir === null ? self::$all = $out : $out;
    }

    /** @return array<string, array> the parts of one kind */
    public static function parts(string $kind): array
    {
        return self::all()['parts'][$kind] ?? [];
    }

    /** Item bases: the built-in ones plus every data part that fills a slot. */
    public static function bases(): array
    {
        static $bases = null;
        if ($bases !== null) {
            return $bases;
        }
        $bases = Rules::BASES;
        foreach (self::KINDS as $kind => $slot) {
            if ($slot === null) {
                continue;
            }
            foreach (self::parts($kind) as $id => $p) {
                $bases[$slot][$id] ??= $p['name'];
            }
        }

        return $bases;
    }

    /** What is wrong with a part, or null. */
    public static function check(string $kind, string $id, mixed $p): ?string
    {
        if (!preg_match('/^[a-z][a-zA-Z0-9]{1,23}$/', $id)) {
            return "part id \"$id\" must be 2 to 24 letters or digits, starting with a lower-case letter.";
        }
        if (!is_array($p) || !is_string($p['name'] ?? null) || $p['name'] === '') {
            return "$kind $id needs a name.";
        }
        if (isset(Rules::BASES[self::KINDS[$kind] ?? ''][$id]) || ($kind === 'hair' && in_array($id, ['bald', 'crop', 'spiky', 'long', 'ponytail', 'bob', 'buns', 'mohawk'], true))) {
            return "$kind $id is already built in.";
        }
        $groups = ['layers', 'back', 'front', 'over', 'icon'];
        if ($kind === 'weapon' && !in_array($p['grip'] ?? null, self::GRIPS, true)) {
            return "weapon $id needs a grip: ".implode(', ', self::GRIPS).'.';
        }
        if ($kind === 'top' && !in_array($p['base'] ?? null, self::TOP_BASES, true)) {
            return "top $id needs a base: ".implode(', ', self::TOP_BASES).'.';
        }
        if ($kind === 'feature' && (!is_array($p['races'] ?? null) || array_diff($p['races'], array_keys(Rules::RACES)))) {
            return "feature $id needs races from: ".implode(', ', array_keys(Rules::RACES)).'.';
        }
        $any = false;
        foreach ($groups as $g) {
            if (!isset($p[$g])) {
                continue;
            }
            if (!is_array($p[$g])) {
                return "$kind $id: $g must be a list of layers.";
            }
            foreach ($p[$g] as $n => $layer) {
                $any = true;
                if ($g === 'icon') {
                    if (!is_array($layer) || !is_string($layer[0] ?? null) || !is_string($layer[1] ?? null)) {
                        return "$kind $id: icon layer $n must be [path, colour, material].";
                    }
                    continue;
                }
                if (!is_array($layer) || !in_array($layer[0] ?? null, self::LAYERS, true)) {
                    return "$kind $id: $g layer $n must start with one of ".implode(', ', self::LAYERS).'.';
                }
                $col = match ($layer[0]) { 'path', 'poly' => $layer[2] ?? null, 'ellipse' => $layer[5] ?? null, 'line' => $layer[5] ?? null, 'glow' => $layer[4] ?? null, 'dot' => $layer[3] ?? null };
                if (!is_string($col) || !self::colourOk($col)) {
                    return "$kind $id: $g layer $n has colour \"".(is_string($col) ? $col : '?').'"; use #rrggbb or '.implode(', ', self::COLOURS).' (optionally with :0.3 to darken or +0.3 to lighten).';
                }
            }
        }

        return $any ? null : "$kind $id has no layers.";
    }

    public static function colourOk(string $c): bool
    {
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $c)) {
            return true;
        }

        return (bool) preg_match('/^('.implode('|', self::COLOURS).')([:+](0(\.\d+)?|1))?$/', $c);
    }
}
