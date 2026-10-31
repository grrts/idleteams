// Idle Teams on Steam: the game client (copied into app/ by `npm run build`) in an Electron window, with Steamworks
// for logging in, the overlay and in-game purchases. The page talks to the game server like the phone apps do, with a
// token; Steam-only work happens here and reaches the page through preload.js as window.IT_NATIVE.
const { app, BrowserWindow, ipcMain, net, protocol, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const steamworks = require('steamworks.js');

const APP_ID = Number(process.env.STEAM_APP_ID || JSON.parse(fs.readFileSync(path.join(__dirname, 'steam.json'), 'utf8')).appId);
const WEB = path.join(__dirname, 'app');
// The server checks Steam session tickets made for this identity (src/Service/Steam.php).
const TICKET_IDENTITY = 'idleteams';
// Steam's language names, to the codes the server and Steam's purchase overlay use.
const LANGUAGES = { english: 'en', german: 'de', french: 'fr', spanish: 'es', latam: 'es', italian: 'it', dutch: 'nl', portuguese: 'pt', brazilian: 'pt', polish: 'pl', russian: 'ru', swedish: 'sv', danish: 'da', norwegian: 'no', finnish: 'fi', japanese: 'ja', koreana: 'ko', schinese: 'zh', tchinese: 'zh', turkish: 'tr' };

// Started outside Steam: let Steam start it, so the overlay, the login and purchases work.
if (app.isPackaged && steamworks.restartAppIfNecessary(APP_ID)) app.exit(0);
let steam = null;
try { steam = steamworks.init(APP_ID); } catch (e) { console.error('Steam is not running:', e.message); }
steamworks.electronEnableSteamOverlay();

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

// The login token, encrypted with the operating system's key store.
const tokenFile = () => path.join(app.getPath('userData'), 'token.bin');
ipcMain.handle('token:get', () => {
  try { return safeStorage.decryptString(fs.readFileSync(tokenFile())); } catch (e) { return null; }
});
ipcMain.handle('token:set', (e, t) => {
  if (t) fs.writeFileSync(tokenFile(), safeStorage.encryptString(String(t)));
  else fs.rmSync(tokenFile(), { force: true });
});

ipcMain.handle('steam:ticket', async () => {
  if (!steam) throw new Error('Steam is not running. Start Idle Teams from Steam.');
  const ticket = await steam.auth.getAuthTicketForWebApi(TICKET_IDENTITY);
  return Buffer.from(ticket.getBytes()).toString('hex');
});
ipcMain.handle('steam:language', () => (steam ? LANGUAGES[steam.apps.currentGameLanguage()] || 'en' : 'en'));

// Steam answers a purchase in its overlay with MicroTxnAuthorizationResponse; the page waits for its order here.
const waiting = new Map();
if (steam) {
  const MICROTXN = (steam.callback.SteamCallback || {}).MicroTxnAuthorizationResponse ?? 9;
  steam.callback.register(MICROTXN, (r) => {
    const w = waiting.get(String(r.order_id));
    if (w) { waiting.delete(String(r.order_id)); w(!!r.authorized); }
  });
}
ipcMain.handle('steam:authorized', (e, orderId) => new Promise((resolve) => {
  waiting.set(String(orderId), resolve);
  // the player walked away from the overlay: treat it as a no
  setTimeout(() => { if (waiting.delete(String(orderId))) resolve(false); }, 15 * 60 * 1000);
}));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600, backgroundColor: '#1a130b', title: 'Idle Teams', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // links to the terms, privacy policy and the like open in the player's browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://idleteams/')) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  win.loadURL('app://idleteams/index.html');
}

app.whenReady().then(() => {
  // app://idleteams/<path> serves the copied client from app/, and nothing outside it
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(WEB, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
});
app.on('window-all-closed', () => app.quit());
