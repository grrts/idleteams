# Idle Teams for iOS and Android

The game client from `public/` in a [Capacitor](https://capacitorjs.com) app. It talks to the game server with a login
token, buys through [RevenueCat](https://www.revenuecat.com) (App Store and Google Play), and gets push notifications
through Firebase Cloud Messaging. `src/native.js` is the whole bridge between the client and the phone.

## Build

```sh
cd mobile
npm ci
IT_API=https://your.server npm run build   # copies the client into www/ and bundles the bridge
npx cap add ios && npx cap add android     # once: makes the Xcode and Android Studio projects
npx cap sync                               # after every build
npx cap open ios                           # or: npx cap open android
```

`IT_API` is the server's address (`APP_URL`). Add `IT_HUB=https://...` when the live-updates hub
(`MERCURE_PUBLIC_URL`) is on another host.

## What to set up once

- **App ids.** `capacitor.config.json` has `com.idleteams.app`. Change it before the first `cap add` if you want
  another id; it has to match the App Store Connect and Play Console apps.
- **Server.** `CORS_ORIGINS` in the server's environment must list `capacitor://localhost` (iOS) and
  `https://localhost` (Android). The default does.
- **RevenueCat.** One project with an iOS and an Android app. Products, with the same ids in App Store Connect and the
  Play Console:
  - `it_look_ember_crown`, `it_look_star_weaver`, `it_look_fox_hood`, `it_look_ember_brand`, `it_look_moonward_staff`,
    `it_look_spirit_lantern`, `it_look_royal_coat`: non-consumable.
  - `it_track_s1` (and one per season after): non-consumable.
  - `it_supporter_monthly`: auto-renewing monthly subscription, attached to an entitlement named `supporter`.

  The ids come from `content/base/shop/launch.json`. On the server set `RC_PUBLIC_IOS_KEY`,
  `RC_PUBLIC_ANDROID_KEY`, `RC_SECRET_KEY` (a v1 secret key) and `RC_WEBHOOK_AUTH`; in RevenueCat add a webhook to
  `https://your.server/api/shop/revenuecat` with that same value as its Authorization header.
- **Push.** A Firebase project with the iOS and Android apps. Put `GoogleService-Info.plist` in `ios/App/App/` and
  `google-services.json` in `android/app/` (both are git-ignored), upload your APNs key to Firebase, and turn on Push
  Notifications and Background Modes > Remote notifications in Xcode. On the server set `FCM_SERVICE_ACCOUNT` (see the
  main README).
- **Store listings.** Text, screenshots and the privacy answers are in `docs/launch.md`.
