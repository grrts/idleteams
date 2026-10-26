# The lore book

All world lore lives here as data. The game reads it through `src/Game/Lore.php`, serves it at `GET /api/lore`,
and the browser build carries it in `data.js`. Nothing in the client is written per entry: every character choice
has a key, and showing its lore is a lookup.

## Packs

Every folder with a `pack.json` is a lore pack. The base game is `base/`. An expansion is a new folder next to it:

```
lore/
  base/            the base game ("The Pact of Five")
    pack.json
    world.json     the world, history, places, powers, faiths, bestiary, Hollows
    human.json     a people: race, Heritage, cultures, backstories and every life story answer
    ...
  frostfall/       an expansion
    pack.json
    north.json
```

`pack.json`:

```json
{
  "id": "frostfall",
  "name": "Frostfall",
  "description": "One sentence for the lore book's list of packs.",
  "order": 10,
  "requires": ["base"],
  "enabled": true,
  "shelves": { "region": { "title": "Regions", "blurb": "Shown at the top of the shelf." } }
}
```

Packs load by `order`. `core: true` marks the base game; sections from any other pack carry a badge with the pack's
name in the lore book. `enabled: false` keeps a finished pack out of the game until release. A pack can add shelves
(the categories of the lore book); a shelf with `hidden: true` is looked up but not listed.

## Entries

Every other `.json` file in a pack holds `{ "entries": { "key": entry } }`. Files load alphabetically.

```json
"culture:dwarf.brewhall": {
  "title": "Brewhall",
  "kicker": "Brewers, cooks and storytellers",
  "summary": "One or two sentences. Shown wherever the choice is made.",
  "sections": [{ "title": "The hold", "text": "Paragraphs may link: [[place:greyteeth|the Greyteeth]] or [[race:dwarf]]." }],
  "facts": [["Known for", "Ale, stew, sagas"]],
  "quote": ["Patience is just thirst with discipline.", "Brewhall brewmaster's saying"],
  "see": ["race:dwarf", "heritage:dwarf"]
}
```

Only `summary` is always required, and `title` on every listed shelf. Links in `summary`, `sections`, `facts`
and `see` must point at an entry that exists.

### Growing an entry from a later pack

Write the same key in the expansion. Sections, facts and `see` links are added after the earlier ones; `title`,
`kicker`, `summary` and `quote` replace the earlier ones only if the new pack sets them. Add `"replace": true` to
throw the earlier entry away instead. The base files never need to change.

## Keys the game asks for

| Choice | Key |
| --- | --- |
| Race | `race:{race}` |
| Class and Path | `class:{class}`, `path:{class}.{path}` |
| Origin (Sign) | `origin:{origin}` |
| Culture (where you were raised) | `culture:{race}.{culture}` |
| Backstory (what you were known for) | `backstory:{race}.{backstory}` |
| Life story answer | `answer:{race}.{question}.{index}` (index from 0, in the order of `LifeStory::QUESTIONS`) |
| Heritage map | `heritage:{race}` for the root, `heritage:{race}.{branch}` for a branch (`trunk0`-`trunk2`, `{culture}0`-`{culture}2`) |

World entries use free ids on their own shelves: `world:`, `era:`, `place:`, `faction:`, `faith:`, `beast:`, `hollow:`.

When the game gains a race, class, Origin, culture, backstory or question, `Lore::required()` asks for its entries
and `tests/Game/LoreTest.php` fails until they are written. Run `php bin/console app:browser-data` after changing
lore so the browser build carries it.
