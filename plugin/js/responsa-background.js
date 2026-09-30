// מנוע הרקע: מופעל רק כשההרשאה "הפעלה ברקע לפי אירוע" דלוקה, ואז לחיצה
// ימנית או בחירת ספר במסך הספרייה מטופלות כאן, בלי לעבור ללשונית התוסף.
// בלי מסך: רק המנוע וההודעות. אוצריא מכבה אותו אחרי כשלוש דקות בלי פעילות.
(function () {
  'use strict';

  const bridge = window.Otzaria;
  if (!bridge) return;

  const I18n = window.ResponsaI18n;
  const runtime = window.ResponsaRuntime.createRuntime(bridge);
  const service = new window.ResponsaService.ServiceClient(bridge);
  const settings = new window.ResponsaSettings.SettingsStore(runtime);
  const engine = new window.ResponsaEngine.Engine(runtime, service);

  let hostLanguage = null;

  /**
   * השפה נבחרת בלשונית התוסף ונשמרת באחסון המשותף, והמנוע הזה אינו מקבל
   * על כך אירוע. לכן היא נקראת מחדש לפני כל פעולה: קריאה מקומית וזולה.
   */
  async function applyLanguage() {
    const values = await settings.load();
    if (I18n.configure(I18n.resolveLanguage(values.language, hostLanguage))) {
      await engine.patchContextMenuTitle();
    }
  }

  /**
   * כל אירוע רץ בשפה העדכנית, ואחרי שההבהרה על הרישיון הוצגה פעם אחת. כשל
   * בקריאת ההגדרות אינו עוצר את הפעולה שהמשתמש ביקש.
   */
  const handle = (action) => async (payload) => {
    await applyLanguage().catch(() => {});
    await engine.ensureLicenseNotice(settings.values.welcomeSeen).catch(() => {});
    return action(payload);
  };

  runtime.on('plugin.boot', async (payload) => {
    const info = payload || {};
    hostLanguage = (info.app && info.app.language) || null;
    engine.pluginVersion = (info.plugin && info.plugin.version) || null;
    engine.setPermissions(info.permissions);
    await applyLanguage();
  });
  runtime.on('plugin.permissions_changed', async (detail) => {
    engine.setPermissions(detail && detail.permissions);
    // השפה אולי נבחרה בלשונית מאז; פריט התפריט אולי נרשם זה עתה, בעברית.
    await applyLanguage().catch(() => {});
    if (I18n.language !== I18n.SOURCE_LANGUAGE) await engine.patchContextMenuTitle();
  });
  runtime.on('settings.changed', (detail) => {
    if (!detail || detail.key !== I18n.LANGUAGE_SETTING_KEY) return undefined;
    hostLanguage = typeof detail.newValue === 'string' ? detail.newValue : null;
    return applyLanguage();
  });

  runtime.on('library.providerBook.openRequested', handle((payload) => engine.openFromLibrary(payload)));
  runtime.on('contextMenu.itemClicked', handle((payload) => engine.contextMenuClicked(payload)));
  runtime.on('app.command', handle((payload) => engine.command(payload)));
})();
