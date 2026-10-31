// The bridge between the game client (public/assets/app.js) and the phone: window.IT_NATIVE.
// Bundled into www/native.js by `npm run build` (esbuild); the client is plain JavaScript and only calls this.
//
//  - the login token, kept on the device (Preferences)
//  - purchases through RevenueCat, which talks to the App Store and Google Play
//  - push notifications through Firebase Cloud Messaging (APNs on iOS, behind Firebase)
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Purchases, PRODUCT_CATEGORY } from '@revenuecat/purchases-capacitor';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

const platform = Capacitor.getPlatform(); // 'ios' or 'android'
let token = null, tokenRead = false, rcUser = null;
const products = new Map();

async function setupRevenueCat(rc) {
  if (!rc || rcUser === rc.appUserId) return;
  const apiKey = platform === 'ios' ? rc.ios : rc.android;
  if (!apiKey) throw new Error('The shop is not open on this platform yet.');
  if (rcUser === null) await Purchases.configure({ apiKey, appUserID: rc.appUserId });
  else await Purchases.logIn({ appUserID: rc.appUserId });
  rcUser = rc.appUserId;
}

window.IT_NATIVE = {
  platform,
  api: window.IT_APP.api,

  async getToken() {
    if (!tokenRead) { token = (await Preferences.get({ key: 'token' })).value; tokenRead = true; }
    return token;
  },
  async setToken(t) {
    token = t; tokenRead = true;
    if (t) await Preferences.set({ key: 'token', value: t });
    else { await Preferences.remove({ key: 'token' }); if (rcUser) { await Purchases.logOut().catch(() => null); rcUser = null; } }
  },

  // The shop opened: start RevenueCat as this account and return the store's prices by product id.
  async shop(rc, ids) {
    await setupRevenueCat(rc);
    const out = {};
    for (const type of [PRODUCT_CATEGORY.NON_SUBSCRIPTION, PRODUCT_CATEGORY.SUBSCRIPTION]) {
      const { products: list } = await Purchases.getProducts({ productIdentifiers: ids, type });
      for (const p of list) { products.set(p.identifier, p); out[p.identifier] = p.priceString; }
    }
    return out;
  },

  // Buys what /api/shop/consent returned. True when the store took the money; false when the player cancelled.
  async buy(consent) {
    const product = products.get(consent.product);
    if (!product) throw new Error('The store does not offer this yet. Try again later.');
    try {
      await Purchases.purchaseStoreProduct({ product });
      return true;
    } catch (e) {
      if (e && (e.code === '1' || e.userCancelled)) return false; // PURCHASE_CANCELLED_ERROR
      throw new Error((e && e.message) || 'The purchase did not go through.');
    }
  },
  async restore() {
    await Purchases.restorePurchases();
  },

  push: {
    async enabled() {
      return (await FirebaseMessaging.checkPermissions()).receive === 'granted' && (await Preferences.get({ key: 'push' })).value === '1';
    },
    async token() {
      return (await FirebaseMessaging.getToken()).token;
    },
    async on() {
      const { receive } = await FirebaseMessaging.requestPermissions();
      if (receive !== 'granted') return null;
      await Preferences.set({ key: 'push', value: '1' });
      return (await FirebaseMessaging.getToken()).token;
    },
    async off() {
      const t = (await FirebaseMessaging.getToken().catch(() => ({ token: null }))).token;
      await FirebaseMessaging.deleteToken().catch(() => null);
      await Preferences.set({ key: 'push', value: '0' });
      return t;
    },
  },
};

// A tapped notification opens the page it is about (the server sends data.url, e.g. "#/group").
FirebaseMessaging.addListener('notificationActionPerformed', (e) => {
  const url = e.notification && e.notification.data && e.notification.data.url;
  if (url && url.startsWith('#/')) location.hash = url.slice(1);
});

// Light status bar text on the game's dark top bar.
StatusBar.setStyle({ style: Style.Dark }).catch(() => null);
if (platform === 'android') StatusBar.setBackgroundColor({ color: '#1a130b' }).catch(() => null);

// Android's back button: close what is open (a dialog, the chat, a window) before leaving the game.
App.addListener('backButton', () => {
  if (!(window.IT_BACK && window.IT_BACK())) App.minimizeApp();
});
