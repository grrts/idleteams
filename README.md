# Idle Teams

A playable proof of concept of the Idle Teams game plan: a group of five real players fights long battles
together, loot goes into one group chest, and character growth (attributes, skills, Path, Keystones, gear)
is the core of the game.

It is a plain Symfony 7.4 LTS application. The server owns every rule and simulates every battle; the browser
client is a single page of vanilla JavaScript in `public/assets/` with no build step.

## What you can do in the proof of concept

- Create an account and a hero: race, class and Origin (each with pre-spent points and a passive), and a look.
  The creator shows the hero in plain clothes; gear comes from play.
- Hero sheet: 23 attributes with a breakdown of where every point comes from, the soft cap, combat stats and
  the percentage curves. Path at level 10, the Oath at 20 (seals the Path and carves in spent points),
  permanent Keystones at 15, 25, 35, 45 and every 25 levels after 50. Levels are uncapped.
- Skills: ranks (one point per level), a loadout of five, ultimate at 20, two more class skills at 12 and 16.
- Talents: two talent points per level from 2. Every class has a map of 1,661 nodes: one root, ten branches,
  each with seven lanes thirty rings deep. Lanes link along their length and across at every fifth ring, and
  neighbouring branches link at their hubs, so builds can cross over. A branch teaches a skill (or grants a
  capstone) at ring 15 and ends in a mastery at ring 30; the outer lanes end in twenty trade-off keystones.
  Learn any node next to one you have, or learn the whole path to a far node in one go. The map pans, zooms
  and searches. Resetting costs gold.
- Life story: written at creation, after race, class and Origin and before the look and the name. It is told one
  question at a time, and each chapter opens with a scene written for that race. Seventeen questions in five chapters (family, childhood,
  coming of age, setting out, who you are), worded differently for every race, with four answers each and an
  optional note in your own words. The answers become a biography on the hero sheet. Where you were raised sets
  your culture; what you were known for (nine per race, one per culture branch) starts you at Heritage rank 3
  with the first steps of that branch learned, a small lasting edge and 10% more Renown while you follow that
  culture; the story leans to the three attributes it names most, +2 each. Kin who share your upbringing count
  three times. Heroes made earlier write theirs once from the Heritage page.
- Heritage: every race has a map of 1,201 nodes: three trunk branches and three cultures (for example Ironhold,
  Brewhall and Runedeep for dwarves) of three branches each, five lanes twenty-four rings deep. Follow one
  culture to open its branches. Heritage ranks come from Renown, which runs pay mostly for kin: every other hero
  of your race adds Renown, more if they follow your culture. Each rank gives two points. Kin in the group also
  give a combat bonus through Kinship nodes (capped at 30%). Changing culture costs gold and refunds its points.
- Attributes: every attribute does something for every class. Besides its own effect, each one has a class
  effect (for example Arcana raises a guardian's block, Might adds to a cleric's healing), shown on the hero
  sheet. New: Insight (raises Might, Arcana and Spirit), Tenacity (less damage taken), Hunger (lifesteal),
  Thrift (cheaper skills) and Lore (more XP and Renown).
- Gear: wear anything (nothing binds), temper, socket glyphs for Resonance at 3/6/9, imprint Codex powers,
  reforge from level 50, salvage, craft, give to another player, sell on the market.
- Group: start a group or join one from the tavern board, invite heroes, set the dungeon level, rest.
- Battle: when the group has five heroes, it runs one dungeon, Ember Hollow: three wings, each with trash
  packs and then a boss (Cinder Hound, Slag Matron, Ember Golem). The run is simulated on the server and
  played out on every member's screen in step with the clock, walking between fights. When it ends, every
  run pays materials (plus XP and gold for each fight won), and each boss may drop an item into the group
  chest for need/greed/pass. Loot is never guaranteed. Players who are away roll by their loot setting
  when the chest closes.
- Guilds and chat (tavern, guild and group channels).

## Run it locally

Requirements: PHP 8.2+ (8.3 recommended) with `pdo_sqlite`, `intl` is optional, and Composer.

```bash
composer install
php bin/console doctrine:schema:create   # on an existing database: doctrine:schema:update --force
php bin/console app:demo:seed          # optional: demo heroes so you can fill a group alone
php -S 127.0.0.1:8000 -t public        # or: symfony serve
```

Open http://127.0.0.1:8000, create an account and a hero, then go to **Group** and ask to join
"The Ember Watch". Its four demo heroes accept right away and the first battle starts. Battles take
2.5 minutes in the local setup (see the game clock below).

Demo heroes are played by the server: they spend points, pick Paths and Keystones, wear upgrades and roll
on loot. Invite the ones on the tavern board to your own group and they accept at once.

Run the tests with `vendor/bin/phpunit`, and the balance harness with `php bin/console app:balance`
(full-clear rates for five group mixes at several levels).

## Host it

Any host that runs a Symfony app works: a small VPS, Platform.sh, a managed PHP host. You need PHP 8.2+,
a database and cron.

