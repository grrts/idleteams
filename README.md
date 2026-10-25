# Idle Teams

A playable proof of concept of the Idle Teams game plan: a group of five real players fights long battles
together, loot goes into one group chest, and character growth (attributes, skills, Path, Keystones, gear)
is the core of the game.

It is a plain Symfony 7.4 LTS application. The server owns every rule and simulates every battle; the browser
client is a single page of vanilla JavaScript in `public/assets/` with no build step.

## What you can do in the proof of concept

- Create an account and a hero: race, class and Origin (each with pre-spent points and a passive), and a look.
  The creator shows the hero in plain clothes; gear comes from play.
- Hero sheet: 18 attributes with a breakdown of where every point comes from, the soft cap, combat stats and
  the percentage curves. Path at level 10, the Oath at 20 (seals the Path and carves in spent points),
  permanent Keystones at 15, 25, 35, 45 and every 25 levels after 50. Levels are uncapped.
- Skills: ranks (one point per level), a loadout of five, ultimate at 20, two more class skills at 12 and 16.
- Talents: one talent point per level from 2. Every class has a tree that starts from one root and branches out
  into ten directions of four nodes each (minor, minor, a notable that needs 6 points in the tree, a capstone that
  needs 15). Many notables and capstones teach a new skill. Resetting costs gold.
- Heritage: every race has a tree with a shared trunk and three cultures (for example Ironhold, Brewhall and
  Runedeep for dwarves). Follow one culture to open its branch. Heritage ranks come from Renown, which runs pay
  mostly for kin: every other hero of your race adds Renown, more if they follow your culture. Kin in the group
  also give a combat bonus through Kinship nodes. Changing culture costs gold and refunds its points.
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
| `src/Game/Talents.php`, `Heritage.php` | The class talent trees and the race and culture Heritage trees, with Renown |
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
whole dungeon at levels 1 to 50. Groups without a tank or a healer fail, as intended. Known gaps: a Warden plus
Druid group falls behind on damage at level 50, and level 80+ needs another pass once gear past 50 is
designed. Every number lives in `Rules.php`, `Stats.php` and `Simulator.php`.

## Browser build

`browser-build/` runs the whole game inside one page with no server: `data.js`, `engine.js` and `server.js` stand in
for the Symfony API, and the page saves to the browser. `php bin/console app:browser-data` rewrites `data.js` from the
PHP rules; `engine.js` and `server.js` are hand ports and change with the PHP. To assemble it, copy `pixel.js`, `art.js`, `arena.js`, `app.js`
and `app.css` from `public/assets/` next to `browser-build/index.html` and open that page from any static host.

## Art

Everything is drawn in code at runtime, so there are no image files to keep in sync. `pixel.js` draws heroes,
`art.js` draws item icons, UI and skill icons, monsters and the dungeon scenery, and `arena.js` plays back a
battle on a canvas with hit numbers, projectiles, mechanics and the boss HUD.
