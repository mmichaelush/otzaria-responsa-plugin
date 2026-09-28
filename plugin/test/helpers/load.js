// טוען את מודולי התוסף ב-Node בסדר שבו index.html טוען אותם: כל מודול מוצא
// את קודמיו על globalThis, כמו בדפדפן.
'use strict';

const path = require('node:path');

const js = (name) => path.join(__dirname, '..', '..', 'js', name);

function loadPlugin() {
  globalThis.ResponsaDomain = require(js('responsa-domain.js'));
  globalThis.ResponsaTheme = require(js('responsa-theme.js'));
  globalThis.ResponsaService = require(js('responsa-service.js'));
  globalThis.ResponsaIcons = { icon: () => null, names: [] };
  globalThis.ResponsaUi = {};
  globalThis.ResponsaApp = require(js('responsa-app.js'));
  return {
    Domain: globalThis.ResponsaDomain,
    Service: globalThis.ResponsaService,
    App: globalThis.ResponsaApp,
  };
}

module.exports = { loadPlugin };
