#!/usr/bin/env node
// Copies the game client (public/) into a native app's web folder: mobile/www for the iOS and Android apps,
// desktop/app for the Steam build. The apps ship these files inside them and call the server at --api.
//
//   node scripts/native-web.mjs <out dir> --api https://play.example.com [--hub https://hub.example.com]
//
// --hub is the live-updates hub (MERCURE_PUBLIC_URL) when it is on another host than the API.
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, env) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : process.env[env] || '').replace(/\/$/, '');
const out = args.find((a, i) => !a.startsWith('--') && !['--api', '--hub'].includes(args[i - 1]));
const api = opt('api', 'IT_API'), hub = opt('hub', 'IT_HUB') ? new URL(opt('hub', 'IT_HUB')).origin : '';
if (!out || !/^https:\/\/[^/]+$/.test(api)) {
  console.error('usage: node scripts/native-web.mjs <out dir> --api https://your.server (or IT_API=...)');
  process.exit(1);
}
const dir = resolve(out);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'assets'), { recursive: true });

// the client: scripts, styles, fonts and icons; never the service worker or the web manifest
cpSync(join(root, 'public/assets'), join(dir, 'assets'), { recursive: true });
for (const f of ['icon-96.png', 'icon-192.png', 'icon-512.png']) cpSync(join(root, 'public', f), join(dir, f));

const version = Math.max(...['app.js', 'app.css', 'pixel.js'].map((f) => Math.floor(statSync(join(root, 'public/assets', f)).mtimeMs / 1000)));
let html = readFileSync(join(root, 'templates/app.html.twig'), 'utf8').replaceAll('{{ version }}', String(version));
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
// where the server is, then the platform bridge (IT_NATIVE), both before the game client reads them
html = html.replace('<script src="/assets/pixel.js', `<script src="/config.js"></script>\n    <script src="/native.js"></script>\n    <script src="/assets/pixel.js`);
// the API is another origin: let the page talk to it and to its live-updates hub, nothing else
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${api}${hub ? ' ' + hub : ''}`;
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);
if (/{{|{%/.test(html)) throw new Error('templates/app.html.twig has Twig the native build does not fill in');
writeFileSync(join(dir, 'index.html'), html);
writeFileSync(join(dir, 'config.js'), `window.IT_APP = ${JSON.stringify({ api, version })};\n`);
console.log(`Copied the client to ${dir} for ${api} (version ${version}).`);
