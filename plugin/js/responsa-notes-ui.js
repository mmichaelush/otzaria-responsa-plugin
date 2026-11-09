// לשונית "הערות": ההערות האישיות של בר אילן, והעברתן לאוצריא. כמו שאר קובצי
// ה-UI: מודל ופעולות נכנסים, אלמנט יוצא. המצב (`model.notes`) והלוגיקה ב-
// responsa-notes-flow.js, וההחלטות ב-responsa-notes.js.
(function (root) {
  'use strict';

  const Domain = root.ResponsaDomain;
  const Notes = root.ResponsaNotes;
  const Flow = root.ResponsaNotesFlow;
  const I18n = root.ResponsaI18n;
  const { icon } = root.ResponsaIcons;
  const { el, button, onEnter } = root.ResponsaUi;
  const t = (text, vars) => I18n.t(text, vars);

  const { Phase } = Flow;

  const count = (value) => Domain.formatCount(value);

  const percentOf = (progress) =>
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : null;

  function progressText(progress, label) {
    if (progress.total > 0) {
      return t('{done} מתוך {total}', { done: count(progress.done), total: count(progress.total) });
    }
    return progress.reading ? t('נקראו {count} הערות', { count: count(progress.reading) }) : label;
  }

  /**
   * מעדכן את שורת ההתקדמות במקום, בלי לבנות מחדש את הלשונית (כולל רשימת
   * ההערות) בכל קפיצה. `false` — אין שורה כזו, וצריך לצייר את הכרטיס.
   */
  function updateProgress(container, progress) {
    const host = container.querySelector('.notes-progress');
    if (!host) return false;
    const bar = host.querySelector('.progress');
    const fill = host.querySelector('.progress-bar');
    const note = host.querySelector('.progress-note');
    const percent = percentOf(progress);
    bar.classList.toggle('is-indeterminate', percent === null);
    if (percent === null) bar.removeAttribute('aria-valuenow');
    else bar.setAttribute('aria-valuenow', String(percent));
    fill.style.width = percent === null ? '' : percent + '%';
    note.textContent = progressText(progress, bar.getAttribute('aria-label'));
    return true;
  }

  /** שורת התקדמות: סרגל ומספרים. [total] 0 = עוד לא ידוע (קריאה). */
  function progressView(progress, label) {
    const percent = percentOf(progress);
    const known = percent !== null;
    return el(
      'div',
      { class: 'notes-progress' },
      el(
        'div',
        {
          class: 'progress' + (known ? '' : ' is-indeterminate'),
          role: 'progressbar',
          'aria-label': label,
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': known ? String(percent) : null,
        },
        el('div', { class: 'progress-bar', style: known ? 'width: ' + percent + '%' : null }),
      ),
      // בלי role=status: הטקסט משתנה כמה פעמים בשנייה, וקורא מסך היה מקריא כל שינוי.
      el('p', { class: 'progress-note' }, progressText(progress, label)),
    );
  }

  /** למה הערות נשארות בבר אילן: שורה לכל סיבה, עם הכמות. */
  function skippedDetails(counts) {
    const reasons = Object.entries(counts.unmatched);
    if (!reasons.length) return null;
    return el(
      'details',
      { class: 'faq-item' },
      el(
        'summary',
        { class: 'faq-question' },
        t('{count} הערות יישארו רק בבר אילן. למה?', { count: count(counts.skipped) }),
      ),
      el(
        'div',
        { class: 'faq-answer' },
        el(
          'ul',
          { class: 'help-steps' },
          reasons.map(([reason, total]) => el('li', {}, Notes.reasonLabel(reason) + ': ' + count(total))),
        ),
        el(
          'p',
          { class: 'notes-hint' },
          t('הערה נשארת בבר אילן כשאי אפשר לדעת בוודאות לאיזה ספר ומקום באוצריא היא שייכת. טוב יותר להשאיר אותה מאשר לכתוב אותה במקום שגוי.'),
        ),
      ),
    );
  }

  function reviewView(importer, actions) {
    const counts = importer.counts;
    return [
      el(
        'p',
        { class: 'notes-summary' },
        t('נבדקו {total} הערות. {matched} אפשר להעביר לאוצריא.', {
          total: count(counts.total),
          matched: count(counts.matched),
        }),
      ),
      counts.section
        ? el(
            'p',
            { class: 'notes-hint' },
            t('{count} מהן יוצמדו לכותרת של הפרק או הדף, כי את השורה המדויקת אוצריא לא זיהתה.', {
              count: count(counts.section),
            }),
          )
        : null,
      counts.imported
        ? el(
            'p',
            { class: 'notes-hint' },
            t('{count} הערות כבר הועברו בעבר, ולא יועברו שוב.', { count: count(counts.imported) }),
          )
        : null,
      skippedDetails(counts),
      el(
        'p',
        { class: 'notes-hint' },
        t('בכל הערה שתועבר השורה הראשונה היא "{marker}". ההערות בבר אילן לא משתנות.', { marker: Notes.MARKER }),
      ),
      el(
        'div',
        { class: 'notes-actions' },
        button('filled', t('העברת {count} הערות', { count: count(counts.matched) }), actions.runNotesImport, {
          icon: 'arrow_download_24_regular',
          key: 'notes-import',
          disabled: counts.matched === 0,
        }),
        button('text', t('ביטול'), actions.dismissNotes, { key: 'notes-dismiss' }),
      ),
    ];
  }

  /** מסך אישור לפני מחיקה: הביטול מוחק את כל מה שהועבר בעבר, לא רק את ההעברה האחרונה. */
  function undoConfirmView(importer, actions) {
    return [
      el(
        'p',
        { class: 'notes-summary', role: 'alert' },
        t('לבטל את ההעברה של {count} הערות מאוצריא? הערות ששונו באוצריא יישארו.', {
          count: count(importer.importedBefore),
        }),
      ),
      el(
        'div',
        { class: 'notes-actions' },
        button('filled', t('כן, לבטל את ההעברה'), actions.undoNotesImport, { key: 'notes-undo-confirm' }),
        button('text', t('חזרה'), actions.declineNotesUndo, { key: 'notes-undo-decline' }),
      ),
    ];
  }

  function doneView(importer, actions) {
    const { result } = importer;
    if (importer.confirmingUndo) return undoConfirmView(importer, actions);
    return [
      el(
        'p',
        { class: 'notes-summary', role: 'status' },
        result.failed
          ? t('הועברו {added} הערות. {failed} לא הועברו, אפשר לנסות שוב.', {
              added: count(result.added),
              failed: count(result.failed),
            })
          : t('הועברו {added} הערות לאוצריא.', { added: count(result.added) }),
      ),
      el(
        'p',
        { class: 'notes-hint' },
        t('ההערות מופיעות בספרים באוצריא, וכל אחת מתחילה ב"{marker}".', { marker: Notes.MARKER }),
      ),
      el(
        'div',
        { class: 'notes-actions' },
        button('tonal', t('סגירה'), actions.dismissNotes, { key: 'notes-dismiss' }),
        button('text', t('ביטול ההעברה'), actions.askNotesUndo, { key: 'notes-undo' }),
      ),
    ];
  }

  function idleView(model, importer, actions) {
    const allowed = Domain.canImportNotes(model.permissions);
    const { result } = importer;
    if (importer.confirmingUndo) return undoConfirmView(importer, actions);
    return [
      el(
        'p',
        { class: 'notes-text' },
        t('אפשר להעביר את ההערות לאוצריא. כל הערה נכתבת בספר ובמקום שמתאימים לה, ובבר אילן היא נשארת כמו שהייתה.'),
      ),
      allowed
        ? null
        : el(
            'p',
            { class: 'notes-hint is-warning' },
            t('כדי להעביר הערות צריך לאשר לתוסף, בהגדרות אוצריא ← כלים ← "בר אילן", את ההרשאות "צפייה בהערות", "עריכת הערות" ו"רשימת ספרים".'),
          ),
      result && result.removed !== undefined
        ? el(
            'p',
            { class: 'notes-summary', role: 'status' },
            result.kept
              ? t('ההעברה בוטלה: נמחקו {removed} הערות. {kept} נשארו כי שונו באוצריא או שהספר לא נמצא.', {
                  removed: count(result.removed),
                  kept: count(result.kept),
                })
              : t('ההעברה בוטלה: נמחקו {removed} הערות.', { removed: count(result.removed) }),
          )
        : null,
      result && result.failed
        ? el(
            'p',
            { class: 'notes-hint is-warning' },
            t('{count} הערות לא נבדקו או לא נמחקו, ונשארו ברשימת ההעברות. אפשר לנסות שוב.', {
              count: count(result.failed),
            }),
          )
        : null,
      el(
        'div',
        { class: 'notes-actions' },
        button('filled', t('בדיקת ההתאמה'), actions.checkNotes, {
          icon: 'document_search_24_regular',
          key: 'notes-check',
          disabled: !allowed,
        }),
        importer.importedBefore
          ? button('text', t('ביטול ההעברה הקודמת'), actions.askNotesUndo, { key: 'notes-undo' })
          : null,
      ),
      importer.importedBefore
        ? el(
            'p',
            { class: 'notes-hint' },
            t('{count} הערות הועברו בעבר.', { count: count(importer.importedBefore) }),
          )
        : null,
    ];
  }

  /** כרטיס ההעברה לאוצריא, לפי השלב. */
  function importCard(model, actions) {
    const importer = model.notes.importer;
    let body;
    switch (importer.phase) {
      case Phase.checking:
        body = [
          progressView(importer.progress, t('בודק איפה כל הערה שייכת באוצריא…')),
          button('text', importer.cancelling ? t('עוצר…') : t('עצירה'), actions.cancelNotes, {
            key: 'notes-cancel',
            disabled: importer.cancelling,
          }),
        ];
        break;
      case Phase.review:
        body = reviewView(importer, actions);
        break;
      case Phase.importing:
        body = [
          progressView(importer.progress, t('מעביר הערות…')),
          button('text', importer.cancelling ? t('עוצר…') : t('עצירה'), actions.cancelNotes, {
            key: 'notes-cancel',
            disabled: importer.cancelling,
          }),
        ];
        break;
      case Phase.undoing:
        body = [
          progressView(importer.progress, t('מבטל את ההעברה…')),
          button('text', importer.cancelling ? t('עוצר…') : t('עצירה'), actions.cancelNotes, {
            key: 'notes-cancel',
            disabled: importer.cancelling,
          }),
        ];
        break;
      case Phase.done:
        body = doneView(importer, actions);
        break;
      default:
        body = idleView(model, importer, actions);
    }
    return el(
      'section',
      { class: 'notes-import', 'aria-labelledby': 'notes-import-title' },
      el('h3', { class: 'notes-import-title', id: 'notes-import-title' }, t('העברה לאוצריא')),
      importer.error ? el('p', { class: 'advanced-status is-error', role: 'alert' }, importer.error) : null,
      body,
    );
  }

  function searchRow(list, actions) {
    const input = el('input', {
      class: 'search-input',
      type: 'search',
      dir: 'rtl',
      placeholder: t('חיפוש בהערות'),
      'aria-label': t('חיפוש בהערות'),
      autocomplete: 'off',
      spellcheck: 'false',
      maxlength: '200',
      dataset: { focusKey: 'notes-search' },
    });
    input.value = list.query;
    input.addEventListener('input', () => actions.searchNotes(input.value));
    onEnter(input, (value) => actions.searchNotes(value), 'search');
    return el('label', { class: 'search-bar' }, icon('search_24_regular'), input);
  }

  function noteItem(note, index, model, actions) {
    const place = Notes.placeOf(note);
    const heading = place || note.title || t('הערה בלי מראה מקום');
    return el(
      'li',
      { class: 'result' },
      el(
        'div',
        { class: 'result-row' },
        el(
          'div',
          { class: 'result-body' },
          el('h3', { class: 'result-title' }, el('bdi', {}, heading)),
          place && note.title ? el('div', { class: 'result-meta' }, el('bdi', {}, note.title)) : null,
          note.quote ? el('div', { class: 'note-quote', dir: 'auto' }, '«' + note.quote + '»') : null,
          note.text ? el('p', { class: 'note-text', dir: 'auto' }, note.text) : null,
          note.date ? el('div', { class: 'result-context', dir: 'auto' }, Notes.displayDate(note.date)) : null,
        ),
        place && Domain.serviceCan(model.health, 'locate')
          ? el(
              'div',
              { class: 'result-actions' },
              button('tonal', t('איתור בבר אילן'), () => actions.locateNote(note), {
                icon: 'open_24_regular',
                // `id` של בר אילן מתחיל מ-1 לכל מחבר, ולכן אינו מפתח.
                key: 'note-locate-' + index,
              }),
            )
          : null,
      ),
    );
  }

  function listView(model, actions) {
    const { list } = model.notes;
    if (list.loading && !list.items.length) {
      return el('div', { class: 'empty' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), el('p', {}, t('קורא את ההערות…')));
    }
    if (!list.items.length) {
      return el(
        'div',
        { class: 'empty' },
        icon('search_info_24_regular'),
        el('p', {}, list.query ? t('לא נמצאו הערות שמתאימות לחיפוש.') : t('אין הערות להצגה.')),
        list.query ? null : button('tonal', t('רענון'), actions.refreshNotes, { key: 'notes-refresh' }),
      );
    }
    return el(
      'div',
      {},
      el(
        'div',
        { class: 'results-header' },
        el(
          'span',
          {},
          list.query
            ? t('נמצאו {found} מתוך {all} הערות', { found: count(list.total), all: count(list.all) })
            : t('{count} הערות', { count: count(list.all) }),
        ),
        list.modified
          ? el('span', { class: 'notes-hint' }, t('הקובץ עודכן: {date}', { date: Domain.formatBuiltAt(list.modified) }))
          : null,
        // הערה שנכתבה בבר אילן אחרי שהלשונית נפתחה אינה ברשימה עד שמרעננים.
        button('text', t('רענון'), actions.refreshNotes, {
          icon: 'arrow_sync_24_regular',
          key: 'notes-refresh',
          busy: list.loading,
          busyLabel: t('טוען…'),
        }),
      ),
      el(
        'ul',
        { class: 'results', 'aria-label': t('ההערות שלי') },
        list.items.map((note, index) => noteItem(note, index, model, actions)),
      ),
      list.items.length < list.total
        ? el(
            'div',
            { class: 'load-more' },
            button('text', t('עוד הערות'), actions.moreNotes, {
              key: 'notes-more',
              busy: list.loadingMore,
              busyLabel: t('טוען…'),
            }),
          )
        : null,
    );
  }

  function content(model, actions) {
    const { list } = model.notes;
    if (!Domain.serviceCan(model.health, 'notes')) {
      return el(
        'div',
        { class: 'notice' },
        icon('warning_24_regular'),
        el(
          'p',
          { class: 'notice-text' },
          t('שירות בר אילן שבמחשב ישן ואינו מכיר את ההערות. כדאי להוריד את הגרסה החדשה.'),
        ),
        button('tonal', t('הורדת הגרסה החדשה'), actions.download, { key: 'notes-download' }),
      );
    }
    if (list.error) {
      return el(
        'div',
        { class: 'empty' },
        icon('warning_24_regular'),
        el('p', {}, list.error.message || t('קריאת ההערות נכשלה.')),
        button('tonal', t('ניסיון חוזר'), actions.refreshNotes, { key: 'notes-retry' }),
      );
    }
    if (list.available === false) {
      return el(
        'div',
        { class: 'empty' },
        icon('search_info_24_regular'),
        el('p', {}, t('לא נמצאו הערות אישיות בבר אילן.')),
        el(
          'p',
          { class: 'empty-note' },
          t('אם כתבת הערות, ייתכן שהן נשמרו בהתקנה אחרת של בר אילן או בחשבון משתמש אחר במחשב.'),
        ),
        button('tonal', t('בדיקה מחדש'), actions.refreshNotes, {
          key: 'notes-refresh',
          busy: list.loading,
          busyLabel: t('בודק…'),
        }),
      );
    }
    if (list.available === null) return listView(model, actions);
    return [importCard(model, actions), searchRow(list, actions), listView(model, actions)];
  }

  function notesPage(model, actions) {
    return el(
      'div',
      { class: 'notes-page' },
      el(
        'header',
        { class: 'page-header' },
        el('h2', { class: 'page-title', id: 'notes-title' }, t('הערות')),
        el('p', { class: 'page-lead' }, t('ההערות האישיות שכתבת בבר אילן. אפשר לעיין בהן כאן ולהעביר אותן לאוצריא.')),
      ),
      content(model, actions),
    );
  }

  const api = { notesPage, updateProgress };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaNotesUi = api;
})(typeof self !== 'undefined' ? self : globalThis);
