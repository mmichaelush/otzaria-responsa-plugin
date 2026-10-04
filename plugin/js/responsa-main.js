// נקודת הכניסה של הלשונית: מחבר את הבקר לאירועי אוצריא. כל השאר בקבצים
// האחרים. לתוסף אין מנוע רקע.
(function () {
  'use strict';

  const { App } = window.ResponsaApp;
  const { View } = window.ResponsaView;

  const bridge = window.Otzaria;
  const view = new View(document);
  view.applyLanguage();

  if (!bridge) {
    // מחוץ לאוצריא (למשל פתיחה ישירה של הקובץ בדפדפן) אין מה להציג.
    const t = window.ResponsaI18n.t;
    document.querySelector('.content-column').textContent = t('התוסף פועל רק מתוך אוצריא.');
    return;
  }

  const app = new App(bridge, view);
  view.bind(app.actions);
  const on = app.runtime.on;

  // הערכה והפלטפורמה מגיעות ב-plugin.boot (אין לקרוא ל-app.getTheme בטעינה).
  // boot חוזר רק מרענן את המצב, ולכן בטוח.
  on('plugin.boot', (payload) => app.boot(payload));
  on('theme.changed', (theme) => window.ResponsaTheme.applyTheme(theme));
  on('plugin.permissions_changed', (detail) => app.permissionsChanged(detail && detail.permissions));
  on('settings.changed', (detail) => app.hostSettingChanged(detail));
  on('plugin.suspended', () => app.suspend());
  on('plugin.resumed', () => app.resume());
  on('plugin.page_opened', (detail) => app.pageOpened(detail));

  // קיצורי המקלדת, "איתור המקום בבר אילן" בלחיצה ימנית, ו"חיפוש בבר אילן"
  // בדיאלוג החיפוש: אוצריא פותחת את הלשונית ומוסרת אליה את הבקשה. "חיפוש
  // בבר אילן" בלחיצה ימנית ופתיחה מהספרייה אינם מגיעים לכאן: אוצריא פונה
  // בהם לשירות בעצמה (`localService.post` במניפסט).
  on('app.command', (payload) => app.command(payload));
  on('contextMenu.itemClicked', (payload) => app.contextMenuClicked(payload));
  on('search.requested', (payload) => app.searchRequested(payload));
})();
