# Idle Teams

A playable proof of concept of the Idle Teams game plan: a group of five real players fights long battles
together, loot goes into one group chest, and character growth (attributes, skills, Path, Keystones, gear)
is the core of the game.

It is a plain Symfony 7.4 LTS application. The server owns every rule and simulates every battle; the browser
client is a single page of vanilla JavaScript in `public/assets/` with no build step.

## What you can do in the proof of concept

- Create an account and a hero. The creator is one tale you finish a sentence at a time: "There once was… an
  orc", "who would one day answer the call of… the shield", "born under the sign of… the Wolf", then the life
  story, the likeness and the name. It shows no numbers: race, class and Origin still bring their pre-spent
  points and passives, but those are only shown once the hero exists. The likeness is shown in plain clothes;
  gear comes from play.
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
- After the story: Heroic opens for a dungeon once the group outgrows it (its median level reaches the top of the
  band): tougher enemies at the group's own level, 25% more rewards and better items. At level 50 the leader can
  pick Mythic, an endless ladder: each tier adds health and damage, a clear moves the group up a tier (the leader
  may step down to any tier up to one past the best cleared), and item levels and rewards grow with the tier. The
  week's affixes (Monday to Monday, UTC) change fights: Fortified or Tyrannical from tier 1, and Volcanic, Raging,
  Bolstering or Quaking from tier 4. Every fifth new best posts to the guild. Rules in `src/Game/Modes.php`.
- Guilds and chat (tavern, guild and group channels). The guild hall: a bank for items and gold (members take two
  items a day, the leader and officers anything, and every move is logged), a notice board, ranks (leader and
  officers), and three weekly goals from a pool scaled to the guild's size that members' runs fill; a finished goal
  pays everyone who helped. Guild levels open rooms (notice board, trophy wall, a bigger vault, guild tags in chat, a
  Mythic gallery), never combat power. Rules in `src/Game/GuildHall.php`.
- Guild raids: The Sundered Keep, for up to forty heroes of level 50 and up in eight squads of five. An officer plans
  the night, members sign up with their role, and the planner puts them into squads (by hand or automatically, with
  a tank and a healer in each where there are enough) and onto four fronts. Every squad fights its front at once; with
  three fronts taken, the squads that held theirs face the Sundered King. One raid a week per guild; every raider is
  paid, and may find an item straight in their bags. Rules in `src/Game/Raids.php`, raids in `content/*/raids/`.
  The playable build has no raids (it holds one group, not forty heroes).
- Alternate heroes: an account keeps up to six heroes and plays one at a time (Settings, Your heroes). They share the
  wardrobe and the Codex; each keeps its own group, guild, gear, gold and story. A hero more than five levels behind the
  account's best earns half again as much XP, and double below half its level. Rules in `src/Service/Roster.php` and
  `Rules::catchUp`. The playable build keeps one hero.
- Your data: Settings has Download my data (`GET /api/account/export`, every row kept about the account as JSON) and
  Delete my account (password confirms; heroes leave their group and guild the way leaving does, and everything the
  account wrote goes). Terms and privacy policy at `/terms` and `/privacy`; set `LEGAL_OPERATOR`, `LEGAL_ADDRESS` and
  `LEGAL_CONTACT` before launch and have a lawyer read both. Fonts are served from `public/assets/fonts/`, so no
  request leaves for Google; one session cookie is the only cookie. The service worker keeps the game's files and shows
  an offline note.
