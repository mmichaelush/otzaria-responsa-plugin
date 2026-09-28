// נקודת הכניסה: מחבר את הבקר לאירועי אוצריא. כל השאר בקבצים האחרים.
(function () {
  'use strict';

  const { App, View } = window.ResponsaApp;
  const { icon } = window.ResponsaIcons;
  const { applyTheme } = window.ResponsaTheme;

  const bridge = window.Otzaria;
  const view = new View(document);
  document.querySelector('.info-toggle').appendChild(icon('settings_24_regular'));

  if (!bridge) {
    // מחוץ לאוצריא (למשל פתיחה ישירה של הקובץ בדפדפן) אין מה להציג.
    document.querySelector('.content-column').textContent =
      'התוסף פועל רק מתוך אוצריא.';
    return;
  }

  const app = new App(bridge, view);
  view.bind(app.actions);

  // הערכה והפלטפורמה מגיעות ב-plugin.boot (אין לקרוא ל-app.getTheme בטעינה).
  // boot חוזר רק מרענן את המצב, ולכן בטוח.
  bridge.on('plugin.boot', (payload) => app.boot(payload));
  bridge.on('theme.changed', (theme) => applyTheme(theme));
  bridge.on('plugin.suspended', () => app.suspend());
  bridge.on('plugin.resumed', () => app.resume());
})();
