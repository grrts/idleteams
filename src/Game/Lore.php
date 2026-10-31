<?php

namespace App\Game;

/**
 * The lore book of Valdren, read from lore packs in lore/. A pack is a folder with a pack.json and any number of
 * entry files; the base game is one pack and every expansion is another. Packs load in order, and a later pack can
 * add new entries or grow existing ones (more sections, facts and links) without touching the files before it.
 *
 * An entry is keyed "kind:id", for example "race:dwarf", "culture:dwarf.brewhall" or "answer:dwarf.birth.2". Every
 * choice the player makes at creation has a key worked out from the game data (see key()), so showing lore for a
 * choice is a lookup, and covering a new race, class or question is a matter of writing its entries. Text may link
 * to other entries with [[kind:id]] or [[kind:id|words]]. See lore/README.md for the format.
 */
final class Lore
{
    /** Fields a later pack overrides when it grows an entry. Sections, facts and links are added to instead. */
    private const OVERRIDE = ['title', 'kicker', 'summary', 'quote'];

    private static ?array $book = null;

    public static function dir(): string
    {
        return dirname(__DIR__, 2).'/lore';
    }

    /** The key for a lore entry: key('answer', 'elf', 'birth', 2) is "answer:elf.birth.2". */
    public static function key(string $kind, string|int ...$parts): string
    {
        return $kind.':'.implode('.', $parts);
    }

    /**
     * The whole book: [packs => [id => [name, description, core]], shelves => [kind => [title, blurb, hidden]],
     * entries => [key => entry]]. Each entry carries packs (the packs that wrote it) and each section its pack.
     */
    public static function book(?string $dir = null): array
    {
        if ($dir === null && self::$book !== null) {
            return self::$book;
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

        $book = ['packs' => [], 'shelves' => [], 'entries' => []];
        foreach ($packs as $pid => $p) {
            $book['packs'][$pid] = ['name' => $p['name'] ?? $pid, 'description' => $p['description'] ?? '', 'core' => (bool) ($p['core'] ?? false), 'requires' => $p['requires'] ?? []];
            foreach ($p['shelves'] ?? [] as $kind => $shelf) {
                $book['shelves'][$kind] = ($book['shelves'][$kind] ?? []) + $shelf + ['title' => $kind, 'blurb' => '', 'hidden' => false];
            }
            $files = array_filter(glob($p['dir'].'/*.json') ?: [], fn ($f) => basename($f) !== 'pack.json');
            sort($files);
            foreach ($files as $file) {
                foreach (self::read($file)['entries'] ?? [] as $key => $e) {
                    $book['entries'][$key] = self::merge($book['entries'][$key] ?? null, $e, $pid);
                }
            }
        }
        $order = array_flip(array_keys($book['shelves']));
        uksort($book['entries'], fn ($a, $b) => [$order[strtok($a, ':')] ?? 99, $a] <=> [$order[strtok($b, ':')] ?? 99, $b]);

        return $dir === null ? self::$book = $book : $book;
    }

    public static function entry(string $key): ?array
    {
        return self::book()['entries'][$key] ?? null;
    }

    /** Every [[link]] in a piece of text, as keys. */
    public static function links(string $text): array
    {
        preg_match_all('/\[\[([a-z]+:[A-Za-z0-9_.\-]+)(?:\|[^\]]*)?\]\]/', $text, $m);

        return $m[1];
    }

    /**
     * The keys the game asks the book for: every race, class, Path, Origin, culture, backstory, life story answer and
     * Heritage branch. A missing one is a hole in the lore.
     */
    public static function required(): array
    {
        $keys = [];
        foreach (Rules::RACES as $race => $_) {
            $keys[] = self::key('race', $race);
            $keys[] = self::key('heritage', $race);
            foreach (['trunk0', 'trunk1', 'trunk2'] as $b) {
                $keys[] = self::key('heritage', $race, $b);
            }
            foreach (Heritage::TREES[$race]['cultures'] as $culture => $_c) {
                $keys[] = self::key('culture', $race, $culture);
                foreach ([0, 1, 2] as $i) {
                    $keys[] = self::key('heritage', $race, $culture.$i);
                }
            }
            foreach (Heritage::backstories($race) as $id => $_b) {
                $keys[] = self::key('backstory', $race, $id);
            }
            foreach (LifeStory::QUESTIONS[$race] as $qid => $q) {
                if (is_array($q)) {
                    foreach (array_keys($q[1]) as $i) {
                        $keys[] = self::key('answer', $race, $qid, $i);
                    }
                }
            }
        }
        foreach (Rules::CLASSES as $cls => $c) {
            $keys[] = self::key('class', $cls);
            foreach (array_keys($c['paths']) as $path) {
                $keys[] = self::key('path', $cls, $path);
            }
        }
        foreach (Rules::ORIGINS as $origin => $_) {
            $keys[] = self::key('origin', $origin);
        }

        return $keys;
    }

    /** What is wrong with a book: holes, broken links, unknown shelves and packs, entries without words. */
    public static function problems(?array $book = null, bool $coverage = true): array
    {
        $book ??= self::book();
        $out = [];
        $has = fn (string $k) => isset($book['entries'][$k]);
        foreach ($book['packs'] as $pid => $p) {
            foreach ($p['requires'] as $need) {
                if (!isset($book['packs'][$need])) {
                    $out[] = "pack $pid needs pack $need";
                }
            }
        }
        foreach ($book['entries'] as $key => $e) {
            $kind = strtok($key, ':');
            if (!isset($book['shelves'][$kind])) {
                $out[] = "$key: no shelf for '$kind'";
            }
            if (($e['summary'] ?? '') === '') {
                $out[] = "$key: no summary";
            }
            if (($e['title'] ?? '') === '' && !($book['shelves'][$kind]['hidden'] ?? false)) {
                $out[] = "$key: no title";
            }
            $text = implode(' ', [$e['summary'] ?? '', ...array_column($e['sections'] ?? [], 'text'), ...array_column($e['facts'] ?? [], 1)]);
            foreach ([...self::links($text), ...($e['see'] ?? [])] as $link) {
                if (!$has($link)) {
                    $out[] = "$key: links to missing $link";
                }
            }
        }
        if ($coverage) {
            foreach (self::required() as $key) {
                if (!$has($key)) {
                    $out[] = "missing $key";
                }
            }
        }

        return array_values(array_unique($out));
    }

    private static function merge(?array $old, array $new, string $pack): array
    {
        $new['sections'] = array_map(fn ($s) => $s + ['pack' => $pack], $new['sections'] ?? []);
        if ($old === null || !empty($new['replace'])) {
            unset($new['replace']);

            return $new + ['packs' => [...($old['packs'] ?? []), $pack], 'facts' => [], 'see' => []];
        }
        foreach (self::OVERRIDE as $f) {
            if (isset($new[$f])) {
                $old[$f] = $new[$f];
            }
        }
        $old['sections'] = [...($old['sections'] ?? []), ...$new['sections']];
        $old['facts'] = [...($old['facts'] ?? []), ...($new['facts'] ?? [])];
        $old['see'] = array_values(array_unique([...($old['see'] ?? []), ...($new['see'] ?? [])]));
        $old['packs'][] = $pack;

        return $old;
    }

    private static function read(string $file): array
    {
        try {
            return json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new \RuntimeException('Lore file '.$file.' is not valid JSON: '.$e->getMessage(), 0, $e);
        }
    }
}
