<?php

namespace App\Game;

/**
 * Dungeons are data: one JSON file each in content/<pack>/dungeons/. Packs work like lore packs (a pack.json with an
 * order, enabled flag and requires), so an expansion adds dungeons without touching code. See content/README.md.
 *
 * A dungeon names its wings (with the scenery palette), its enemies, its trash packs, its bosses and their
 * mechanics, and the plan: the encounters in order as [kind, id, wing]. The simulator reads it as it is.
 */
final class Dungeons
{
    public const DEFAULT = 'ember-hollow';

    /** What each mechanic type does lives in the simulator; a dungeon picks which ones a boss uses and names them. */
    public const MECHANIC_TYPES = ['buster', 'rain', 'shock', 'curse', 'adds'];

    private static ?array $all = null;

    public static function dir(): string
    {
        return dirname(__DIR__, 2).'/content';
    }

    /** @return array<string, array> every enabled dungeon by id, in order */
    public static function all(?string $dir = null): array
    {
        if ($dir === null && self::$all !== null) {
            return self::$all;
        }
        $root = $dir ?? self::dir();
        $packs = [];
        foreach (glob($root.'/*/pack.json') ?: [] as $file) {
            $p = self::read($file);
            if (($p['enabled'] ?? true) === false) {
                continue;
            }
            $p['dir'] = dirname($file);
            $packs[$p['id'] ?? basename(dirname($file))] = $p;
        }
        uksort($packs, fn ($a, $b) => [$packs[$a]['order'] ?? 0, $a] <=> [$packs[$b]['order'] ?? 0, $b]);
        $all = [];
        foreach ($packs as $pid => $p) {
            $files = glob($p['dir'].'/dungeons/*.json') ?: [];
            sort($files);
            foreach ($files as $file) {
                $d = self::read($file);
                $id = $d['id'] ?? basename($file, '.json');
                $all[$id] = self::normalise($d + ['id' => $id, 'pack' => $pid], $file);
            }
        }
        uasort($all, fn ($a, $b) => [$a['levels'][0], $a['order']] <=> [$b['levels'][0], $b['order']]);

        return $dir === null ? self::$all = $all : $all;
    }

    public static function get(?string $id = null): array
    {
        $all = self::all();

        return $all[$id ?? self::DEFAULT] ?? $all[self::DEFAULT] ?? throw new \RuntimeException('No dungeon '.$id);
    }

    /** The display name of encounter $c: a pack's or a boss's name. */
    public static function label(array $d, int $c): string
    {
        [$kind, $id] = $d['plan'][$c];

        return $kind === 'boss' ? $d['bosses'][$id]['name'] : $d['packs'][$id]['name'];
    }

    /** [[kind, name]] per encounter, as reports and menus show it. */
    public static function plan(array $d): array
    {
        return array_map(fn ($c) => [$d['plan'][$c][0], self::label($d, $c)], array_keys($d['plan']));
    }

    public static function bossCount(array $d): int
    {
        return count(array_filter($d['plan'], fn ($x) => $x[0] === 'boss'));
    }

    /** "1/3" or 0.5: the share of a budget. Fractions keep the arithmetic exactly as x * a / b. */
    public static function share(float $budget, int|float|string $share): float
    {
        if (is_string($share) && preg_match('~^(\d+)/(\d+)$~', $share, $m)) {
            return $budget * (int) $m[1] / (int) $m[2];
        }

        return $budget * (float) $share;
    }

    /** Fills defaults and checks every reference, so a broken file fails loudly at load and in the tests. */
    private static function normalise(array $d, string $file): array
    {
        $fail = fn (string $why) => throw new \RuntimeException(basename($file).': '.$why);
        foreach (['name', 'wings', 'enemies', 'packs', 'bosses', 'mechanics', 'plan'] as $k) {
            isset($d[$k]) || $fail("missing $k");
        }
        $d += ['summary' => '', 'levels' => [1, 0], 'order' => 0];
        foreach ($d['enemies'] as $id => $e) {
            in_array($e['kind'] ?? '', ['add', 'brute', 'shard'], true) || $fail("enemy $id: kind must be add, brute or shard");
            $d['enemies'][$id] += ['art' => $id, 'name' => $id];
        }
        foreach ($d['packs'] as $id => $p) {
            ($p['spawn'] ?? []) || $fail("pack $id spawns nothing");
            foreach ($p['spawn'] as $k => $s) {
                isset($d['enemies'][$s['enemy'] ?? '']) || $fail("pack $id: unknown enemy ".($s['enemy'] ?? '?'));
                $d['packs'][$id]['spawn'][$k] += ['count' => 1, 'health' => 1, 'damage' => 1, 'swing' => 2.0];
            }
        }
        foreach ($d['mechanics'] as $type => $m) {
            in_array($type, self::MECHANIC_TYPES, true) || $fail("unknown mechanic $type");
            if ($type === 'adds') {
                isset($d['enemies'][$m['enemy'] ?? '']) || $fail('adds: unknown enemy');
                $d['mechanics'][$type] += ['count' => 2];
            }
        }
        foreach ($d['bosses'] as $id => $b) {
            foreach (['name', 'health', 'damage', 'enrage', 'hit'] as $k) {
                isset($b[$k]) || $fail("boss $id: missing $k");
            }
            foreach ($b['mechanics'] ?? [] as $m) {
                isset($d['mechanics'][$m]) || $fail("boss $id: mechanic $m is not named in mechanics");
            }
            $d['bosses'][$id] += ['mechanics' => [], 'art' => $id, 'scale' => 3.4];
        }
        foreach ($d['plan'] as $c => $row) {
            [$kind, $id, $wing] = $row + [null, null, null];
            ($kind === 'boss' ? isset($d['bosses'][$id]) : ($kind === 'pack' && isset($d['packs'][$id]))) || $fail("plan $c: unknown $kind $id");
            isset($d['wings'][$wing]) || $fail("plan $c: unknown wing $wing");
        }

        return $d;
    }

    private static function read(string $file): array
    {
        return json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
    }
}