- Shop (★ Shop, top right): looks for the wardrobe, a 30-day supporter pass (a star in chat and a circlet, no
  renewal) and the season track's premium side. Nothing sold adds power. Offers are data (`content/<pack>/shop/`), and
  shop-only art carries `"shop": true` so it never drops or gets crafted. Payment is Stripe Checkout: set
  `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and point a Stripe webhook at `/api/shop/webhook` for
  `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`. Nothing is given
  until the signed webhook says it is paid; a full refund takes it back. Without a key the shop shows but is closed.
- Seasons are data (`content/<pack>/seasons/`): a start Monday, a length and a cosmetic track of 20 tiers. Runs earn
  track points for the account (a clear, each boss, more on Heroic and Mythic); every second tier has a free look and
  every tier a premium one. Rules in `src/Game/Seasons.php`.
- First-day funnel: each account keeps when it first made a hero, finished the prologue, joined a group, ran, cleared,
  reached levels 10 and 20, and came back the next day and after a week. Moderators see cohort totals by sign-up day
  in Settings (First days) or with `php bin/console app:funnel --days=14`.
- Front page: a logged-out visitor sees a group of random heroes, what the game is, and the login form.
- Lore: a lore book of the world of Valdren, about 600 entries: its history, places, powers, faiths, bestiary and
  Hollows, the six peoples and their eighteen cultures, the seven classes and their Paths, the twelve Origins, every
  backstory, every life story answer and every Heritage branch. The creator shows the lore of each choice as it is
  made (every life story answer carries a note), the life story page and the Heritage map show the lore of the hero's
  choices, and the Lore page is the whole book with shelves and search. Lore is data in `lore/`, in packs: an
  expansion is a new folder that adds entries or grows existing ones (see `lore/README.md`).

- Accounts: an optional email address, confirmed through a link in a mail, and password reset by mail (Settings
  window, and "Forgot your password?" on the login screen).
- Safety: tap a name in chat to report the line or block the hero. Three different players reporting the same author
  within a day mute them for an hour until a moderator looks. Moderators (`php bin/console app:admin <username>`; the
  account logs in again after) get a queue in Settings: dismiss, remove the line, or remove and mute. Login attempts,
  sign-ups, mails, chat lines and API calls are rate limited (`config/packages/rate_limiter.yaml`).
- Notifications: the game installs as an app (PWA) and, once turned on in Settings, tells a player who is away when the
  group falls, when there is loot to roll on, when they level up and when someone invites them or asks to join. Pushes
  carry no data (no encryption library needed); the service worker `public/sw.js` fetches what to show. They need HTTPS
  and the `VAPID_*` settings below; without them the Settings panel says notifications are not set up.

## Run it locally

Requirements: PHP 8.2+ (8.3 recommended) with `pdo_sqlite`, `intl` is optional, and Composer.

```bash
composer install
php bin/console doctrine:migrations:migrate -n   # builds or updates the schema
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

## Working rules

- `main` is the source of truth. Every change lands through a pull request; CI (`.github/workflows/ci.yml`) runs the
  tests on SQLite, MySQL and Postgres, checks that the migrations match the entities, runs the balance harness and
  checks that `browser-build/data.js` is current.
