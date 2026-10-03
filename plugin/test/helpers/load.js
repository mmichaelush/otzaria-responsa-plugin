// טוען את מודולי התוסף ב-Node בסדר שבו index.html טוען אותם: כל מודול מוצא
// את קודמיו על globalThis, כמו בדפדפן.
'use strict';

const path = require('node:path');

const plugin = (...parts) => path.join(__dirname, '..', '..', ...parts);
const js = (name) => plugin('js', name);

function loadPlugin() {
  globalThis.ResponsaI18n = require(js('responsa-i18n.js'));
  require(plugin('i18n', 'en.js'));
  globalThis.ResponsaDomain = require(js('responsa-domain.js'));
  globalThis.ResponsaAdvanced = require(js('responsa-advanced.js'));
  globalThis.ResponsaLocate = require(js('responsa-locate.js'));
  globalThis.ResponsaTheme = require(js('responsa-theme.js'));
  globalThis.ResponsaLog = require(js('responsa-log.js'));
  // היומן המשותף לא כותב ל-console בבדיקות; הבדיקות קוראות אותו ישירות.
  globalThis.ResponsaLog.shared.console = null;
  globalThis.ResponsaRuntime = require(js('responsa-runtime.js'));
  globalThis.ResponsaSettings = require(js('responsa-settings.js'));
  globalThis.ResponsaService = require(js('responsa-service.js'));
  globalThis.ResponsaEngine = require(js('responsa-engine.js'));
  globalThis.ResponsaIcons = { icon: () => null, names: [] };
  globalThis.ResponsaUi = { el: () => null, button: () => null, iconButton: () => null };
  globalThis.ResponsaPanels = require(js('responsa-panels.js'));
  globalThis.ResponsaApp = require(js('responsa-app.js'));
  return {
    I18n: globalThis.ResponsaI18n,
    Domain: globalThis.ResponsaDomain,
    Advanced: globalThis.ResponsaAdvanced,
    Locate: globalThis.ResponsaLocate,
    Log: globalThis.ResponsaLog,
    Runtime: globalThis.ResponsaRuntime,
    Settings: globalThis.ResponsaSettings,
    Service: globalThis.ResponsaService,
    Engine: globalThis.ResponsaEngine,
    Panels: globalThis.ResponsaPanels,
    App: globalThis.ResponsaApp,
  };
}

module.exports = { loadPlugin };
