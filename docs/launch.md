# Launch checklist

Everything between the code and players buying in the stores. The code is done; what is left are accounts, keys and
store pages that only the owner can make. `php bin/console app:launch-check` on the server ticks off the server side.

## 1. Accounts to open (each takes from a day to two weeks to be approved)

- [ ] **Apple Developer Program** (99 USD a year). Sign the Paid Apps agreement and fill in tax and bank details in
      App Store Connect, or in-app purchases stay unavailable.
- [ ] **Google Play Console** (25 USD once). A new personal account must run a closed test with 12 testers for 14
      days before it may publish; an organisation account (needs a D-U-N-S number) skips that. Set up a payments
      profile for in-app products.
- [ ] **Steamworks** (100 USD per app). Fill in tax and bank details; Steam reviews the store page and the build
      before release, and the store page must be "coming soon" for at least two weeks.
- [ ] **RevenueCat** (free up to 2,500 USD a month in store revenue). One project, with an iOS app (App Store
      Connect API key and in-app purchase key) and an Android app (Play service account with financial access).
- [ ] **Firebase** (free). One project with the iOS and Android apps; upload the APNs key from the Apple account.

## 2. Server keys (`.env.local`, then `composer dump-env prod`)

| Key | Where it comes from |
| --- | --- |
| `LEGAL_OPERATOR`, `LEGAL_ADDRESS`, `LEGAL_CONTACT` | You; shown in `/terms` and `/privacy` |
| `RC_PUBLIC_IOS_KEY`, `RC_PUBLIC_ANDROID_KEY` | RevenueCat > Project > API keys (public app-specific keys) |
| `RC_SECRET_KEY` | RevenueCat > API keys > a v1 secret key |
| `RC_WEBHOOK_AUTH` | Make up a long random value; put the same in RevenueCat > Integrations > Webhooks, URL `https://<host>/api/shop/revenuecat` |
| `STEAM_WEB_API_KEY` | Steamworks > Users & Permissions > Manage Groups > a group with the app > Web API key |
| `STEAM_APP_ID` | Steamworks; also put it in `desktop/steam.json` |
| `FCM_SERVICE_ACCOUNT` | Firebase > Project settings > Service accounts > Generate new private key (a path to the file, or its text) |

Leave `RC_ALLOW_SANDBOX=0` and `STEAM_SANDBOX=0` in production. Add the `app:steam-refunds` cron line (README, Host
it, step 5).

## 3. Store products

Make these in App Store Connect and the Play Console with exactly these ids, then add them to RevenueCat
(`app:launch-check` prints the current list):

| Product id | Type | Price (EUR) |
| --- | --- | --- |
| `it_look_ember_crown` | Non-consumable | 2.99 |
| `it_look_star_weaver` | Non-consumable | 2.49 |
| `it_look_fox_hood` | Non-consumable | 1.99 |
| `it_look_ember_brand` | Non-consumable | 3.49 |
| `it_look_moonward_staff` | Non-consumable | 3.49 |
| `it_look_spirit_lantern` | Non-consumable | 1.99 |
| `it_look_royal_coat` | Non-consumable | 2.99 |
| `it_supporter_monthly` | Auto-renewable subscription, monthly; RevenueCat entitlement `supporter` | 4.99 |
| `it_track_s1` | Non-consumable (one per season: `it_track_s2`, ...) | 7.99 |

Apple and Google pick the nearest price tier per country. Steam needs no product setup: the server sends the price in
the player's wallet currency from `content/base/shop/launch.json` (EUR, USD and GBP today).

Before each new season, add its `it_track_<season>` product to both stores and RevenueCat.

## 4. Build and submit

- [ ] Phone apps: follow `mobile/README.md`. Change `appId` in `mobile/capacitor.config.json` first if you want an id
      other than `com.idleteams.app`. Add the app icon and splash (`npx @capacitor/assets generate` from a
      1024x1024 icon).
- [ ] Test a purchase of each kind with a sandbox tester (Apple) and a licence tester (Google), with
      `RC_ALLOW_SANDBOX=1` on a test server only. Check restore on a second device and that a refund takes the look
      away.
- [ ] Steam: follow `desktop/README.md`; test purchases with `STEAM_SANDBOX=1`, then upload the `dist/` folders with
      SteamPipe.

## 5. Store pages

**Name:** Idle Teams. **Subtitle (30 characters):** Five heroes, one dungeon run.

**Short description (80):** An idle group RPG: make a hero with a life story and let your group run the dungeon.

**Description:**

> Five heroes. One long dungeon run.
>
> Idle Teams is a group RPG that plays itself while you are away. Make a hero with a life story, join a group of five
> real players, and send them into the dungeon. Your build and your group decide how far you get; the fight goes on
> whether you watch or not.
>
> - Six races, seven classes and a life story in seventeen answers that shapes who your hero is.
> - Tank, healer and damage: every group needs all three, and every hero matters.
> - Come back to loot in the group chest, roll need or greed, and trade on the market.
> - Guilds, a 40-hero guild raid, Heroic and Mythic dungeons, and a new season every eight weeks.
> - Play on your phone, on Steam or in the browser with one account.
>
> Nothing for sale makes a hero stronger. The shop sells looks and a supporter star, and that is all.

**Category:** Role Playing (iOS, Google Play); Steam tags: RPG, Idler, Multiplayer, Co-op, Pixel Graphics, Free to Play.

**Age ratings:** chat between players and in-app purchases. Apple: 12+ (infrequent mild fantasy violence, user
generated content). Google (IARC questionnaire): mild fantasy violence, users interact, in-app purchases. Steam: no
mature content.

**Privacy answers** (match `/privacy`):
- Apple App Privacy: Contact info (email, optional), User content (chat, hero stories), Identifiers (user id),
  Purchases; all linked to the user, none used for tracking.
- Google Data safety: the same; data encrypted in transit; users can ask for deletion (in the game, Settings > Your
  data), deletion URL `https://<host>/privacy`.

**Links:** support and privacy `https://<host>/privacy`, terms `https://<host>/terms`. Apple needs the terms linked in
the description for the subscription ("Terms of Use (EULA): https://<host>/terms").

**Screenshots:** the battle view, the hero page with the life story, the group chest, the guild raid, the shop
(phones: 6.7" and 6.5" iPhone, a 12.9" iPad if the iPad build is kept; Android phone and 7"/10" tablets; Steam: at
least five at 1920x1080).

## 6. Legal

- [ ] A lawyer reads `/terms` and `/privacy` (EU consumer law, the subscription wording, GDPR).
- [ ] Data processing agreements with the host, the mail provider, RevenueCat and Firebase (Google).
- [ ] Register for VAT where you sell; Apple, Google and Steam collect and pay VAT on sales for you in the EU.