- The playable link is built from `main`: run `php bin/console app:browser-data`, then publish `browser-build/` together
  with the files in `public/assets/`. Never edit the published copy by hand.

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
   MAILER_DSN=smtp://user:pass@smtp.example.com:587   # for verification and password reset mails
   MAILER_FROM="Idle Teams <noreply@your-domain>"
   APP_URL=https://your-domain                         # links in mails point here
   VAPID_PRIVATE_KEY=...          # web push; make one with: php bin/console app:push:keys
   VAPID_SUBJECT=mailto:you@your-domain
   MERCURE_URL=http://127.0.0.1:3000/.well-known/mercure          # live updates; leave empty to poll
   MERCURE_PUBLIC_URL=https://your-domain/.well-known/mercure
   MERCURE_JWT_SECRET=<32+ random characters, the same as the hub's>
   ERROR_WEBHOOK_URL=https://hooks.slack.com/services/...  # optional: server errors are posted here
   ```
   Then `composer dump-env prod` and `php bin/console cache:clear`.
3. **Database**: `php bin/console doctrine:migrations:migrate -n` on every deploy. It creates the schema the first
   time and applies new migrations after that. When you change an entity, run
   `php bin/console app:migration "what changed"`: it writes the migration with Doctrine's schema API, so the same file
   works on SQLite, MySQL and Postgres. Read it before committing; a test fails if the migrations and entities differ.
   A database made earlier with `doctrine:schema:create` already has the baseline tables: mark it as migrated once with
   `php bin/console doctrine:migrations:version 'DoctrineMigrations\Version20261031000000' --add -n`.
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
6. **Live updates** (optional): run a [Mercure hub](https://mercure.rocks) next to the app and proxy
   `/.well-known/mercure` on the game's own domain to it, so the subscriber cookie reaches it. Give the hub the same
   secret as `MERCURE_JWT_SECRET` for both publishers and subscribers. With nginx:
   ```nginx
   location /.well-known/mercure {
       proxy_pass http://127.0.0.1:3000;
       proxy_read_timeout 24h;
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_buffering off;
   }
   ```
   The app only sends pings ("your group changed", "a new line in guild chat"), never game data; the browser then
   reads the API as before. Each player's cookie, refreshed with every `/api/state`, lets them hear only their own
   topics. Without a hub, or while it is down, the client polls every few seconds as before; with it, polling slows
   to a safety net every 30 seconds or so.
7. **Backups**: `php bin/console app:backup` writes a gzipped copy of the database to `var/backups/` (or `--dir`) and
   removes copies older than `--keep` days (14). SQLite is copied with `VACUUM INTO`; MySQL and Postgres need
   `mysqldump` or `pg_dump` on the machine. Run it nightly and copy the folder somewhere else:
   ```
   30 3 * * * cd /var/www/idleteams && php bin/console app:backup && rclone copy var/backups remote:idleteams-backups
   ```
   To restore: stop cron, then `gunzip -c file.sqlite.gz > var/data.db`, or `gunzip -c file.sql.gz | mysql idleteams`,
   or `pg_restore --clean -d idleteams file.pgdump`.
8. **Errors and uptime**: server errors (never a player's mistake) are logged, and posted to `ERROR_WEBHOOK_URL` if set,
   at most once per 10 minutes for the same error, with a count. Point an uptime monitor at `/api/health`: it answers
   200 while the database answers and the cron tick ran in the last five minutes, and 503 otherwise.
9. **Updates**: `bin/deploy` (or `bin/deploy <tag>`) fetches, installs, backs up, migrates and clears the cache, then
   prints how to go back. `RELOAD_CMD="sudo systemctl reload php8.3-fpm"` and `HEALTH_URL=https://your-domain/api/health`
   make it reload PHP and check health at the end. A step back to an older version does not undo migrations; restore
   the backup it took if a migration has to be undone.
10. **Load test** (on a scratch database only; it refuses a database with real accounts):
   `DATABASE_URL=sqlite:///%kernel.project_dir%/var/load.db php bin/console app:load-test --groups=200 --steps=6`
   makes 200 groups of five and times the cron tick on a simulated clock. On SQLite in a small container 1,000 heroes
   tick in about 3 seconds on average and 9 at worst (every group finishing and starting a battle at once).
11. Skip `app:demo:seed` in production unless you want the demo heroes there.

## How the code is laid out