1. **Code**: `git clone`, then `composer install --no-dev --optimize-autoloader`.
2. **Settings**: create `.env.local` (never committed):
   ```dotenv
   APP_ENV=prod
   APP_SECRET=<32 random characters>
   DATABASE_URL="mysql://idleteams:secret@127.0.0.1:3306/idleteams?serverVersion=8.0&charset=utf8mb4"
   # or: postgresql://idleteams:secret@127.0.0.1:5432/idleteams?serverVersion=16&charset=utf8
   GAME_BATTLE_SECONDS=10800      # 3 hour battles
   GAME_CHEST_SECONDS=3600        # chest stays open 1 hour
   GAME_OFFLINE_CAP_SECONDS=43200 # battles keep chaining 12 hours after the last member was seen; a wipe stops the chain until a member sends the group back in
   ```
   Then `composer dump-env prod` and `php bin/console cache:clear`.
3. **Database**: `php bin/console doctrine:schema:create` the first time. After you change entities, use
   `php bin/console doctrine:schema:update --dump-sql` to review and `--force` to apply, or switch to
   migrations (`doctrine:migrations:diff` / `migrate`, already installed) once the schema settles.
4. **Web server**: point the document root at `public/`. Nginx:
   ```nginx
   root /var/www/idleteams/public;
   location / { try_files $uri /index.php$is_args$args; }
   location ~ ^/index\.php(/|$) {
       fastcgi_pass unix:/run/php/php8.3-fpm.sock;
       include fastcgi_params;
       fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
       internal;
   }
   ```
   Apache: `composer require symfony/apache-pack` adds the `.htaccess`.
5. **Cron**: once a minute, so chests close and offline groups move on even when nobody has the game open:
   ```
   * * * * * cd /var/www/idleteams && php bin/console app:tick > /dev/null 2>&1
   ```
   The game also moves forward whenever a member opens it, so a missed tick never loses rewards.
6. Skip `app:demo:seed` in production unless you want the demo heroes there.

## How the code is laid out

| Where | What |
| --- | --- |
| `src/Game/Rules.php` | All static game data: attributes, races, classes, Origins, skills, Keystones, slots, glyphs, powers |
| `src/Game/LifeStory.php` | The life story questions for every race, the biography and how the answers feed Heritage |
| `src/Game/TreeMap.php` | Builds the radial node maps, checks them and finds paths |
| `src/Game/Talents.php`, `Heritage.php` | The class talent maps and the race and culture Heritage maps, with Renown. The client loads a map from `GET /api/tree/{talent\|heritage}/{key}` |
| `src/Game/Stats.php` | Build → attributes (with sources) → combat stats; the percentage curve and soft cap |
| `src/Game/Items.php` | Item and glyph generation, names, tempering and salvage values |
| `src/Game/Simulator.php` | The deterministic battle simulation (packs, the Ember Golem, mechanics, AI, timeline for playback) |
| `src/Game/Reference.php` | The reference group enemies are scaled from, so balance holds at every level |
| `src/Service/Game.php` | The game clock: starting and settling battles, XP and levels, Oath Day, the group chest |
| `src/Service/*Actions.php`, `Social.php` | Player actions: growth, gear, groups, tavern, guilds, chat |
| `src/Service/Bots.php` | Plays the demo heroes |
| `src/Controller/` | The JSON API under `/api` and the page shell |
| `src/Command/` | `app:tick` (cron), `app:demo:seed`, `app:balance`, `app:browser-data` |
| `public/assets/` | The client: `app.js`, `app.css` and the pixel sprite renderer `pixel.js` |

## Balance notes

`app:balance` shows where tuning stands. A balanced group (guardian, cleric, ranger, mage, rogue) clears the
whole dungeon at levels 1 to 65, 85% at 80, 95% at 100 and all of it at 120. Enemy health follows the reference
group's damage with talents; enemy hits follow its health and healing without them, so defensive talents make
a tank tougher instead of making enemies hit everyone harder. Groups without a tank or a healer fail, as
intended. Known gaps: a Warden plus Druid group falls behind on damage from level 50, and level 80+ needs
another pass once gear past 50 is designed. Every number lives in `Rules.php`, `Stats.php` and `Simulator.php`.

## Browser build

`browser-build/` runs the whole game inside one page with no server: `data.js`, `engine.js` and `server.js` stand in
for the Symfony API, and the page saves to the browser. `php bin/console app:browser-data` rewrites `data.js` from the
PHP rules; `engine.js` and `server.js` are hand ports and change with the PHP. To assemble it, copy `pixel.js`, `sfx.js`, `art.js`, `arena.js`, `app.js`
and `app.css` from `public/assets/` next to `browser-build/index.html` and open that page from any static host.

## Art

Everything is drawn in code at runtime, so there are no image files to keep in sync. `pixel.js` draws heroes,
`art.js` draws item icons, UI and skill icons, monsters and the dungeon scenery, and `arena.js` plays back a
battle on a canvas with hit numbers, projectiles, mechanics and the boss HUD. `art.js` also draws the interface skin (pixel frames, buttons, textures) that `app.css` uses through `--ui-*` variables, and `sfx.js` synthesises every sound with Web Audio, with a mute toggle.
