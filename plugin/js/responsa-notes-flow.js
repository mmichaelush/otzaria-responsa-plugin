// לשונית "הערות": קריאת ההערות האישיות של בר אילן מהשירות, והעברתן לאוצריא.
// בקר נפרד מ-responsa-app.js: למצב הזה יש מחזור חיים משלו (עמוד ברשימה, בדיקה
// ארוכה, ייבוא, ביטול), והוא אינו צריך לדעת דבר על שאר הלשוניות. ההחלטות
// (מה מיובא, איך ההערה נראית) ב-responsa-notes.js; כאן רק התיאום מול השירות
// ומול אוצריא, והמצב שהמסך מצייר.
(function (root) {
  'use strict';

  const Notes = root.ResponsaNotes;
  const I18n = root.ResponsaI18n;
  const Runtime = root.ResponsaRuntime;
  const t = (text, vars) => I18n.t(text, vars);
  /** מסמן מחרוזת לתרגום בלי לתרגם אותה עכשיו: התרגום בזמן הציור. */
  const N = (text) => text;

  /** מפתח האחסון של יומן הייבוא (`Notes.normalizeLedger`). */
  const LEDGER_KEY = 'responsa_notes_ledger';

  /** הקלדה בחיפוש מחכה רגע, כדי שלא תהיה בקשה לכל אות. */
  const SEARCH_DEBOUNCE_MS = 250;

  /** התקדמות מצוירת לכל היותר כך, גם כשמאות בקשות מסתיימות בשנייה. */
  const PROGRESS_THROTTLE_MS = 150;

  /** כמה כשלים רצופים מול אוצריא מכריעים שהבעיה אינה בהערה אלא בה. */
  const MAX_CONSECUTIVE_FAILURES = 20;

  /** שמירת היומן אחרי כל כך הרבה הערות, כדי שהפסקה באמצע לא תשכח מה נכתב. */
  const LEDGER_SAVE_EVERY = 10;

  const Phase = Object.freeze({
    idle: 'idle',
    checking: 'checking',
    review: 'review',
    importing: 'importing',
    done: 'done',
    undoing: 'undoing',
  });

  function emptyList() {
    return {
      /** `null` — עוד לא נקרא; `false` — אין קובץ הערות בהתקנה. */
      available: null,
      items: [],
      /** התאמות לחיפוש הנוכחי, וכל ההערות שבקובץ. */
      total: 0,
      all: 0,
      empty: 0,
      modified: null,
      query: '',
      loading: false,
      loadingMore: false,
      error: null,
    };
  }

  function emptyImporter() {
    return {
      phase: Phase.idle,
      progress: { done: 0, total: 0 },
      /** `[{ note, resolution, imported }]` אחרי הבדיקה. */
      items: [],
      counts: null,
      result: null,
      error: null,
      cancelling: false,
      /** המשתמש לחץ "ביטול ההעברה" והמסך מבקש אישור לפני המחיקה. */
      confirmingUndo: false,
      /** כמה הערות כבר יובאו בעבר (לפי היומן). */
      importedBefore: 0,
    };
  }

  class NotesFlow {
    /**
     * @param deps `{ runtime, service, log, changed, progress, locate, now, debounceMs }`:
     *   [changed] — המצב השתנה, לצייר; [progress] — רק ההתקדמות השתנתה (ברירת
     *   מחדל: [changed]); [locate] — לפתוח מקום בבר אילן.
     */
    constructor(deps) {
      this.runtime = deps.runtime;
      this.service = deps.service;
      this.log = deps.log;
      this.changed = deps.changed || (() => {});
      this.progressChanged = deps.progress || this.changed;
      this.locateInBarIlan = deps.locate || (() => {});
      this.now = deps.now || (() => Date.now());
      this.debounceMs = deps.debounceMs === undefined ? SEARCH_DEBOUNCE_MS : deps.debounceMs;
      this.state = { list: emptyList(), importer: emptyImporter() };
      this._searchTimer = null;
      this._listSeq = 0;
      this._renderedAt = 0;
    }

    // ------------------------------------------------------------ הרשימה

    /** כניסה ללשונית: הרשימה נקראת פעם אחת, ואחר כך רק לפי בקשה. */
    async open() {
      const { list } = this.state;
      // אחרי כשל (השירות עוד לא היה מוכן) כניסה נוספת מנסה שוב.
      if ((list.available !== null && !list.error) || list.loading) return;
      await this._load({ reset: true });
      await this._refreshLedgerCount();
    }

    /** "רענון": הקובץ אולי השתנה בבר אילן. */
    refresh() {
      return this._load({ reset: true });
    }

    /** הקלדה בשדה החיפוש. */
    search(query) {
      const list = this.state.list;
      list.query = query;
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => this._load({ reset: true }), this.debounceMs);
      if (this._searchTimer.unref) this._searchTimer.unref();
    }

    more() {
      const list = this.state.list;
      if (list.loading || list.loadingMore || list.items.length >= list.total) return;
      return this._load({ reset: false });
    }

    async _load({ reset }) {
      const list = this.state.list;
      const seq = ++this._listSeq;
      list.error = null;
      if (reset) list.loading = true;
      else list.loadingMore = true;
      this.changed();
      try {
        const page = await this.service.notes(
          list.query.trim(),
          reset ? 0 : list.items.length,
          Notes.PAGE_SIZE,
        );
        // תשובה מאוחרת לחיפוש שכבר הוחלף אינה של המשתמש.
        if (seq !== this._listSeq) return;
        list.available = page.available !== false;
        list.items = reset ? page.notes : list.items.concat(page.notes);
        list.total = page.total;
        list.all = page.all;
        list.empty = page.empty || 0;
        list.modified = page.modified || null;
      } catch (error) {
        if (seq !== this._listSeq) return;
        this.log.warn('קריאת ההערות נכשלה', error);
        list.error = error;
        if (list.available === null) list.available = true;
      } finally {
        if (seq === this._listSeq) {
          list.loading = false;
          list.loadingMore = false;
          this.changed();
        }
      }
    }

    /** "איתור בבר אילן": פותח את מראה המקום של ההערה. */
    locate(note) {
      const place = Notes.placeOf(note);
      if (place) this.locateInBarIlan(place);
    }

    // ------------------------------------------------------------ יומן

    /**
     * היומן מהאחסון. קריאה שנכשלה זורקת, ואינה "יומן ריק": יומן ריק שנכתב
     * חזרה היה מוחק את הרישום של כל מה שיובא בעבר.
     */
    async _readLedger() {
      return Notes.normalizeLedger(await this.runtime.call('storage.get', { key: LEDGER_KEY }));
    }

    async _writeLedger(rows) {
      await this.runtime.call('storage.set', { key: LEDGER_KEY, value: rows });
    }

    async _refreshLedgerCount() {
      try {
        this.state.importer.importedBefore = (await this._readLedger()).length;
      } catch (error) {
        this.log.warn('קריאת יומן הייבוא נכשלה', error);
      }
      this.changed();
    }

    // ------------------------------------------------------------ בדיקה

    /**
     * "בדיקת ההתאמה": קוראת את כל ההערות, ולכל אחת שואלת את אוצריא איפה
     * המקום שלה. לא כותבת דבר. אפשר לבטל.
     */
    async check() {
      const importer = this.state.importer;
      if (this._busy()) return;
      Object.assign(importer, emptyImporter(), { phase: Phase.checking });
      this.changed();
      try {
        const [notes, ledger] = await Promise.all([this._fetchAll(), this._readLedger()]);
        const done = Notes.importedSignatures(ledger);
        const items = notes.map((note) => ({
          note,
          imported: done.has(Notes.signature(note)),
          resolution: null,
        }));
        importer.importedBefore = ledger.length;
        importer.progress = { done: 0, total: items.filter((item) => !item.imported).length };
        await this._resolveAll(items);
        if (importer.cancelling) {
          this._back();
        } else {
          importer.items = items;
          importer.counts = Notes.summarize(items);
          importer.phase = Phase.review;
          this.log.info(
            'ייבוא הערות: נבדקו ' + items.length + ', ' + importer.counts.matched + ' מוכנות לייבוא',
          );
        }
      } catch (error) {
        this._fail(error, N('בדיקת ההערות נכשלה'));
      } finally {
        this.changed();
      }
    }

    async _fetchAll() {
      const notes = [];
      let total = Infinity;
      while (notes.length < total) {
        const page = await this.service.notes('', notes.length, Notes.FETCH_SIZE);
        total = page.total;
        if (!page.notes.length) break;
        notes.push(...page.notes);
        this.state.importer.progress = { done: 0, total: 0, reading: notes.length };
        this._progress();
        if (this.state.importer.cancelling) break;
      }
      return notes;
    }

    /** ממלא `resolution` לכל הערה שטרם יובאה, בכמה בקשות במקביל. */
    async _resolveAll(items) {
      const importer = this.state.importer;
      const pending = items.filter((item) => !item.imported);
      let next = 0;
      let failures = 0;
      let stopped = false;
      const worker = async () => {
        while (!stopped && !importer.cancelling && next < pending.length) {
          const item = pending[next++];
          const place = Notes.placeOf(item.note);
          if (!place) {
            item.resolution = Notes.resolution(item.note, null);
          } else {
            try {
              const hits = await this.runtime.call('library.resolveRef', { ref: place, limit: 5 });
              item.resolution = Notes.resolution(item.note, hits);
              failures = 0;
            } catch (error) {
              if (error && error.isUnsupported) {
                stopped = true;
                throw error;
              }
              failures += 1;
              if (failures >= MAX_CONSECUTIVE_FAILURES) {
                stopped = true;
                throw error;
              }
              item.resolution = { status: 'unmatched', reason: Notes.Reason.failed };
            }
          }
          importer.progress = { done: importer.progress.done + 1, total: importer.progress.total };
          this._progress();
        }
      };
      await Promise.all(Array.from({ length: Notes.CHECK_CONCURRENCY }, worker));
    }

    // ------------------------------------------------------------ ייבוא

    /**
     * כותב לאוצריא את ההערות שנמצא להן מקום, ושומר ביומן מה נכתב. לפני כל
     * כתיבה נבדק אם ההערה כבר שם (ריצה קודמת שנקטעה לפני שהיומן נשמר, או שתי
     * הערות זהות): אז היא רק נרשמת, ואינה נכתבת שוב.
     */
    async runImport() {
      const importer = this.state.importer;
      if (importer.phase !== Phase.review) return;
      const targets = importer.items.filter(
        (item) => !item.imported && item.resolution && item.resolution.status === 'matched',
      );
      importer.phase = Phase.importing;
      importer.cancelling = false;
      importer.progress = { done: 0, total: targets.length };
      importer.result = { added: 0, failed: 0 };
      this.changed();

      let ledger;
      try {
        ledger = await this._readLedger();
      } catch (error) {
        this._fail(error, N('קריאת יומן הייבוא נכשלה'));
        this.changed();
        return;
      }
      const recorded = new Set(ledger.map((row) => row.join('\u0001')));
      const known = new Map();
      let unsaved = 0;
      let failures = 0;
      try {
        for (const item of targets) {
          if (importer.cancelling) break;
          const request = Notes.addRequest(item);
          const row = Notes.ledgerRow(item.note, request);
          try {
            const there = await this._knownNotes(known, Notes.bookKey(row));
            const line = Notes.noteKey(request.content, request.lineNumber);
            if (!(there && there.has(line))) {
              await this.runtime.call('notes.add', request);
              if (there) there.add(line);
            }
            const id = row.join('\u0001');
            if (!recorded.has(id)) {
              recorded.add(id);
              ledger.push(row);
              unsaved += 1;
            }
            item.imported = true;
            importer.result.added += 1;
            failures = 0;
          } catch (error) {
            if (error && error.isUnsupported) throw error;
            importer.result.failed += 1;
            failures += 1;
            this.log.warn('כתיבת הערה לאוצריא נכשלה', error);
            if (failures >= MAX_CONSECUTIVE_FAILURES) throw error;
          }
          if (unsaved >= LEDGER_SAVE_EVERY) {
            await this._writeLedger(ledger);
            unsaved = 0;
          }
          importer.progress = { done: importer.progress.done + 1, total: targets.length };
          this._progress();
        }
      } catch (error) {
        this._fail(error, N('הייבוא נעצר'));
        // מה שכבר נכתב מוצג, ולא נעלם מאחורי הודעת השגיאה.
        if (importer.result.added) importer.phase = Phase.done;
      } finally {
        // מה שנכתב נרשם תמיד, גם כשהייבוא נעצר: בלי זה ייבוא חוזר היה מכפיל.
        try {
          if (unsaved) await this._writeLedger(ledger);
        } catch (error) {
          this.log.error('שמירת יומן הייבוא נכשלה', error);
          importer.error = importer.error || t('ההערות נכתבו, אך לא נשמר רישום שלהן, ולכן לא ניתן יהיה לבטל את הייבוא.');
        }
        importer.importedBefore = ledger.length;
      }
      importer.counts = Notes.summarize(importer.items);
      if (importer.phase === Phase.importing) importer.phase = Phase.done;
      this.log.info('ייבוא הערות: נכתבו ' + importer.result.added + ', נכשלו ' + importer.result.failed);
      this.changed();
    }

    /**
     * הערות הספר שכבר באוצריא, כמפתחות `Notes.noteKey`, פעם אחת לכל ספר
     * בריצה. `null` — אי אפשר היה לקרוא: כותבים בלי בדיקה, והסיכון היחיד הוא
     * כפילות אחרי ריצה שנקטעה.
     */
    async _knownNotes(cache, key) {
      if (!cache.has(key.bookUid)) {
        let keys = null;
        try {
          keys = new Set(
            (await this._listNotes(key))
              .filter((entry) => entry && typeof entry.content === 'string' && Number.isInteger(entry.lineNumber))
              .map((entry) => Notes.noteKey(entry.content, entry.lineNumber)),
          );
        } catch (error) {
          if (error && error.isUnsupported) throw error;
          this.log.debug('קריאת הערות הספר נכשלה', error);
        }
        cache.set(key.bookUid, keys);
      }
      return cache.get(key.bookUid);
    }

    // ------------------------------------------------------------ ביטול

    /**
     * מוחק מאוצריא את ההערות שהתוסף כתב, ורק כשהתוכן שלהן לא השתנה: הערה
     * שהמשתמש ערך כבר שלו. שורה שאי אפשר היה לבדוק או למחוק נשארת ביומן,
     * ואפשר לנסות שוב. מחזיר `{ removed, kept, failed }`.
     */
    async undo() {
      const importer = this.state.importer;
      if (this._busy()) return null;
      Object.assign(importer, emptyImporter(), {
        phase: Phase.undoing,
        importedBefore: importer.importedBefore,
      });
      this.changed();
      let ledger = null;
      const resolved = [];
      const result = { removed: 0, kept: 0, failed: 0 };
      try {
        ledger = await this._readLedger();
        importer.progress = { done: 0, total: ledger.length };
        // ספר אחד נקרא פעם אחת, ולא פעם לכל הערה: אוצריא טוענת את כל הספר בכל קריאה.
        const lists = new Map();
        let failures = 0;
        for (let index = 0; index < ledger.length; index++) {
          if (importer.cancelling) break;
          const row = ledger[index];
          const key = Notes.bookKey(row);
          try {
            if (!lists.has(key.bookUid)) lists.set(key.bookUid, await this._listNotes(key));
            const existing = lists.get(key.bookUid);
            const target = Notes.undoTargets(row, existing)[0];
            if (target) {
              await this.runtime.call('notes.delete', { ...key, noteId: target.id });
              lists.set(key.bookUid, existing.filter((entry) => entry !== target));
              result.removed += 1;
            } else {
              result.kept += 1;
            }
            resolved[index] = true;
            failures = 0;
          } catch (error) {
            if (error && error.isUnsupported) throw error;
            result.failed += 1;
            failures += 1;
            this.log.warn('ביטול הערה נכשל', error);
            if (failures >= MAX_CONSECUTIVE_FAILURES) throw error;
          }
          importer.progress = { done: index + 1, total: ledger.length };
          this._progress();
        }
        importer.result = result;
        importer.phase = Phase.idle;
        this.log.info(
          'ביטול ייבוא הערות: נמחקו ' + result.removed + ', נשארו ' + result.kept + ', נכשלו ' + result.failed,
        );
      } catch (error) {
        this._fail(error, N('ביטול הייבוא נכשל'));
      } finally {
        // ביומן נשאר כל מה שלא טופל: שורה שנכשלה, וכל מה שאחרי עצירה או כשל.
        if (ledger) {
          const remaining = ledger.filter((_, index) => !resolved[index]);
          try {
            await this._writeLedger(remaining);
            importer.importedBefore = remaining.length;
          } catch (error) {
            this.log.error('שמירת יומן הייבוא נכשלה', error);
            importer.error = importer.error || t('ההערות נמחקו, אך הרישום שלהן לא התעדכן.');
          }
        }
      }
      this.changed();
      return result;
    }

    /**
     * ההערות של ספר באוצריא. ספר שהוסר או שמו השתנה אין בו מה למחוק, ולכן
     * `[]`; כל כשל אחר (הרשאה, זמן קריאה, עומס) זורק, כדי שלא ייחשב "אין".
     */
    async _listNotes(key) {
      try {
        return await this.runtime.call('notes.list', key);
      } catch (error) {
        if (error && error.code === Runtime.CODES.notFound) return [];
        throw error;
      }
    }

    // ------------------------------------------------------------ כללי

    /** "עצירה" בזמן בדיקה, ייבוא או ביטול. מה שנכתב עד כה נשאר רשום. */
    /** בדיקה, ייבוא או ביטול רצים: אף אחד מהם אינו מתחיל בזמן אחר. */
    _busy() {
      const { phase } = this.state.importer;
      return phase === Phase.checking || phase === Phase.importing || phase === Phase.undoing;
    }

    /** "ביטול ההעברה": מסך אישור לפני שמוחקים. */
    askUndo() {
      if (this._busy()) return;
      this.state.importer.confirmingUndo = true;
      this.changed();
    }

    /** "חזרה" מאישור הביטול. */
    declineUndo() {
      this.state.importer.confirmingUndo = false;
      this.changed();
    }

    cancel() {
      if (!this.state.importer.cancelling) {
        this.state.importer.cancelling = true;
        this.changed();
      }
    }

    /** "סגירה" של תוצאת הבדיקה או הייבוא: חוזרים למצב ההתחלה. */
    dismiss() {
      if (this._busy()) return;
      const before = this.state.importer.importedBefore;
      this.state.importer = { ...emptyImporter(), importedBefore: before };
      this.changed();
    }

    _back() {
      const before = this.state.importer.importedBefore;
      this.state.importer = { ...emptyImporter(), importedBefore: before };
    }

    /**
     * [summary] — מה שהמשתמש רואה, במחרוזת קבועה (כך היא מתורגמת). הודעה
     * של השירות כתובה למשתמש ומוצגת; הודעה של אוצריא (`SdkError`) טכנית
     * ונשארת ביומן.
     */
    _fail(error, summary) {
      this.log.warn(summary, error);
      const importer = this.state.importer;
      const technical = Boolean(Runtime && error instanceof Runtime.SdkError);
      importer.error = error && error.isUnsupported
        ? t('לתוסף אין הרשאה לקרוא או לכתוב הערות באוצריא. אפשר לאשר אותה בהגדרות התוסף באוצריא.')
        : (!technical && error && error.message) || t(summary);
      if (importer.phase !== Phase.done) importer.phase = Phase.idle;
    }

    /** מצייר התקדמות לכל היותר כל [PROGRESS_THROTTLE_MS]. */
    _progress() {
      const time = this.now();
      if (time - this._renderedAt < PROGRESS_THROTTLE_MS) return;
      this._renderedAt = time;
      this.progressChanged();
    }
  }

  const api = {
    NotesFlow,
    Phase,
    LEDGER_KEY,
    SEARCH_DEBOUNCE_MS,
    MAX_CONSECUTIVE_FAILURES,
    emptyList,
    emptyImporter,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ResponsaNotesFlow = api;
})(typeof self !== 'undefined' ? self : globalThis);