| Where | What |
| --- | --- |
| `src/Game/Rules.php` | All static game data: attributes, races, classes, Origins, skills, Keystones, slots, glyphs, powers |
| `src/Game/Lore.php`, `lore/` | The lore book: lore packs merged in order, the key for every character choice, and the checks that every choice has lore and every link resolves |
| `src/Game/LifeStory.php` | The life story questions for every race, the biography and how the answers feed Heritage |
| `src/Game/TreeMap.php` | Builds the radial node maps, checks them and finds paths |
| `src/Game/Talents.php`, `Heritage.php` | The class talent maps and the race and culture Heritage maps, with Renown. The client loads a map from `GET /api/tree/{talent\|heritage}/{key}` |
| `src/Game/Stats.php` | Build → attributes (with sources) → combat stats; the percentage curve and soft cap |
| `src/Game/Items.php` | Item and glyph generation, names, tempering and salvage values |
| `src/Game/Simulator.php` | The deterministic battle simulation (packs, the Ember Golem, mechanics, AI, timeline for playback) |
| `src/Game/Modes.php` | Heroic and Mythic: when they open, tiers, weekly affixes, enemy modifiers and rewards |
| `src/Game/Reference.php` | The reference group enemies are scaled from, so balance holds at every level |
| `src/Service/Game.php` | The game clock: starting and settling battles, XP and levels, Oath Day, the group chest |
| `src/Service/*Actions.php`, `Social.php` | Player actions: growth, gear, groups, tavern, guilds, chat |
| `src/Service/Bots.php` | Plays the demo heroes |
| `src/Controller/` | The JSON API under `/api` and the page shell |
| `src/Command/` | `app:tick` (cron), `app:demo:seed`, `app:balance`, `app:browser-data`, `app:migration`, `app:admin`, `app:push:keys`, `app:backup`, `app:load-test`, `app:pacing` |
| `public/assets/` | The client: `app.js`, `app.css` and the pixel sprite renderer `pixel.js` |

## Balance notes

`app:balance` shows where tuning stands. A balanced group (guardian, cleric, ranger, mage, rogue) clears the
whole dungeon at levels 1 to 65, 85% at 80, 95% at 100 and all of it at 120. Enemy health follows the reference
group's damage with talents; enemy hits follow its health and healing without them, so defensive talents make
a tank tougher instead of making enemies hit everyone harder. Groups without a tank or a healer fail, as
intended. Known gaps: a Warden plus Druid group falls behind on damage from level 50, and level 80+ needs
another pass once gear past 50 is designed. Every number lives in `Rules.php`, `Stats.php` and `Simulator.php`.

## Pacing

`php bin/console app:pacing` plays a reference group on the production clock (3-hour runs, the 12-hour offline cap,
a wipe stopping the chain until the next check-in) through the dungeon bands with the real XP rules, and fails
outside the target (`--target=6-8` days to level 50). With check-ins at 8, 12, 18 and 22 o'clock (or just morning
and evening, since the cap covers the gap) the group reaches 20 on day 2.8, 30 on day 4.0 and 50 on day 6.2. Once a
day (`--checkins=19`) it is level 40 on day 9. The reference group keeps its gear up to date and never wipes, so real
groups will be somewhat slower; the alpha will tell by how much. CI runs it on every push.

## Browser build

`browser-build/` runs the whole game inside one page with no server: `data.js`, `engine.js` and `server.js` stand in
for the Symfony API, and the page saves to the browser. `php bin/console app:browser-data` rewrites `data.js` from the
PHP rules; `engine.js` and `server.js` are hand ports and change with the PHP. To assemble it, copy `pixel.js`, `sfx.js`, `art.js`, `arena.js`, `tale-art.js`, `workshop.js`, `app.js`
and `app.css` from `public/assets/` next to `browser-build/index.html` and open that page from any static host.

## Art

Everything is drawn in code at runtime, so there are no image files to keep in sync. Hats, hair, race features, tops,
weapons and off-hands beyond the first handful are data in `content/<pack>/art/` (see `content/README.md`), made in the
in-game art workshop (`#/workshop`). `pixel.js` draws heroes,
`art.js` draws item icons, UI and skill icons, monsters and the dungeon scenery, and `arena.js` plays back a
battle on a canvas with hit numbers, projectiles, mechanics and the boss HUD. `art.js` also draws the interface skin (pixel frames, buttons, textures) that `app.css` uses through `--ui-*` variables, and `sfx.js` synthesises every sound with Web Audio, with a mute toggle.
