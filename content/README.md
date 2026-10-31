# Game content

Game content that grows with the game lives here as data, in packs, the same way as the lore book (`lore/`).
Every folder with a `pack.json` is a pack; the base game is `base/`, and an expansion is a new folder next to it.

```json
{ "id": "frostfall", "name": "Frostfall", "order": 10, "requires": ["base"], "enabled": true }
```

Packs load by `order`. `enabled: false` keeps a finished pack out of the game until release.

## Dungeons

One file per dungeon in `<pack>/dungeons/<id>.json`. The server simulates it (`src/Game/Simulator.php`), the playable
build carries it in `browser-build/data.js` (run `php bin/console app:browser-data`), and the client draws it from the
names and art keys in the file. `tests/Game/DungeonsTest.php` loads and runs every dungeon, and a broken reference
fails at load with the file name and what is wrong.

| Field | What it is |
| --- | --- |
| `id`, `name`, `summary` | The id is what battles store; keep it once players have run the dungeon |
| `levels` | `[from, to]` the level band. A group may enter every dungeon whose band starts at or below its median level, runs the newest by default, and fights an older one at the top of its band. `0` means no upper end |
| `lore` | The lore entry for the dungeon (default `hollow:<id>`); every boss also names its `lore` entry. The tests check they exist |
| `order` | Sorts dungeons with the same starting level |
| `wings` | `name` and `scene`, the scenery palette (`sky`, `rock`, `rock2`, `floor`, `floor2`, `glow`, `accent`, `prop`: `lava`, `crystal` or `forge`) |
| `enemies` | `id: { name, kind, art, tint }`. `tint` is `[hue shift, saturation, lightness]` to recolour shared art until a dungeon has its own. `kind` is `add`, `brute` (the tank must hold it) or `shard` (boss adds); `art` is a sprite key in `public/assets/art.js` (`imp`, `brute`, `shard`, `hound`, `matron`, `golem`) |
| `packs` | `id: { name, spawn: [{ enemy, count, health, damage, swing }] }`. A pack shares one health budget: `health` is each enemy's share, as a number or a fraction such as `"1/3"`. `damage` multiplies a normal hit (default 1), `swing` is seconds between hits (default 2) |
| `bosses` | `id: { name, art, scale, health, damage, enrage, hit, mechanics }`. `health` and `damage` are shares of a full boss (1.0 is the hardest), `enrage` is the second the boss enrages, `hit` names its melee attack, `mechanics` lists the mechanics it uses |
| `mechanics` | Names the mechanics of this dungeon: `buster` (hits the tank hard), `rain` (hits everyone; `fire: true` makes it fire), `shock` (knocks back), `curse` (burns a random non-tank), `adds` (spawns `count` of `enemy` at half health). Each may set `at` (first use, seconds into the fight) and `every` (repeat) |
| `plan` | The encounters in order: `["pack", packId, wing]` or `["boss", bossId, wing]` |

Health and damage scale with the dungeon level and the reference group (`src/Game/Reference.php`), so a file never
holds absolute numbers. Check a new dungeon with `php bin/console app:balance`.

## Art

Parts for the pixel renderer, in `<pack>/art/*.json`: `{ "parts": { kind: { id: part } }, "palettes": {...} }`. The
renderer (`public/assets/pixel.js`) draws them, `art.js` makes their item icons, and worn kinds become item bases that
drop like the built-in ones (`src/Game/Art.php`). The fastest way to make one is the **art workshop** in the game
(Settings → Art workshop, or `#/workshop`): draw on a grid, see it on every race in three colour sets and as an icon
in each rarity, and copy the JSON into a file here. `tests/Game/ArtTest.php` checks every part, and a broken part
fails at load with its file and what is wrong. `php bin/console app:crowd` checks that random crowds still look varied.

| Kind | Drawn in | Fields besides `name` |
| --- | --- | --- |
| `hat` | head space | `layers`, optional `back` (behind the head), `covers: true` hides the hair |
| `hair` | head space | `front`, optional `back`, `shine` (the highlight arc on the crown) |
| `feature` | head space | `races` (who may pick it), `layers` (on the face), `back`, `over` (after hats), `replaces: ["ears", "horns"]` |
| `weapon` | hand space | `layers`, `grip`: how it is held and swung (`sword`, `axe`, `hammer`, `spear`, `staff`, `wand`, `bow`, `daggers`, `pan`, `fish`) |
| `offhand` | hand space | `layers` |
| `top` | torso space | `layers`, `base`: the garment it is drawn over (`tunic`, `plate`, `leather`, `robe`, `sweater`), optional `sleeve` colour |

**Spaces.** Head space is centred on the head (radius about 12.5, the face toward −x, the crown near y −15). Hand
space has the hand at 0,0 and the weapon pointing up (−y); a sword blade runs from −3 to −25. Torso space runs `u`
from −1 to 1 across the chest and `v` from 0 at the shoulders to 1 at the hips (a robe hem goes past 1).

**Layers**, drawn in order, each shaded and outlined by the renderer:
`["path", "M… L… Q… C… Z", colour, opts?]` (SVG path subset), `["poly", [[u, v], …], colour, opts?]`,
`["ellipse", x, y, rx, ry, colour, opts?]`, `["line", x1, y1, x2, y2, colour]`, `["dot", x, y, colour]` and
`["glow", x, y, r, colour]`. `opts` may be `{ "on": "face" }` (only where the face is, for markings),
`{ "on": "self" }` (only on the layer before) and `"flat": true` (no shading).

**Colours** are `#rrggbb` or a name: the hero's or item's `dye1`, `dye2`, `metal`, and `skin`, `hair`, `eye`, `gem`, or
the fixed `steel`, `iron`, `gold`, `wood`, `darkwood`, `leather`, `bone`, `paper`, `dark`, `white`. Add `:0.3` to darken
or `+0.3` to lighten a name. Items with a rarity palette or a dye recolour `dye1`, `dye2` and `metal`.

**Palettes** add creator choices: `hairs`, `eyes` (colour lists) and `skins` (`{ race: [colours] }`). Item dyes are
`Rules::DYES`.

An item icon is drawn from the part's own layers, fitted to the box; a part may instead give `icon` as
`[[path, colour, material], …]` in a 32 px box centred on 0,0.
