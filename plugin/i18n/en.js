// מילון אנגלית. המפתחות הם מחרוזות המקור בעברית, כפי שהן בקוד; בדיקת
// test/i18n.test.js נכשלת על מפתח חסר, מפתח שאינו בשימוש או משתנה שאבד.
(function (root) {
  'use strict';

  root.RESPONSA_TRANSLATIONS = root.RESPONSA_TRANSLATIONS || {};
  root.RESPONSA_TRANSLATIONS.en = {
    // ---- בקר
    'הקריאה נכשלה.': 'Reading the book list failed.',
    'לא נמצאו ספרים': 'No books found',
    'קריאת רשימת הספרים התחילה': 'Reading the book list has started',
    'רשימת ספרי בר אילן מוכנה: {books}': 'The Bar-Ilan book list is ready: {books}',
    'קריאת רשימת הספרים בוטלה': 'Reading the book list was cancelled',
    'ההגדרה לא נשמרה. אפשר לנסות שוב.': 'The setting was not saved. Please try again.',
    'חיפוש בבר אילן': 'Search in Bar-Ilan',
    'בר אילן באוצריא': 'Bar-Ilan in Otzaria',
    'לא ניתן היה ליצור את קיצור הדרך.': 'The shortcut could not be created.',
    '"בר אילן באוצריא" נוסף לתפריט התחל.': '"Bar-Ilan in Otzaria" was added to the Start menu.',
    'קיצור הדרך נוצר בשולחן העבודה.': 'The shortcut was created on the desktop.',
    'פרטי המערכת הועתקו.': 'The system details were copied.',
    'ההעתקה לא הצליחה. אפשר לסמן את הפרטים ולהעתיק ידנית.':
      'Copying failed. You can select the details and copy them manually.',
    'הדיווח נשלח. תודה!': 'The report was sent. Thank you!',
    'הדיווח יישלח כשיהיה חיבור לאינטרנט. תודה!':
      'The report will be sent when you are online. Thank you!',
    'הדיווח לא נשלח. אפשר לנסות שוב מאוחר יותר.': 'The report was not sent. Please try again later.',
    'לא ניתן לפתוח את הדפדפן. הכתובת: {url}': 'The browser could not be opened. The address is: {url}',

    // ---- תוויות ומספרים
    'ספר אחד': 'one book',
    '{count} ספרים': '{count} books',
    'נמצא ספר אחד': 'One book found',
    'נמצאו {count} ספרים': '{count} books found',
    'קריאת הרשימה מחדש לא הושלמה: {reason}': 'Re-reading the list did not finish: {reason}',
    'קריאת הרשימה מחדש לא הושלמה.': 'Re-reading the list did not finish.',
    'הרשימה הקודמת נשארה בשימוש.': 'The previous list is still in use.',
    'רשימת הספרים נקראה מהתקנה אחרת של בר אילן, ולכן ייתכן שחלק מהספרים לא ייפתחו. מומלץ לקרוא אותה מחדש.':
      'The book list was read from a different Bar-Ilan installation, so some books may not open. Reading it again is recommended.',
    'רשימת הספרים נקראה בגרסה קודמת של התוסף. מומלץ לקרוא אותה מחדש.':
      'The book list was read by an older version of the plugin. Reading it again is recommended.',
    'קורא את רשימת הספרים מבר אילן…': 'Reading the book list from Bar-Ilan…',
    'מסדר את הספרים לפי קטגוריות…': 'Sorting the books into categories…',
    'מכין את בר אילן…': 'Preparing Bar-Ilan…',
    'נקראו {count} רשומות': '{count} entries read',
    'נקראו {count} מתוך כ-{total} רשומות': '{count} of about {total} entries read',
    'חלק {done} מתוך {total}': 'Part {done} of {total}',
    'פחות מדקה': 'less than a minute left',
    'נותרה כדקה': 'about a minute left',
    'נותרו כ-{count} דקות': 'about {count} minutes left',

    // ---- שגיאות לפי קוד
    'שירות בר אילן אינו פועל במחשב. אם הוא לא מותקן, יש להתקין אותו.':
      'The Bar-Ilan service is not running on this computer. If it is not installed, please install it.',
    'לתוסף אין הרשאה לגשת לשירות המקומי.': 'The plugin is not allowed to reach the local service.',
    'אוצריא עסוקה כרגע. אפשר לנסות שוב בעוד רגע.': 'Otzaria is busy right now. Please try again in a moment.',
    'השירות לא הגיב בזמן. ייתכן שבר אילן עסוק; אפשר לנסות שוב.':
      'The service did not answer in time. Bar-Ilan may be busy; please try again.',
    'החיבור לשירות נקטע. אפשר לנסות שוב.': 'The connection to the service was lost. Please try again.',
    'בר אילן עסוק כרגע בפעולה אחרת. אפשר לנסות שוב בעוד רגע.':
      'Bar-Ilan is busy with another action. Please try again in a moment.',
    'בר אילן (פרויקט השו"ת) אינו מותקן במחשב הזה.':
      'Bar-Ilan (the Responsa Project) is not installed on this computer.',
    'בר אילן אינו פעיל ולא ניתן היה להפעיל אותו. יש לפתוח אותו ולנסות שוב.':
      'Bar-Ilan is not running and could not be started. Please open it and try again.',
    'רשימת הספרים של בר אילן עוד לא נקראה.': 'The Bar-Ilan book list has not been read yet.',
    'הספר לא נמצא ברשימה. ייתכן שהרשימה נקראה מחדש מאז; יש לחפש שוב.':
      'The book is not in the list. The list may have been read again since; please search again.',
    'בר אילן לא זיהה את הספר. אפשר לקרוא את רשימת הספרים מחדש ולנסות שוב.':
      'Bar-Ilan did not recognize the book. You can read the book list again and retry.',
    'בר אילן פתח ספר אחר, והפתיחה בוטלה.': 'Bar-Ilan opened a different book, so the action was cancelled.',
    'בבר אילן פתוחים חלונות רבים מדי. יש לסגור בו כמה חלונות ולנסות שוב.':
      'Too many windows are open in Bar-Ilan. Please close some of them and try again.',
    'בר אילן לא פתח את החלון הדרוש. ייתכן שחלון אחר בו ממתין לתשובה.':
      'Bar-Ilan did not open the needed window. Another window in it may be waiting for an answer.',
    'בר אילן לא הגיב בזמן. ייתכן שהוא עסוק או ממתין לתשובה בחלון אחר.':
      'Bar-Ilan did not respond in time. It may be busy or waiting for an answer in another window.',
    'השירות הזה שייך למשתמש Windows אחר שמחובר למחשב.':
      'This service belongs to another Windows user signed in to this computer.',
    'הבקשה לשירות לא הייתה תקינה.': 'The request to the service was not valid.',
    'הפעולה נכשלה. אפשר לנסות שוב.': 'The action failed. Please try again.',

    // ---- חיפוש בבר אילן
    'החיפוש כלל רק את תחילת הטקסט שסומן.': 'Only the beginning of the selected text was searched.',
    'בר אילן מצא {count} תוצאות עבור "{query}".': 'Bar-Ilan found {count} results for "{query}".',
    'החיפוש "{query}" הוצג בבר אילן.': 'The search "{query}" is shown in Bar-Ilan.',
    'בר אילן לא ביצע את החיפוש: {reason}': 'Bar-Ilan did not run the search: {reason}',
    'בר אילן לא ביצע את החיפוש. הסיבה מוצגת בחלון של בר אילן.':
      'Bar-Ilan did not run the search. The reason is shown in the Bar-Ilan window.',
    'החיפוש נשלח לבר אילן.': 'The search was sent to Bar-Ilan.',

    // ---- פס עליון
    'מהדורה {version}': 'edition {version}',
    'קורא מחדש…': 'reading again…',
    'קורא את רשימת הספרים…': 'Reading the book list…',
    'נדרשת התקנה': 'Installation needed',
    'נדרשת הרשאה': 'Permission needed',
    'נדרשת הכנה חד-פעמית': 'One-time setup needed',

    // ---- מנוע
    'הספר שנבחר אינו מזוהה. יש לחפש אותו שוב.': 'The selected book was not recognized. Please search for it again.',
    'יש לסמן בספר מילה או משפט, ואז לבחור "חיפוש בבר אילן".':
      'Select a word or a sentence in the book, then choose "Search in Bar-Ilan".',
    'הספר': 'The book',
    '"{title}" נפתח בבר אילן. אם החלון לא הופיע, הוא בשורת המשימות.':
      '"{title}" opened in Bar-Ilan. If the window did not appear, it is in the taskbar.',
    '"{title}" נפתח בבר אילן': '"{title}" opened in Bar-Ilan',

    // ---- הגדרות
    'סגירה': 'Close',
    'ספרי בר אילן בחיפוש הספרייה': 'Bar-Ilan books in library search',
    'ספרי בר אילן יופיעו בתוצאות "איתור ספר או מחבר" במסך הספרייה של אוצריא, ולחיצה עליהם תפתח אותם בבר אילן.':
      'Bar-Ilan books appear in the "Find a book or author" (איתור ספר או מחבר) results of the Otzaria library, and clicking one opens it in Bar-Ilan.',
    '"חיפוש בבר אילן" בלחיצה ימנית': '"Search in Bar-Ilan" on right-click',
    'בספר פתוח: מסמנים מילה או משפט, לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן". בר אילן נפתח עם תוצאות החיפוש.':
      'In an open book: select a word or a sentence, right-click and choose "Search in Bar-Ilan". Bar-Ilan opens with the results.',
    'קיצור מקלדת: {shortcut}. אפשר לשנות אותו בהגדרות אוצריא ← קיצורי מקשים.':
      'Keyboard shortcut: {shortcut}. You can change it in Otzaria settings → Keyboard shortcuts.',
    'כדי להפעיל: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "פריטים בתפריט הטקסט".':
      'To turn it on: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn on "Items in the text menu" (פריטים בתפריט הטקסט).',
    'כדי להפעיל: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "הוספת רכיבים לתוכנה".':
      'To turn it on: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn on "Add components to the app" (הוספת רכיבים לתוכנה).',
    '"חיפוש בבר אילן" בלחיצה ימנית, וספרי בר אילן בחיפוש הספרייה, דורשים הרשאה אחת שכבויה עכשיו.':
      '"Search in Bar-Ilan" on right-click, and Bar-Ilan books in library search, need one permission that is off right now.',
    '{count} ספרים ברשימה': '{count} books in the list',
    'הרשימה עוד לא נקראה': 'The list has not been read yet',
    'נקראה ב-{date}': 'read on {date}',
    'מהדורת בר אילן: {version}': 'Bar-Ilan edition {version}',
    'רשימת הספרים': 'Book list',
    'קריאה מחדש': 'Read again',
    'כשהותקנה מהדורה חדשה של בר אילן, או כשספר מסוים לא נפתח. לוקח כחמש דקות, והרשימה הקיימת נשארת בשימוש עד שהחדשה מוכנה.':
      'Use this after installing a new Bar-Ilan edition, or when a book will not open. It takes about five minutes, and the current list stays in use until the new one is ready.',
    'קיצור דרך בשולחן העבודה': 'Desktop shortcut',
    'לחיצה כפולה עליו פותחת את אוצריא ישר בלשונית בר אילן.':
      'Double-clicking it opens Otzaria directly in the Bar-Ilan tab.',
    'יצירה': 'Create',
    'תפריט התחל': 'Start menu',
    'מוסיף את "בר אילן באוצריא" לתפריט התחל של Windows.': 'Adds "Bar-Ilan in Otzaria" to the Windows Start menu.',
    'הוספה': 'Add',
    'עבודה ברקע: פעילה': 'Background work: on',
    'עבודה ברקע: כבויה': 'Background work: off',
    'כמו באוצריא': 'Same as Otzaria',
    'הגדרות בר אילן': 'Bar-Ilan settings',
    'שילוב באוצריא': 'Otzaria integration',
    'איפה עוד אפשר להגיע לספרי בר אילן, מלבד הלשונית הזו': 'Where else you can reach Bar-Ilan books, besides this tab',
    'שפה': 'Language',
    'שפת התוסף': 'Plugin language',
    'קיצורי דרך': 'Shortcuts',
    'עזרה ותמיכה': 'Help and support',

    // ---- עזרה: מדריך
    'התוסף מחבר את אוצריא לתוכנת פרויקט השו"ת של בר אילן המותקנת במחשב: מוצאים ספר באוצריא, והוא נפתח בבר אילן. התוכנה צריכה להיות מותקנת; היא לא חייבת להיות פתוחה.':
      'The plugin connects Otzaria to the Bar-Ilan Responsa Project installed on this computer: find a book in Otzaria, and it opens in Bar-Ilan. Bar-Ilan has to be installed; it does not have to be open.',
    'חיפוש ספר ופתיחתו': 'Finding and opening a book',
    'בלשונית "בר אילן" מקלידים שם ספר, שם מחבר, או שניהם יחד.':
      'In the "Bar-Ilan" tab, type a book title, an author, or both.',
    'לוחצים על "פתיחה בבר אילן" ליד הספר.': 'Click "Open in Bar-Ilan" next to the book.',
    'בר אילן נפתח (או עולה לחזית) עם הספר, תוך שניות ספורות.':
      'Bar-Ilan opens (or comes to the front) with the book within a few seconds.',
    'ספרי בר אילן במסך הספרייה': 'Bar-Ilan books in the library screen',
    'במסך הספרייה של אוצריא מקלידים בתיבה "איתור ספר או מחבר".':
      'In the Otzaria library, type in the "Find a book or author" (איתור ספר או מחבר) box.',
    'ספרי בר אילן מופיעים בין התוצאות, עם שורה "בר אילן" מתחת לשם.':
      'Bar-Ilan books appear among the results, with a "בר אילן" line under the title.',
    'לחיצה על ספר כזה פותחת אותו בבר אילן.': 'Clicking such a book opens it in Bar-Ilan.',
    'בספר פתוח באוצריא מסמנים מילה או משפט.': 'In a book open in Otzaria, select a word or a sentence.',
    'לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן" — או לוחצים {shortcut}.':
      'Right-click and choose "Search in Bar-Ilan", or press {shortcut}.',
    'בר אילן מחפש את הטקסט בכל ספריו ומציג את התוצאות בחלון שלו.':
      'Bar-Ilan searches the text in all its books and shows the results in its own window.',
    'ניקוד, טעמים ופיסוק מוסרים לפני החיפוש; נשלחות עד עשר מילים.':
      'Vowels, cantillation marks and punctuation are removed first; up to ten words are sent.',
    'קריאת רשימת הספרים': 'Reading the book list',
    'בפעם הראשונה התוסף קורא את רשימת הספרים מבר אילן — כחמש דקות, פעם אחת.':
      'The first time, the plugin reads the book list from Bar-Ilan: about five minutes, once.',

    // ---- עזרה: פתרון בעיות
    'כתוב שצריך להתקין רכיב': 'It says a component must be installed',
    'התוסף צריך את "שירות בר אילן לאוצריא", שמחבר בין שתי התוכנות. לוחצים "הורדת המתקין", פותחים את הקובץ ולוחצים "הבא" עד הסוף. אין צורך בהרשאות מנהל. אם הרכיב כבר מותקן — הפעלה מחדש של המחשב מפעילה אותו.':
      'The plugin needs the "Bar-Ilan service for Otzaria", which connects the two programs. Click "Download installer", open the file and click "Next" to the end. No administrator rights are needed. If it is already installed, restarting the computer starts it.',
    'כתוב שבר אילן לא נמצא במחשב': 'It says Bar-Ilan was not found',
    'התוסף מחפש את פרויקט השו"ת במקומות ההתקנה הרגילים. אם הוא מותקן, פותחים אותו פעם אחת ואז לוחצים "בדיקה חוזרת".':
      'The plugin looks for the Responsa Project in the usual install locations. If it is installed, open it once and click "Check again".',
    'ספר לא נפתח, או שנפתח ספר אחר': 'A book does not open, or a different book opens',
    'בר אילן שואל "האם ברצונך לחפש בכל המאגרים?"': 'Bar-Ilan asks whether to search all databases',
    'זו שאלה של בר אילן עצמו: החיפוש לא מצא תוצאות במאגרים שנבחרו בו. עונים עליה בחלון של בר אילן.':
      'That is Bar-Ilan’s own question: the search found nothing in the databases selected there. Answer it in the Bar-Ilan window.',
    'בר אילן כותב "נמצאו מעל 32000 תוצאות"': 'Bar-Ilan says "over 32000 results"',
    'החיפוש כללי מדי לבר אילן. מסמנים קטע ארוך או מדויק יותר ומחפשים שוב.':
      'The search is too general for Bar-Ilan. Select a longer or more exact passage and search again.',
    'חלון בר אילן לא עולה לחזית': 'The Bar-Ilan window does not come to the front',
    'בלחיצה ימנית נפתחת לשונית התוסף': 'Right-click search opens the plugin tab',
    'האם התוסף רץ ברקע כל הזמן?': 'Does the plugin run in the background all the time?',
    'לא. אוצריא מעירה את התוסף רק כשצריך אותו: בלחיצה ימנית על "חיפוש בבר אילן", בקיצור המקלדת, או בבחירת ספר של בר אילן בספרייה. אחרי שלוש דקות בלי פעילות היא מכבה אותו. מה שפועל תמיד הוא "שירות בר אילן לאוצריא": תהליך קטן (כ-16MB) שממתין לבקשות ואינו צורך מעבד בינתיים.':
      'No. Otzaria wakes the plugin only when it is needed: a right-click on "חיפוש בבר אילן" (Search in Bar-Ilan), the keyboard shortcut, or choosing a Bar-Ilan book in the library. After three idle minutes Otzaria shuts it down. What always runs is the "Bar-Ilan service for Otzaria": a small process (about 16MB) that waits for requests and uses no CPU meanwhile.',
    'ספרי בר אילן לא מופיעים בחיפוש הספרייה': 'Bar-Ilan books do not appear in library search',
    'בר אילן הופעל "כמנהל" ולא מגיב לתוסף': 'Bar-Ilan runs "as administrator" and ignores the plugin',
    'כש-Windows מריץ את בר אילן בהרשאות מנהל, תוכנות רגילות לא יכולות לשלוט בו. סוגרים אותו ופותחים שוב כרגיל.':
      'When Windows runs Bar-Ilan as administrator, regular programs cannot control it. Close it and open it again normally.',

    // ---- עזרה: מצב המערכת
    'כן': 'Yes',
    'לא': 'No',
    'דלוק': 'On',
    'כבוי': 'Off',
    'גרסת אוצריא': 'Otzaria version',
    'לא ידוע': 'Unknown',
    'גרסת התוסף': 'Plugin version',
    'גרסת השירות': 'Service version',
    'לא פועל': 'Not running',
    'בר אילן': 'Bar-Ilan',
    'מותקן': 'Installed',
    'לא נמצא': 'Not found',
    'מיקום ההתקנה': 'Install location',
    'בר אילן פתוח עכשיו': 'Bar-Ilan is open now',
    'עוד לא נקראה': 'Not read yet',
    'חיפוש הספרייה': 'Library search',
    'לחיצה ימנית': 'Right-click',
    'עבודה ברקע': 'Background work',
    'העתקת הפרטים': 'Copy details',
    'בדיקה חוזרת': 'Check again',
    'בודק…': 'Checking…',

    // ---- עזרה: אודות ודיווח
    'תיאור הבעיה': 'Problem description',
    'מה ניסיתם לעשות, ומה קרה במקום?': 'What did you try to do, and what happened instead?',
    'חיפוש ספרי פרויקט השו"ת של בר אילן המותקן במחשב, ופתיחתם בבר אילן — מתוך אוצריא.':
      'Find books of the Bar-Ilan Responsa Project installed on this computer and open them in Bar-Ilan, from within Otzaria.',
    'גרסה {version} · מאת מיכאלוש': 'Version {version} · by Michaelush',
    'מדריך למשתמש': 'User guide',
    'הורדת הגרסה האחרונה': 'Download the latest version',
    'דיווח על בעיה': 'Report a problem',
    'שליחת דיווח': 'Send report',
    'שולח…': 'Sending…',
    'איך משתמשים': 'How to use',
    'פתרון בעיות': 'Troubleshooting',
    'מצב המערכת': 'System status',
    'אודות ודיווח': 'About and report',
    'נושאי העזרה': 'Help topics',

    // ---- שירות
    'תוכנה אחרת במחשב משתמשת בחיבור של השירות.': 'Another program on this computer is using the service’s connection.',
    'השירות החזיר תשובה לא תקינה.': 'The service returned an invalid answer.',
    'השירות החזיר שגיאה (HTTP {status}).': 'The service returned an error (HTTP {status}).',

    // ---- מסכים
    'מתחבר לשירות בר אילן…': 'Connecting to the Bar-Ilan service…',
    'התוסף פועל רק ב-Windows': 'The plugin works only on Windows',
    'פרויקט השו"ת של בר אילן הוא תוכנה ל-Windows, ולכן גם התוסף פועל רק שם.':
      'The Bar-Ilan Responsa Project is Windows software, so the plugin works only there too.',
    'התוסף צריך הרשאה': 'The plugin needs a permission',
    'כדי לדבר עם הרכיב שמחבר את אוצריא לבר אילן, התוסף צריך את ההרשאה "גישה לשירותים מקומיים". היא לא פותחת גישה לאינטרנט.':
      'To talk to the component that connects Otzaria to Bar-Ilan, the plugin needs the "Access to local services" (גישה לשירותים מקומיים) permission. It does not give internet access.',
    'באוצריא פתחו את ההגדרות, ואז "כלים".': 'In Otzaria, open the settings, then "Tools (כלים)".',
    'בחרו ב"בר אילן".': 'Choose "Bar-Ilan".',
    'הדליקו את "גישה לשירותים מקומיים".': 'Turn on "Access to local services" (גישה לשירותים מקומיים).',
    'צריך להתקין רכיב קטן, פעם אחת': 'A small component needs to be installed, once',
    'כדי שאוצריא תוכל לעבוד עם תוכנת בר אילן, יש להתקין במחשב את "שירות בר אילן לאוצריא". ההתקנה לוקחת פחות מדקה ואינה דורשת הרשאות מנהל.':
      'For Otzaria to work with Bar-Ilan, install the "Bar-Ilan service for Otzaria" on this computer. It takes less than a minute and needs no administrator rights.',
    'לחצו על "הורדת המתקין".': 'Click "Download installer".',
    'פתחו את הקובץ שירד, לחצו "הבא" ובסוף "סיום".': 'Open the downloaded file, click "Next" and finally "Finish".',
    'חזרו לכאן. המסך יתעדכן מעצמו.': 'Come back here. The screen updates by itself.',
    'הורדת המתקין': 'Download installer',
    'כבר התקנתם? ייתכן שהשירות לא פועל כרגע. הפעלה מחדש של המחשב תפעיל אותו.':
      'Already installed? The service may not be running right now. Restarting the computer starts it.',
    'השירות לא מגיב כרגע': 'The service is not responding',
    'אם זה חוזר, הפעלה מחדש של המחשב בדרך כלל פותרת את זה.': 'If this keeps happening, restarting the computer usually fixes it.',
    'צריך לעדכן את התוסף': 'The plugin needs an update',
    'צריך לעדכן את שירות בר אילן': 'The Bar-Ilan service needs an update',
    'גרסת השירות שבמחשב וגרסת התוסף אינן מתאימות זו לזו. המתקין החדש מעדכן את שניהם.':
      'The service on this computer and the plugin do not match. The new installer updates both.',
    'הורדת הגרסה החדשה': 'Download the new version',
    'תוכנה אחרת תופסת את החיבור של השירות': 'Another program is using the service’s connection',
    'תוכנה אחרת במחשב משתמשת בחיבור שהשירות צריך, ולכן השירות לא יכול לפעול. הפעלה מחדש של המחשב בדרך כלל פותרת זאת.':
      'Another program on this computer uses the connection the service needs, so the service cannot run. Restarting the computer usually fixes this.',
    'בר אילן לא נמצא במחשב': 'Bar-Ilan was not found on this computer',
    'התוסף עובד עם תוכנת פרויקט השו"ת של בר אילן, ולא מצא אותה במחשב הזה. אחרי שתותקן, המסך יתעדכן מעצמו.':
      'The plugin works with the Bar-Ilan Responsa Project and did not find it on this computer. Once it is installed, this screen updates by itself.',
    'הכנה חד-פעמית': 'One-time setup',
    'כדי להציג כאן את ספרי בר אילן, התוסף צריך לקרוא פעם אחת את רשימת הספרים מהתוכנה. זה לוקח כחמש דקות.':
      'To show Bar-Ilan books here, the plugin needs to read the book list from the program once. It takes about five minutes.',
    'התחלה': 'Start',
    'נמצא במחשב: פרויקט השו"ת, מהדורה {version}.': 'Found on this computer: the Responsa Project, edition {version}.',
    'קריאת רשימת הספרים לא הושלמה': 'Reading the book list did not finish',
    'שום דבר לא נמחק. אפשר לנסות שוב.': 'Nothing was deleted. You can try again.',
    'ניסיון נוסף': 'Try again',
    'התקדמות קריאת רשימת הספרים': 'Book list reading progress',
    'מבטל…': 'Cancelling…',
    'ביטול': 'Cancel',
    'קורא מחדש את רשימת הספרים. בינתיים החיפוש עובד על הרשימה הקיימת, ופתיחת ספרים תתאפשר בסיום.':
      'Reading the book list again. Meanwhile search uses the current list, and opening books will be possible when it finishes.',
    'חיפוש ספר או מחבר בבר אילן': 'Search for a book or author in Bar-Ilan',
    'מחפש בבר אילן: "{title}"…': 'Searching Bar-Ilan: "{title}"…',
    'פותח בבר אילן: "{title}"…': 'Opening in Bar-Ilan: "{title}"…',
    'אפשר לחפש לפי שם הספר, שם המחבר, או שניהם יחד. למשל: אבני נזר, מהרש"א, רא"ש יבמות.':
      'Search by book title, author, or both. For example: אבני נזר, מהרש"א, רא"ש יבמות.',
    'לא נמצאו ספרים. אפשר לנסות מילה אחרת, או רק חלק מהשם.':
      'No books found. Try another word, or only part of the title.',
    'תוצאות החיפוש': 'Search results',
    'עוד תוצאות': 'More results',
    'טוען…': 'Loading…',
    'פתיחה בבר אילן': 'Open in Bar-Ilan',
    'פותח…': 'Opening…',
    'פרויקט השו"ת (בר אילן)': 'The Responsa Project (Bar-Ilan)',
    'הגדרות': 'Settings',
    'התוסף פועל רק מתוך אוצריא.': 'The plugin works only inside Otzaria.',
    // ---- הודעות שירות, הרשאות ועזרה (0.2.0)
    'אירעה תקלה פנימית בשירות. אפשר לנסות שוב.': 'An internal error occurred in the service. Please try again.',
    'לא ניתן לקרוא את רשימת הספרים. אפשר לבנות אותה מחדש בהגדרות התוסף.': 'The book list could not be read. You can rebuild it in the plugin settings.',
    'בר אילן פועל כמנהל מערכת, ולכן אין אליו גישה. יש לסגור אותו ולפתוח אותו שוב כרגיל.': 'Bar-Ilan is running as administrator, so it cannot be reached. Close it and open it again normally.',
    'הפעולה בוטלה.': 'The action was cancelled.',
    'השירות שבמחשב אינו מכיר את הפעולה הזו. כנראה שצריך לעדכן אותו.': 'The service on this computer does not know this action. It probably needs an update.',
    'הבקשה גדולה מדי.': 'The request is too large.',
    'השירות דחה את הבקשה.': 'The service rejected the request.',
    'ההוראות המלאות בלשונית "בר אילן".': 'Full instructions are in the "Bar-Ilan" tab.',
    'שירות בר אילן שבמחשב ישן, ולכן "חיפוש בבר אילן" בלחיצה ימנית לא יעבוד. כדאי להוריד את הגרסה החדשה.': 'The Bar-Ilan service on this computer is outdated, so "Search in Bar-Ilan" from the right-click menu will not work. Please download the new version.',
    'כדי לחפש בבר אילן צריך לעדכן את שירות בר אילן. בלשונית "בר אילן" יש כפתור להורדת הגרסה החדשה.': 'To search in Bar-Ilan, the Bar-Ilan service needs an update. The "Bar-Ilan" tab has a button to download the new version.',
    'בטקסט שנבחר אין מילים בעברית לחיפוש בבר אילן. יש לסמן מילה או משפט בעברית ולנסות שוב.': 'The selected text has no Hebrew words to search in Bar-Ilan. Select a Hebrew word or phrase and try again.',
    'חיפוש בלחיצה ימנית פועל בלי לעבור ללשונית התוסף.': 'Right-click search works without switching to the plugin tab.',
    'אפשר לכבות זאת בהגדרות התוסף.': 'You can turn this off in the plugin settings.',
    'אין "חיפוש בבר אילן" בתפריט של לחיצה ימנית': '"Search in Bar-Ilan" is missing from the right-click menu',
    'כך זה עובד כשההרשאה "הפעלה ברקע לפי אירוע" כבויה. כדי שהחיפוש יעבוד בלי לעזוב את הספר: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו את ההרשאה.': 'That is how it works while the "Run in the background on events" (הפעלה ברקע לפי אירוע) permission is off. To search without leaving the book: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn the permission on.',
    'המתג בהגדרות התוסף צריך להיות דלוק, ורשימת הספרים צריכה להיקרא לפחות פעם אחת. מקלידים לפחות שלוש אותיות.': 'The switch in the plugin settings must be on, and the book list must have been read at least once. Type at least three letters.',
    'בר אילן מפסיק לפתוח חלונות חדשים כשפתוחים בו כ-22. סוגרים בו כמה חלונות ומנסים שוב.': 'Bar-Ilan stops opening new windows when about 22 are open. Close a few of its windows and try again.',
    'הוספת רכיבים לתוכנה': 'Add components to the app',
    'לפחות עשרה תווים': 'At least ten characters',
    '"חיפוש בבר אילן" בלחיצה ימנית דורש הרשאה אחת שכבויה עכשיו.': '"Search in Bar-Ilan" from the right-click menu needs one permission that is currently off.',
    'לא להציג שוב': 'Don\'t show again',
    // ---- מסך פתיחה, פרטי ספר, קישורים ויומן
    'יומן פעולות': 'Activity log',
    'אין כרגע חיבור לאינטרנט, ולכן הדף לא ייפתח. הכתובת: {url}': 'There is no internet connection right now, so the page will not open. The address: {url}',
    'מחבר': 'Author',
    'מקום הדפסה': 'Place of printing',
    'שנת הדפסה': 'Year of printing',
    'מהדורה': 'Edition',
    'מיקום בבר אילן': 'Location in Bar-Ilan',
    'נושאים': 'Subjects',
    'קטגוריה מקבילה באוצריא': 'Matching Otzaria category',
    'מזהה בבר אילן': 'Bar-Ilan ID',
    'תוכנת פרויקט השו"ת של בר אילן מותקנת במחשב': 'The Bar-Ilan Responsa Project is installed on this computer',
    '"שירות בר אילן לאוצריא" מותקן ופועל': 'The "Bar-Ilan service for Otzaria" is installed and running',
    'ההרשאה "הוספת רכיבים לתוכנה" דלוקה (לחיפוש בלחיצה ימנית ובמסך הספרייה)': 'The "Add components to the app" (הוספת רכיבים לתוכנה) permission is on (for right-click search and the library screen)',
    'ההרשאה "הוספת רכיבים לתוכנה" דלוקה (לחיפוש בלחיצה ימנית)': 'The "Add components to the app" (הוספת רכיבים לתוכנה) permission is on (for right-click search)',
    'רשימת הספרים נקראה מבר אילן (פעם אחת, כחמש דקות)': 'The book list was read from Bar-Ilan (once, about five minutes)',
    'התקנה והכנה, פעם אחת': 'One-time installation and setup',
    'מתקינים את "שירות בר אילן לאוצריא": בלשונית הזו יש כפתור "הורדת המתקין". המתקין מוסיף לאוצריא גם את התוסף, ואינו דורש הרשאות מנהל.': 'Install the "Bar-Ilan service for Otzaria": this tab has a "Download installer" button. The installer also adds the plugin to Otzaria, and needs no administrator rights.',
    'בלשונית "בר אילן" לוחצים "התחלה", והתוסף קורא את רשימת הספרים (כחמש דקות).': 'In the "Bar-Ilan" tab, click "Start" and the plugin reads the book list (about five minutes).',
    'התוסף עובד גם בלי אינטרנט: הכול קורה במחשב שלכם.': 'The plugin works without internet too: everything happens on your computer.',
    'הכפתור "פרטי הספר" שליד כל ספר מציג את המחבר, מקום ושנת ההדפסה, המהדורה ומיקום הספר בבר אילן.': 'The "Book details" button next to each book shows its author, place and year of printing, edition and location in Bar-Ilan.',
    'הגדרות התוסף': 'Plugin settings',
    'כפתור ההגדרות שבראש הלשונית פותח את לוח ההגדרות מהצד.': 'The settings button at the top of the tab opens the settings panel from the side.',
    'שם מדליקים או מכבים את החיפוש בלחיצה ימנית ואת ספרי בר אילן במסך הספרייה, בוחרים שפה (עברית או English), קוראים מחדש את רשימת הספרים ויוצרים קיצור דרך.': 'There you turn right-click search and Bar-Ilan books in the library screen on or off, choose a language (Hebrew or English), read the book list again and create a shortcut.',
    'המדריך המלא באתר': 'The full guide online',
    'פרטים והבהרות בפורום אוצריא': 'Details and clarifications on the Otzaria forum',
    'מוכן': 'Ready',
    'חסר': 'Missing',
    'עוד לא ידוע': 'Not known yet',
    'ברוכים הבאים לבר אילן באוצריא': 'Welcome to Bar-Ilan in Otzaria',
    'התוסף מחבר את אוצריא לתוכנת פרויקט השו"ת של בר אילן שמותקנת במחשב שלכם, ועובד גם בלי אינטרנט.': 'The plugin connects Otzaria to the Bar-Ilan Responsa Project installed on your computer, and works without internet too.',
    'מחפשים ספר או מחבר, ופותחים אותו בבר אילן בלחיצה.': 'Find a book or an author, and open it in Bar-Ilan with one click.',
    'מסמנים מילה או משפט בספר באוצריא, לוחצים לחיצה ימנית ובוחרים "חיפוש בבר אילן".': 'Select a word or a sentence in an Otzaria book, right-click and choose "Search in Bar-Ilan".',
    'ספרי בר אילן מופיעים גם בחיפוש של מסך הספרייה באוצריא.': 'Bar-Ilan books also appear in the Otzaria library screen search.',
    'מה צריך כדי להתחיל': 'What you need to get started',
    'פעולות אחרונות': 'Recent activity',
    'עוד לא נרשמו פעולות.': 'No activity recorded yet.',
    'קישורים': 'Links',
    'אין כרגע חיבור לאינטרנט, ולכן הקישורים לא ייפתחו. כל ההדרכה זמינה כאן, בכרטיסייה "איך משתמשים".': 'There is no internet connection right now, so the links will not open. All the guidance is available here, in the "How to use" tab.',
    'המדריך המלא, עם תמונות': 'The full guide, with pictures',
    'התוסף בחנות התוספים של אוצריא': 'The plugin in the Otzaria plugin store',
    'עדכונים ודירוג': 'Updates and ratings',
    'דף התוסף ב-GitHub': 'The plugin page on GitHub',
    'קוד המקור, שינויים בכל גרסה, ומדריך למפתחים': 'Source code, changes in each version, and a developer guide',
    'דיווח או הצעה ב-GitHub': 'Report a problem or suggest an idea on GitHub',
    'למי שיש חשבון GitHub; אפשר גם לדווח כאן למטה': 'For those with a GitHub account; you can also report right below',
    'המתקין של השירות ושל התוסף יחד': 'The installer for both the service and the plugin',
    'מסך הפתיחה': 'Welcome screen',
    'הדיווח נשלח למפתח דרך אוצריא, יחד עם פרטי המערכת ויומן הפעולות האחרונות (בלי תוכן אישי ובלי נתיבים). לפני השליחה אוצריא מבקשת אישור.': 'The report is sent to the developer through Otzaria, with the system details and the recent activity log (no personal content and no file paths). Otzaria asks for confirmation before sending.',
    'קוד לתמיכה: {code}': 'Support code: {code}',
    'אין כרגע חיבור לאינטרנט. אפשר להוריד את המתקין במחשב אחר, מדף ההורדות של התוסף ב-GitHub, ולהעביר אותו בדיסק און קי.': 'There is no internet connection right now. You can download the installer on another computer, from the plugin\'s download page on GitHub, and bring it over on a USB drive.',
    'פרטי הספר': 'Book details',
    // ---- הבהרה: רישיון
    'הבהרה חשובה': 'Important notice',
    'התוסף נועד לסייע למי שרכש כדין רישיון לתוכנת פרויקט השו"ת של אוניברסיטת בר אילן. הוא עובד רק עם התוכנה שמותקנת אצלכם, ואינו מעתיק, שומר או שולח את תוכן הספרים: הוא רק מבקש מבר אילן לפתוח ספר או לחפש, כפי שהייתם עושים בעצמכם.': 'This plugin is meant to help those who have lawfully purchased a license for the Bar-Ilan University Responsa Project. It works only with the program installed on your computer, and does not copy, store or send the content of the books: it only asks Bar-Ilan to open a book or to search, as you would yourself.',
    'אין להשתמש בו עם עותק שאינו מורשה. "שארית ישראל לא יעשו עוולה" (צפניה ג, יג).': 'Do not use it with an unlicensed copy. "The remnant of Israel shall not do iniquity" (Zephaniah 3:13).',
    'הבנתי, בואו נתחיל': 'I understand, let\'s start',
    // ---- ניסוחים מסבב ה-QA
    'בר אילן לא מצא תוצאות עבור "{query}" במאגרים שנבחרו, ושואל אם לחפש בכל המאגרים. עונים על השאלה בחלון של בר אילן.': 'Bar-Ilan found no results for "{query}" in the selected databases and asks whether to search all of them. Answer the question in the Bar-Ilan window.',
    'התוסף נועד למי שרכש כדין רישיון לפרויקט השו"ת של בר אילן. "שארית ישראל לא יעשו עוולה". הפרטים בלשונית התוסף.': 'This plugin is meant for those who lawfully purchased a license for the Bar-Ilan Responsa Project. "The remnant of Israel shall not do iniquity." The details are in the plugin tab.',
    'אפשר לפתוח את לשונית התוסף מאוצריא: כלים ← תוספים ← "בר אילן".': 'You can open the plugin tab in Otzaria: Tools (כלים) → Plugins (תוספים) → "בר אילן".',
    'כדי שגם הקיצור {shortcut} יעבוד: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "קיצורי מקלדת".': 'For the {shortcut} shortcut to work too: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn on "Keyboard shortcuts" (קיצורי מקלדת).',
    'קריאת הרשימה מחדש': 'Read the list again',
    'בלי ההרשאה "הפעלה ברקע לפי אירוע", חיפוש בלחיצה ימנית מעביר ללשונית התוסף. להפעלה: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו "הפעלה ברקע לפי אירוע".': 'Without the "Run in the background on events" (הפעלה ברקע לפי אירוע) permission, right-click search switches to the plugin tab. To turn it on: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn on "Run in the background on events".',
    'בהגדרות אוצריא ← כלים ← בר אילן מדליקים את "הוספת רכיבים לתוכנה" (בשביל החיפוש בלחיצה ימנית). מומלץ להדליק גם את "הפעלה ברקע לפי אירוע", כדי שהחיפוש לא יעביר אתכם ללשונית התוסף.': 'In Otzaria settings → Tools (כלים) → Bar-Ilan, turn on "Add components to the app" (for right-click search). It is also recommended to turn on "Run in the background on events" (הפעלה ברקע לפי אירוע), so the search does not switch you to the plugin tab.',
    'חיפוש טקסט מתוך ספר פתוח': 'Searching text from an open book',
    'בזמן הקריאה בר אילן עובד לבד: אל תלחצו בו ואל תסגרו אותו. אפשר להמשיך לעבוד באוצריא.': 'While it reads, Bar-Ilan works on its own: do not click in it or close it. You can keep working in Otzaria.',
    'אחרי התקנת מהדורה חדשה של בר אילן: הגדרות התוסף ← "קריאה מחדש".': 'After installing a new Bar-Ilan edition: plugin settings → "Read again".',
    'התוסף אינו מוצר רשמי של אוניברסיטת בר אילן ואינו קשור אליה. כל הזכויות על התוכנה ועל התוכן שבה שמורות לבעליהן.': 'The plugin is not an official product of Bar-Ilan University and is not affiliated with it. All rights to the software and its content belong to their owners.',
    'מה שחסר מוסבר בלשונית עצמה, צעד אחר צעד. אפשר לחזור למסך הזה מ"עזרה ותמיכה" (סימן השאלה) ← "אודות ודיווח" ← "מסך הפתיחה".': 'Whatever is missing is explained step by step in the tab itself. You can return to this screen from "Help and support" (the question mark) → "About and report" → "Welcome screen".',
    'ייתכן שחלון בבר אילן ממתין לתשובה — עוברים לבר אילן וסוגרים אותו. אם זה חוזר בספר מסוים, קוראים את רשימת הספרים מחדש: הגדרות התוסף ← "קריאה מחדש".': 'A window in Bar-Ilan may be waiting for an answer: switch to Bar-Ilan and close it. If it keeps happening with one book, read the list again: plugin settings → "Read again".',
    'Windows לפעמים משאיר את חלון בר אילן מאחור, והוא מהבהב בשורת המשימות. לוחצים עליו בשורת המשימות.': 'Windows sometimes keeps the Bar-Ilan window behind, and it flashes in the taskbar. Click it in the taskbar.',
    'צריך לסמן טקסט לפני הלחיצה הימנית, והמתג בהגדרות התוסף צריך להיות דלוק. אם המתג לא זמין: הגדרות אוצריא ← כלים ← בר אילן ← הדליקו את ההרשאות "הוספת רכיבים לתוכנה" ו"פריטים בתפריט הטקסט".': 'Select text before right-clicking, and make sure the switch in the plugin settings is on. If the switch is unavailable: Otzaria settings → Tools (כלים) → Bar-Ilan (בר אילן) → turn on the "Add components to the app" (הוספת רכיבים לתוכנה) and "Items in the text menu" (פריטים בתפריט הטקסט) permissions.',
    'כתוב שבבר אילן פתוחים חלונות רבים מדי': 'It says too many windows are open in Bar-Ilan',
    '"העתקת הפרטים" מעתיקה גם את יומן הפעולות, כדי לצרף אותו לפנייה.': '"Copy details" also copies the activity log, so you can attach it to a support request.',
    'השירות הפסיק לענות בזמן קריאת הרשימה. אפשר לנסות שוב.': 'The service stopped answering while reading the list. Please try again.',
    'בזמן הזה בר אילן ייפתח ויעבוד לבד. אל תלחצו בו ואל תסגרו אותו עד הסיום; אפשר להמשיך לעבוד באוצריא.': 'Meanwhile Bar-Ilan opens and works on its own. Do not click in it or close it until it finishes; you can keep working in Otzaria.',
    'בר אילן פתוח ועובד כרגע לבד. אל תלחצו בו ואל תסגרו אותו. אפשר להמשיך לעבוד באוצריא, וגם לסגור את הלשונית הזו: הקריאה תמשיך.': 'Bar-Ilan is open and working on its own. Do not click in it or close it. You can keep working in Otzaria, and even close this tab: the reading continues.',
  };
})(typeof self !== 'undefined' ? self : globalThis);
