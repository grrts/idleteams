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
| `levels` | `[from, to]` the level band; `0` means no upper end |
| `order` | Sorts dungeons with the same starting level |
| `wings` | `name` and `scene`, the scenery palette (`sky`, `rock`, `rock2`, `floor`, `floor2`, `glow`, `accent`, `prop`: `lava`, `crystal` or `forge`) |
| `enemies` | `id: { name, kind, art }`. `kind` is `add`, `brute` (the tank must hold it) or `shard` (boss adds); `art` is a sprite key in `public/assets/art.js` (`imp`, `brute`, `shard`, `hound`, `matron`, `golem`) |
| `packs` | `id: { name, spawn: [{ enemy, count, health, damage, swing }] }`. A pack shares one health budget: `health` is each enemy's share, as a number or a fraction such as `"1/3"`. `damage` multiplies a normal hit (default 1), `swing` is seconds between hits (default 2) |
| `bosses` | `id: { name, art, scale, health, damage, enrage, hit, mechanics }`. `health` and `damage` are shares of a full boss (1.0 is the hardest), `enrage` is the second the boss enrages, `hit` names its melee attack, `mechanics` lists the mechanics it uses |
| `mechanics` | Names the mechanics of this dungeon: `buster` (hits the tank hard), `rain` (hits everyone; `fire: true` makes it fire), `shock` (knocks back), `curse` (burns a random non-tank), `adds` (spawns `count` of `enemy` at half health). Each may set `at` (first use, seconds into the fight) and `every` (repeat) |
| `plan` | The encounters in order: `["pack", packId, wing]` or `["boss", bossId, wing]` |

Health and damage scale with the dungeon level and the reference group (`src/Game/Reference.php`), so a file never
holds absolute numbers. Check a new dungeon with `php bin/console app:balance`.
