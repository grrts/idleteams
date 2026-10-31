# Idle Teams on Steam

The game client from `public/` in an [Electron](https://www.electronjs.org) window, with
[steamworks.js](https://github.com/ceifa/steamworks.js) for the Steam login, the overlay and in-game purchases
(Steam microtransactions). `main.js` does the Steam work; `preload.js` hands the page `window.IT_NATIVE`.

## Build

```sh
cd desktop
npm ci
IT_API=https://your.server npm start       # runs it (Steam must be running; app 480 is Valve's test app)
IT_API=https://your.server npm run dist    # packages it into dist/ for upload with SteamPipe
```

## What to set up once

- **App id.** Put your Steam app id in `steam.json` (it says 480, Valve's Spacewar test app, until then).
- **Server.** Set `STEAM_WEB_API_KEY` (a publisher Web API key, from Users & Permissions > Manage Groups) and
  `STEAM_APP_ID`. Keep `STEAM_SANDBOX=1` while testing: purchases then go through `ISteamMicroTxnSandbox` and cost
  nothing. `CORS_ORIGINS` must list `app://idleteams` (the default does).
- **Purchases.** Steam's in-game purchases need no item setup in Steamworks: the server sends the price, in the
  player's wallet currency. Prices per currency are in `content/base/shop/launch.json` (`price` in euros, `prices`
  for others); players with a wallet in another currency see "not on sale in your Steam currency yet" until one is
  added.
- **Refunds.** Steam sends no refund calls, so run `php bin/console app:steam-refunds` from cron every hour.
- **Login.** The first time, the player logs in with a game account (or makes one) and it is linked to their Steam
  account; after that the app logs in by itself. Settings > Steam can unlink it.
