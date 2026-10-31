// window.IT_NATIVE for the Steam build: what public/assets/app.js asks of the platform. See main.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('IT_NATIVE', {
  platform: 'steam',
  // the server's address comes from app/config.js (window.IT_APP), which scripts/native-web.mjs writes
  getToken: () => ipcRenderer.invoke('token:get'),
  setToken: (t) => ipcRenderer.invoke('token:set', t),
  steamTicket: () => ipcRenderer.invoke('steam:ticket'),

  // Buys what /api/shop/consent returned: the server opens the order with Steam, the player answers in the overlay,
  // and the server settles it. True when it went through; false when the player said no.
  async buy(consent, api) {
    const language = await ipcRenderer.invoke('steam:language');
    const answer = ipcRenderer.invoke('steam:authorized', String(consent.purchase));
    const { orderId } = await api('POST', '/shop/steam/start', { purchase: consent.purchase, language });
    if (!(await answer)) return false;
    await api('POST', '/shop/steam/finish', { orderId });
    return true;
  },
});
