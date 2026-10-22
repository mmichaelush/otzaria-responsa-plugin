; מתקין אחד לשירות בר אילן ולתוסף. נבנה ב-installer/build.ps1, שמכין את
; installer/staging (השירות כתוכנת GUI, sqlite3.dll וקובץ התוסף).
;
; התקנה למשתמש בלבד, בלי הרשאות מנהל. השירות **אינו** שירות Windows: שירות
; רץ ב-Session 0 ולא רואה את חלונות בר אילן, ולכן הוא מופעל בכניסה למשתמש.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "שירות בר אילן לאוצריא"
#define HelperExe "responsa_helper.exe"
#define PluginFile "OtzariaResponsa.otzplugin"
; ה-id שבמניפסט: שם התיקייה שאוצריא מתקינה אליה את התוסף. build.ps1 מעביר אותו.
; minAppVersion של התוסף: אוצריא ישנה ממנה מסרבת להתקין אותו (OtzariaTooOld).
#ifndef MinAppVersion
  #define MinAppVersion "0.0.0"
#endif
#ifndef PluginId
  #define PluginId "com.otzaria-responsa"
#endif
#define RunValue "OtzariaResponsa"
; הנתונים של השירות (helper_paths.dart): הקטלוג, היומן, build-skip.json ועוד.
#define DataDir "{localappdata}\OtzariaResponsa"
; התיקייה שאוצריא מתקינה אליה תוספים. בבדיקות מעבירים תיקייה מדומה.
#ifndef PluginsRoot
  #define PluginsRoot "{userappdata}\otzaria\plugins\installed"
#endif
; מזהה ההתקנה של אוצריא עצמה (ממתקין ה-Inno שלה).
#define OtzariaUninstallKey "Software\Microsoft\Windows\CurrentVersion\Uninstall\{EEC4F712-CD05-4D15-A753-509E840A51A5}_is1"

[Setup]
AppId={{8C1E4D2A-5B7F-4E3A-9C61-2F0B7A9D4E15}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppName}
AppPublisher=מיכאלוש
AppPublisherURL=https://github.com/mmichaelush/otzaria-responsa-plugin
AppSupportURL=https://github.com/mmichaelush/otzaria-responsa-plugin/blob/main/docs/USER_GUIDE.md
DefaultDirName={userpf}\OtzariaResponsa
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
; דף הפתיחה מסביר מה מותקן; ב-Inno 6 הוא כבוי כברירת מחדל.
DisableWelcomePage=no
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=output
OutputBaseFilename=OtzariaResponsa-Setup-{#AppVersion}
SetupIconFile=icon.ico
; השירות נבנה בלי אייקון; ב"אפליקציות מותקנות" מוצג אייקון התוסף.
UninstallDisplayIcon={app}\icon.ico
UninstallDisplayName={#AppName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; השירות נסגר ב-PrepareToInstall; מנהל ההפעלה מחדש של Windows אינו נדרש.
CloseApplications=no
RestartApplications=no

[Languages]
Name: "he"; MessagesFile: "compiler:Languages\Hebrew.isl"

[Messages]
he.WelcomeLabel2=ההתקנה מחברת את אוצריא לתוכנת פרויקט השו"ת של בר אילן שמותקנת במחשב, כדי לחפש בה ספרים ולפתוח אותם. התוסף מיועד למי שרכש כדין רישיון לבר אילן.%n%nמותקן רכיב קטן שרץ ברקע ומדבר עם בר אילן, ובסוף תוצע התקנת התוסף באוצריא. לא נדרשות הרשאות מנהל, ותוכן הספרים אינו מועתק ואינו יוצא מהמחשב.
he.FinishedLabelNoIcons=ההתקנה הסתיימה.%n%nאחרי שהתוסף יותקן באוצריא, הוא יימצא בכלים ← תוספים ← "בר אילן". בפעם הראשונה הוא יקרא את רשימת הספרים מבר אילן; זה לוקח כחמש דקות, פעם אחת.
he.ConfirmUninstall=להסיר את %1 מהמחשב?
he.UninstalledAll=ההסרה של %1 הסתיימה.

[CustomMessages]
he.OtherUser=ההתקנה רצה כמשתמש אחר מזה שמחובר עכשיו בשולחן העבודה (כנראה בלחיצה על "הפעל כמנהל" מחשבון רגיל, ואז Windows מבקשת סיסמה של מנהל).%n%nהשירות יותקן ויופעל רק עבור המשתמש שהמתקין רץ בשמו, ולא יעבוד אצל המשתמש המחובר: בהתחלה הוא נראה פועל, ואחרי התנתקות או הפעלה מחדש הוא נעלם.%n%nמומלץ לסגור את ההתקנה ולהפעיל אותה שוב בלחיצה כפולה רגילה, בלי "הפעל כמנהל" ובלי "הפעל כמשתמש אחר". לא נדרשות הרשאות מנהל.%n%nלהמשיך בכל זאת?
he.InstallPlugin=להתקין את התוסף באוצריא (מומלץ)
he.UpdatePlugin=לעדכן את התוסף באוצריא לגרסה %1 (מומלץ)
; מסך הסיום לפי מצב התוסף באוצריא (CurPageChanged). אוצריא מציעה את שתי
; ההרשאות כבויות, ובלעדיהן אין תפריט, קיצורים ועבודה ברקע.
he.FinishInstall=ההתקנה הסתיימה.%n%nעם הסימון שלמטה אוצריא תיפתח ותציע להתקין את התוסף. בחלון ההתקנה של אוצריא הדליקו את "הוספת רכיבים לתוכנה", ולחצו "התקן".%n%nהתוסף נמצא בכלים ← תוספים ← "בר אילן". בפעם הראשונה הוא יקרא את רשימת הספרים מבר אילן; זה לוקח כחמש דקות, פעם אחת.
he.FinishUpdate=ההתקנה הסתיימה.%n%nעם הסימון שלמטה אוצריא תיפתח ותציע לעדכן את התוסף. ההרשאות שכבר הדלקתם נשמרות; אם עוד לא הדלקתם את "הוספת רכיבים לתוכנה": הגדרות אוצריא ← כלים ← "בר אילן".
he.FinishCurrent=ההתקנה הסתיימה. התוסף באוצריא כבר מותקן ומעודכן (גרסה %1).%n%nהתוסף נמצא בכלים ← תוספים ← "בר אילן". אם עוד לא עשיתם זאת: הגדרות אוצריא ← כלים ← "בר אילן", והדליקו את "הוספת רכיבים לתוכנה".
he.OtzariaTooOld=ההתקנה הסתיימה, והשירות פועל.%n%nגרסה %1 של התוסף דורשת אוצריא %2 ומעלה, והאוצריא שבמחשב ישנה ממנה. תוסף שכבר מותקן באוצריא ממשיך לעבוד עם השירות.%n%nאחרי שאוצריא תתעדכן, התקינו את התוסף מחנות התוספים של אוצריא, או מהקובץ הזה:%n%3
he.OtzariaNotFound=לא נמצאה אוצריא במחשב, ולכן התוסף לא הותקן בה.%n%nאחרי שתתקינו את אוצריא, פתחו את הקובץ הזה כדי להתקין את התוסף:%n%1
; ההסרה: שלוש אפשרויות (ChooseUninstallMode), ובסוף סיכום של מה הוסר ומה נשאר.
he.ModeIntro=מה להסיר?
he.ModeUpdate=הסרה לצורך עדכון או התקנה מחדש
he.ModeUpdateNote=מסיר רק את השירות. רשימת הספרים נשמרת, ואין צורך לקרוא אותה שוב אחרי ההתקנה.
he.ModeRegular=הסרה רגילה (מומלץ)
he.ModeRegularNote=מסיר גם את רשימת הספרים ואת קובצי היומן. התוסף וההגדרות שלו נשארים באוצריא.
he.ModeFull=הסרה מלאה
he.ModeFullNote=מסיר הכול, כולל את התוסף מאוצריא ואת ההגדרות שלו.
he.ModeButton=הסרה
he.PluginCloseOtzaria=כדי להסיר את התוסף, אוצריא צריכה להיות סגורה: היא שומרת את רשימת התוספים בזמן שהיא פתוחה.%n%nסגרו את אוצריא (את כל החלונות שלה) ולחצו "אישור".%n%n"ביטול" ממשיך בהסרה ומשאיר את התוסף באוצריא.
he.PluginRemoveSteps=אוצריא נפתחת עכשיו בהגדרות ← כלים. התוסף מוסר באוצריא עצמה, כדי שלא יישארו בה רישומים שלו.%n%n1. ברשימת התוספים סמנו את "בר אילן".%n2. לחצו "מחק" ואשרו.%n3. חזרו לחלון הזה ולחצו "אישור".%n%n"ביטול" ממשיך בהסרה ומשאיר את התוסף באוצריא.
he.PluginStillInstalled=התוסף עדיין מותקן באוצריא.%n%nבהגדרות ← כלים סמנו את "בר אילן", לחצו "מחק" ואשרו, ואז לחצו כאן "אישור".%n%n"ביטול" ממשיך בהסרה ומשאיר את התוסף באוצריא.
he.DoneRemoved=הוסרו:
he.DoneKept=נשארו:
he.DoneService=השירות שרץ ברקע, וההפעלה שלו בכניסה ל-Windows.
he.DoneData=רשימת הספרים, קובצי היומן ושאר הנתונים של השירות.
he.DonePlugin=התוסף באוצריא וההגדרות שלו.
he.KeptData=רשימת הספרים, לשימוש בהתקנה הבאה (%1).
he.KeptPlugin=התוסף באוצריא. בלי השירות הוא יציג "צריך להתקין רכיב קטן". כדי להסיר אותו: הגדרות אוצריא ← כלים, סמנו את "בר אילן" ולחצו "מחק".
he.DataLeft=חלק מהקבצים לא נמחקו, כנראה כי תוכנה אחרת פותחת אותם. אפשר למחוק את התיקייה ידנית: %1

[Files]
Source: "staging\bin\{#HelperExe}"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "staging\lib\sqlite3.dll"; DestDir: "{app}\lib"; Flags: ignoreversion
Source: "staging\{#PluginFile}"; DestDir: "{app}"; Flags: ignoreversion
Source: "icon.ico"; DestDir: "{app}"; Flags: ignoreversion
; לבדיקה לפני ההתקנה (OtherUserWarning): איזה משתמש רץ, ואיזה בשולחן העבודה.
Source: "staging\bin\{#HelperExe}"; DestDir: "{tmp}"; Flags: dontcopy

[Registry]
; הפעלה בכל כניסה למשתמש. המרכאות נדרשות בגלל רווחים אפשריים בנתיב.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "{#RunValue}"; ValueData: """{app}\bin\{#HelperExe}"""; Flags: uninsdeletevalue

[Run]
; מפעילים את השירות מיד, כדי שלא יהיה צורך להתנתק ולהתחבר. מתקין שהורץ כמנהל
; היה מעביר את ההרשאה לשירות, ומשם לבר אילן שהשירות מפעיל; דרך explorer
; התהליך עולה בהרשאות הרגילות של המשתמש, כמו בכניסה ל-Windows.
Filename: "{app}\bin\{#HelperExe}"; Flags: nowait; Check: not IsAdmin
Filename: "{win}\explorer.exe"; Parameters: """{app}\bin\{#HelperExe}"""; Flags: nowait; Check: IsAdmin
; הקובץ פותח את חלון ההתקנה של אוצריא. כשהגרסה הזו כבר מותקנת אין בו צורך.
Filename: "{code:OtzariaExe}"; Parameters: """{app}\{#PluginFile}"""; Description: "{code:PluginRunLabel}"; Flags: postinstall nowait skipifsilent; Check: OtzariaFound and PluginNeeded and not IsAdmin
Filename: "{win}\explorer.exe"; Parameters: """{app}\{#PluginFile}"""; Description: "{code:PluginRunLabel}"; Flags: postinstall nowait skipifsilent; Check: OtzariaFound and PluginNeeded and IsAdmin

[UninstallRun]
; רק של המשתמש הזה: מתקין שרץ כמנהל היה סוגר גם שירות של משתמש אחר.
; StopHelper (usUninstall) כבר סגר אותו וחיכה שהקבצים ישתחררו; זו רשת ביטחון.
Filename: "{sys}\taskkill.exe"; Parameters: "/F /FI ""USERNAME eq {username}"" /IM {#HelperExe}"; Flags: runhidden; RunOnceId: "StopHelper"

[UninstallDelete]
; גם מה שלא הותקן מכאן (עותקי גיבוי, קבצים שנוספו ידנית). התיקייה קבועה
; (DisableDirPage), ולכן אין סכנה למחוק תיקייה שבחר המשתמש.
Type: filesandordirs; Name: "{app}"

[Code]
var
  OtzariaPath: String;
  PluginChecked, PluginFound, PluginCurrent: Boolean;

{ הנתיב שבפקודה, עם או בלי מרכאות: `"C:\...\otzaria.exe" "%1"`. בלי מרכאות
  חותכים אחרי `.exe` ולא ברווח הראשון, כי `C:\Program Files` מכיל רווח. }
function FirstToken(Command: String): String;
var
  Close: Integer;
begin
  Command := Trim(Command);
  if (Length(Command) > 0) and (Command[1] = '"') then
  begin
    Delete(Command, 1, 1);
    Close := Pos('"', Command);
    if Close > 0 then Result := Copy(Command, 1, Close - 1) else Result := Command;
  end
  else
  begin
    Close := Pos('.exe', Lowercase(Command));
    if Close > 0 then Result := Copy(Command, 1, Close + 3) else Result := Command;
  end;
end;

function TryCandidate(Candidate: String): Boolean;
begin
  Result := (Candidate <> '') and FileExists(Candidate);
  if Result then OtzariaPath := Candidate;
end;

function TryInstallLocation(Root: Integer): Boolean;
var
  Location: String;
begin
  Result := RegQueryStringValue(Root, '{#OtzariaUninstallKey}', 'InstallLocation', Location)
    and TryCandidate(AddBackslash(Location) + 'otzaria.exe');
end;

function TryProtocol(Root: Integer): Boolean;
var
  Command: String;
begin
  Result := RegQueryStringValue(Root, 'Software\Classes\otzaria\shell\open\command', '', Command)
    and TryCandidate(FirstToken(Command));
end;

{ קודם ההתקנה הרשומה של אוצריא ומיקומי ברירת המחדל, ורק אחר כך מטפל
  הפרוטוקול: אצל מפתחים הוא מצביע לפעמים על בנייה מקומית ולא על אוצריא המותקנת. }
function FindOtzaria(): Boolean;
begin
  Result := (OtzariaPath <> '')
    or TryInstallLocation(HKLM64)
    or TryInstallLocation(HKCU)
    or TryInstallLocation(HKLM32)
    or TryCandidate(ExpandConstant('{commonpf64}\Otzaria\otzaria.exe'))
    or TryCandidate(ExpandConstant('{commonpf32}\Otzaria\otzaria.exe'))
    or TryCandidate(ExpandConstant('{localappdata}\Programs\Otzaria\otzaria.exe'))
    or TryProtocol(HKLM64)
    or TryProtocol(HKCU);
end;

function OtzariaFound(): Boolean;
begin
  Result := FindOtzaria();
end;

function OtzariaExe(Param: String): String;
begin
  FindOtzaria();
  Result := OtzariaPath;
end;

{ הערך של "version" במניפסט, בסריקת מחרוזת. המופע הראשון הוא של המניפסט
  עצמו: "minAppVersion" אינו תואם, כי המרכאות הן חלק מהחיפוש. }
function ManifestVersion(FileName: String): String;
var
  Raw: AnsiString;
  Text: String;
  At: Integer;
begin
  Result := '';
  if not LoadStringFromFile(FileName, Raw) then Exit;
  Text := String(Raw);
  At := Pos('"version"', Text);
  if At = 0 then Exit;
  Delete(Text, 1, At + Length('"version"') - 1);
  At := Pos(':', Text);
  if At = 0 then Exit;
  Delete(Text, 1, At);
  Text := TrimLeft(Text);
  if (Length(Text) = 0) or (Text[1] <> '"') then Exit;
  Delete(Text, 1, 1);
  At := Pos('"', Text);
  if At > 0 then Result := Copy(Text, 1, At - 1);
end;

function PluginRoot(): String;
begin
  Result := ExpandConstant('{#PluginsRoot}\{#PluginId}\');
end;

{ אוצריא שומרת כל גרסה בתיקייה משלה (`.release-<hash>`, ובגרסאות ישנות
  `current`) ולא מסמנת איזו פעילה; לכן מעודכן אם אחת מהן בגרסה הזו. אחרי
  הסרה נשארת תיקייה ריקה, והיא "לא מותקן". }
procedure CheckPlugin();
var
  Root, Version: String;
  Rec: TFindRec;
begin
  if PluginChecked then Exit;
  PluginChecked := True;
  Root := PluginRoot();
  if not FindFirst(Root + '*', Rec) then Exit;
  try
    repeat
      if ((Rec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0)
        and (Rec.Name <> '.') and (Rec.Name <> '..') then
      begin
        Version := ManifestVersion(Root + Rec.Name + '\manifest.json');
        if Version <> '' then PluginFound := True;
        if Version = '{#AppVersion}' then PluginCurrent := True;
      end;
    until not FindNext(Rec);
  finally
    FindClose(Rec);
  end;
end;

{ "0.9.98" -> 0, 9, 98: חלק אחד בכל קריאה, מהתחלת המחרוזת. }
function TakeVersionPart(var Text: String): Integer;
var
  At: Integer;
begin
  At := Pos('.', Text);
  if At = 0 then
  begin
    Result := StrToIntDef(Text, 0);
    Text := '';
  end
  else
  begin
    Result := StrToIntDef(Copy(Text, 1, At - 1), 0);
    Delete(Text, 1, At);
  end;
end;

{ אוצריא ישנה מ-minAppVersion: התקנת התוסף הייתה נגמרת בשגיאה של אוצריא.
  רק major.minor.patch: החלק הרביעי של גרסת הקובץ הוא מספר בנייה שנחתך
  ל-16 סיביות. גרסה שאינה נקראת (בנייה מקומית) אינה "ישנה". }
function OtzariaTooOld(): Boolean;
var
  MS, LS: Cardinal;
  Need: String;
  Have, Wanted: Int64;
begin
  Result := False;
  if not FindOtzaria() or not GetVersionNumbers(OtzariaPath, MS, LS) then Exit;
  Have := ((Int64(MS shr 16) * 65536) + (MS and $FFFF)) * 65536 + (LS shr 16);
  Need := '{#MinAppVersion}';
  Wanted := TakeVersionPart(Need) * 65536;
  Wanted := (Wanted + TakeVersionPart(Need)) * 65536;
  Wanted := Wanted + TakeVersionPart(Need);
  Result := Have < Wanted;
end;

function PluginNeeded(): Boolean;
begin
  CheckPlugin();
  Result := not PluginCurrent and not OtzariaTooOld();
end;

function PluginRunLabel(Param: String): String;
begin
  CheckPlugin();
  if PluginFound then
    Result := FmtMessage(CustomMessage('UpdatePlugin'), ['{#AppVersion}'])
  else
    Result := CustomMessage('InstallPlugin');
end;

{ בלי אוצריא נשאר הטקסט הכללי, וההודעה ב-ssDone מסבירה. תיבות הסימון כבר
  ממוקמות מתחת לטקסט, ולכן מזיזים אותן בהפרש הגובה. }
procedure CurPageChanged(CurPageID: Integer);
var
  Text: String;
  OldHeight: Integer;
begin
  if (CurPageID <> wpFinished) or not FindOtzaria() then Exit;
  CheckPlugin();
  if PluginCurrent then
    Text := FmtMessage(CustomMessage('FinishCurrent'), ['{#AppVersion}'])
  else if OtzariaTooOld() then
    Text := FmtMessage(CustomMessage('OtzariaTooOld'), ['{#AppVersion}', '{#MinAppVersion}', ExpandConstant('{app}\{#PluginFile}')])
  else if PluginFound then
    Text := FmtMessage(CustomMessage('FinishUpdate'), [''])
  else
    Text := FmtMessage(CustomMessage('FinishInstall'), ['']);
  OldHeight := WizardForm.FinishedLabel.Height;
  WizardForm.FinishedLabel.Caption := Text + #13#10#13#10 + SetupMessage(msgClickFinish);
  WizardForm.AdjustLabelHeight(WizardForm.FinishedLabel);
  WizardForm.RunList.Top := WizardForm.RunList.Top + WizardForm.FinishedLabel.Height - OldHeight;
end;

{ מתקין שהורץ כמנהל מחשבון רגיל רץ כחשבון המנהל, ומתקין את השירות אצלו.
  השירות עצמו משווה את המשתמש שלו לבעלים של שולחן העבודה (--check-install-user,
  קוד 20 = משתמש אחר); כשאי אפשר לדעת, ממשיכים. }
function NextButtonClick(CurPageID: Integer): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;
  if (CurPageID <> wpWelcome) or WizardSilent() then Exit;
  try
    ExtractTemporaryFile('{#HelperExe}');
    if Exec(ExpandConstant('{tmp}\{#HelperExe}'), '--check-install-user', '', SW_HIDE,
      ewWaitUntilTerminated, ResultCode) and (ResultCode = 20) then
      Result := MsgBox(CustomMessage('OtherUser'), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  except
    { בדיקה שנכשלה אינה סיבה לעצור התקנה. }
  end;
end;

{ עדכון: השירות הקודם מחזיק את קובץ ההרצה ואת הפורט. }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'),
    ExpandConstant('/F /FI "USERNAME eq {username}" /IM {#HelperExe}'), '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  { TerminateProcess אסינכרוני: ממתינים שהקובץ ישתחרר לפני שדורסים אותו. }
  Sleep(700);
  Result := '';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and not WizardSilent() and not FindOtzaria() then
  begin
    { שורה שמתחילה ב-[ נקראת כתגית סעיף, גם בתוך [Code]. }
    MsgBox(FmtMessage(CustomMessage('OtzariaNotFound'), [ExpandConstant('{app}\{#PluginFile}')]),
      mbInformation, MB_OK);
  end;
end;

{ ---------------------------------------------------------------- הסרה
  1 (עדכון): השירות בלבד. 2 (רגילה): גם תיקיית הנתונים. 3 (מלאה): גם התוסף
  באוצריא. בכל אחת תיקיית ההתקנה נמחקת כולה ([UninstallDelete]), וערך ההפעלה
  ב-Run מוסר (uninsdeletevalue). }

const
  ModeUpdate = 1;
  ModeRegular = 2;
  ModeFull = 3;

var
  UninstallMode: Integer;
  PluginRemoved, PluginKept, DataRemoved, DataLeft: Boolean;

{ /MODE=update|regular|full (או 1, 2, 3), להרצה מסקריפט. 0: לא צוין או לא מוכר. }
function ModeFromCommandLine(): Integer;
var
  I: Integer;
  Value: String;
begin
  Result := 0;
  for I := 1 to ParamCount do
  begin
    Value := Lowercase(ParamStr(I));
    if Pos('/mode=', Value) <> 1 then Continue;
    Delete(Value, 1, Length('/mode='));
    if (Value = 'update') or (Value = '1') then Result := ModeUpdate
    else if (Value = 'regular') or (Value = '2') then Result := ModeRegular
    else if (Value = 'full') or (Value = '3') then Result := ModeFull;
  end;
end;

{ אפשרות אחת: כפתור בחירה ושורת הסבר מתחתיו. Top עובר לאפשרות הבאה. }
function AddModeOption(Form: TSetupForm; var Top: Integer; Caption, Note: String): TNewRadioButton;
var
  Text: TNewStaticText;
begin
  Result := TNewRadioButton.Create(Form);
  Result.Parent := Form;
  Result.Left := ScaleX(16);
  Result.Top := Top;
  Result.Width := Form.ClientWidth - ScaleX(32);
  Result.Height := ScaleY(20);
  Result.Caption := Caption;
  Result.Font.Style := [fsBold];

  Text := TNewStaticText.Create(Form);
  Text.Parent := Form;
  Text.Left := ScaleX(34);
  Text.Top := Top + ScaleY(22);
  Text.Width := Form.ClientWidth - ScaleX(50);
  Text.WordWrap := True;
  Text.AutoSize := True;
  Text.Caption := Note;
  Top := Text.Top + Text.Height + ScaleY(14);
end;

{ החלון שבתחילת ההסרה. מחזיר את האפשרות שנבחרה, או 0 לביטול. }
function ChooseUninstallMode(): Integer;
var
  Form: TSetupForm;
  Intro: TNewStaticText;
  UpdateOption, RegularOption, FullOption: TNewRadioButton;
  RemoveButton, CancelButton: TNewButton;
  Top, W: Integer;
begin
  Result := 0;
  Form := CreateCustomForm(ScaleX(460), ScaleY(300), True, True);
  try
    Form.Caption := FmtMessage(SetupMessage(msgUninstallAppFullTitle), ['{#AppName}']);

    Intro := TNewStaticText.Create(Form);
    Intro.Parent := Form;
    Intro.Left := ScaleX(16);
    Intro.Top := ScaleY(14);
    Intro.Font.Style := [fsBold];
    Intro.Caption := CustomMessage('ModeIntro');
    Top := Intro.Top + Intro.Height + ScaleY(14);

    UpdateOption := AddModeOption(Form, Top, CustomMessage('ModeUpdate'), CustomMessage('ModeUpdateNote'));
    RegularOption := AddModeOption(Form, Top, CustomMessage('ModeRegular'), CustomMessage('ModeRegularNote'));
    FullOption := AddModeOption(Form, Top, CustomMessage('ModeFull'), CustomMessage('ModeFullNote'));
    RegularOption.Checked := True;

    RemoveButton := TNewButton.Create(Form);
    RemoveButton.Parent := Form;
    RemoveButton.Caption := CustomMessage('ModeButton');
    RemoveButton.ModalResult := mrOk;
    RemoveButton.Default := True;

    CancelButton := TNewButton.Create(Form);
    CancelButton.Parent := Form;
    CancelButton.Caption := SetupMessage(msgButtonCancel);
    CancelButton.ModalResult := mrCancel;
    CancelButton.Cancel := True;

    W := Form.CalculateButtonWidth([RemoveButton.Caption, CancelButton.Caption]);
    RemoveButton.SetBounds(Form.ClientWidth - ScaleX(16 + 6) - 2 * W, Top, W, ScaleY(23));
    CancelButton.SetBounds(Form.ClientWidth - ScaleX(16) - W, Top, W, ScaleY(23));
    Form.ClientHeight := Top + ScaleY(23 + 14);

    Form.ActiveControl := RegularOption;
    Form.FlipAndCenterIfNeeded(False, nil, False);
    if Form.ShowModal() = mrOk then
    begin
      if UpdateOption.Checked then Result := ModeUpdate
      else if FullOption.Checked then Result := ModeFull
      else Result := ModeRegular;
    end;
  finally
    Form.Free();
  end;
end;

{ שקט בלי /MODE: עדכון. כך הסרה שקטה לקראת התקנה מחדש לעולם אינה מוחקת נתונים. }
function InitializeUninstall(): Boolean;
begin
  UninstallMode := ModeFromCommandLine();
  if UninstallMode = 0 then
  begin
    if UninstallSilent() then
      UninstallMode := ModeUpdate
    else
      UninstallMode := ChooseUninstallMode();
  end;
  Log(Format('Uninstall mode: %d', [UninstallMode]));
  Result := UninstallMode <> 0;
end;

{ תיקיות הגרסה של התוסף שיש בהן מניפסט: אלה שאוצריא עשויה לטעון. }
function PluginReleases(): TArrayOfString;
var
  Root: String;
  Rec: TFindRec;
  Count: Integer;
begin
  Count := 0;
  SetArrayLength(Result, 0);
  Root := PluginRoot();
  if not FindFirst(Root + '*', Rec) then Exit;
  try
    repeat
      if ((Rec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0)
        and (Rec.Name <> '.') and (Rec.Name <> '..')
        and (ManifestVersion(Root + Rec.Name + '\manifest.json') <> '') then
      begin
        SetArrayLength(Result, Count + 1);
        Result[Count] := Root + Rec.Name;
        Count := Count + 1;
      end;
    until not FindNext(Rec);
  finally
    FindClose(Rec);
  end;
end;

{ אוצריא מוחקת בהסרה קודם את הרישום ואחר כך את תיקיית הגרסה הרשומה, ולכן
  מניפסט שנעלם פירושו שהתוסף הוסר. מה שנשאר הוא שארית של גרסה קודמת, שאינה
  רשומה. המחיקה אסינכרונית, ולכן ממתינים מעט. }
function PluginGone(Before: TArrayOfString): Boolean;
var
  I, Attempt: Integer;
begin
  Result := False;
  for Attempt := 1 to 10 do
  begin
    for I := 0 to GetArrayLength(Before) - 1 do
      if not FileExists(Before[I] + '\manifest.json') then Result := True;
    if Result then Exit;
    Sleep(200);
  end;
end;

{ אחרי הסרה באוצריא נשארת תיקייה ריקה בשם ה-id. רק תיקיות ריקות: תיקייה עם
  קבצים אולי עדיין רשומה באוצריא. }
procedure RemoveEmptyDirs(Dir: String);
var
  Rec: TFindRec;
begin
  if FindFirst(AddBackslash(Dir) + '*', Rec) then
  try
    repeat
      if ((Rec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0)
        and (Rec.Name <> '.') and (Rec.Name <> '..') then
        RemoveEmptyDirs(AddBackslash(Dir) + Rec.Name);
    until not FindNext(Rec);
  finally
    FindClose(Rec);
  end;
  RemoveDir(Dir);
end;

{ מסך ההגדרות ← כלים, שבו מוחקים תוסף. דרך explorer כמו ב-[Run]: מהסרה
  שרצה כמנהל, אוצריא שנפתחת עכשיו הייתה רצה כמנהל. }
procedure OpenOtzariaTools();
var
  ResultCode: Integer;
begin
  if IsAdmin() then
    ShellExec('', ExpandConstant('{win}\explorer.exe'), 'otzaria://open/sdk', '',
      SW_SHOWNORMAL, ewNoWait, ResultCode)
  else
    ShellExec('', OtzariaPath, 'otzaria://open/sdk', '', SW_SHOWNORMAL, ewNoWait, ResultCode);
end;

{ פתיחת אוצריא ב"הגדרות ← כלים" והמתנה שהמשתמש ימחק שם. רק כשהשירות לא
  מצא איפה התוסף רשום (מסד במקום לא מוכר) או נכשל. }
procedure RemovePluginInOtzaria(Before: TArrayOfString);
begin
  PluginKept := True;
  if UninstallSilent() or not FindOtzaria() then
  begin
    Log('Plugin kept: silent uninstall or Otzaria not found.');
    Exit;
  end;
  OpenOtzariaTools();
  if MsgBox(CustomMessage('PluginRemoveSteps'), mbInformation, MB_OKCANCEL) <> IDOK then
  begin
    Log('Plugin kept: user skipped.');
    Exit;
  end;
  repeat
    if PluginGone(Before) then
    begin
      DelTree(RemoveBackslash(PluginRoot()), True, True, True);
      PluginRemoved := True;
      PluginKept := False;
      Log('Plugin removed in Otzaria.');
      Exit;
    end;
  { אישור/ביטול ולא "נסה שוב": את שמות הכפתורים האלה Inno מתרגמת, ואת "נסה שוב"
    Windows, בשפת המערכת, ואז הטקסט לא היה תואם לכפתור. }
  until MsgBox(CustomMessage('PluginStillInstalled'), mbError, MB_OKCANCEL) <> IDOK;
  Log('Plugin kept: still installed after the user gave up.');
end;

{ קודי היציאה של `--remove-otzaria-plugin` (PluginRemoval בשירות). }
const
  RemovalDone = 0;
  RemovalNotInstalled = 10;
  RemovalOtzariaRunning = 11;

{ לאוצריא אין פקודה חיצונית להסרת תוסף, ולכן השירות עושה מה ש"מחק" שבה
  עושה (OtzariaPluginRemover): מוחק את התוסף מ-plugins_host.db (הרישום,
  ההרשאות, הנתונים, רשימת הספרים לחיפוש הספרייה) ואת התיקיות שלו. רק
  כשאוצריא סגורה: היא מחזיקה את הרשימה בזיכרון וכותבת אותה שוב. גם אוצריא
  ניידת: השירות זוכר את ה-exe שפנו אליו. }
procedure RemovePlugin();
var
  Before: TArrayOfString;
  Helper, Params: String;
  Code: Integer;
begin
  Before := PluginReleases();
  Helper := ExpandConstant('{app}\bin\{#HelperExe}');
  if not FileExists(Helper) then
  begin
    Log('Plugin removal: the service executable is missing.');
    if GetArrayLength(Before) > 0 then RemovePluginInOtzaria(Before);
    Exit;
  end;
  Params := '--remove-otzaria-plugin={#PluginId}';
  if FindOtzaria() then Params := Params + ' "--otzaria=' + OtzariaPath + '"';
  repeat
    if not Exec(Helper, Params, '', SW_HIDE, ewWaitUntilTerminated, Code) then Code := -1;
    Log(Format('Plugin removal: exit code %d', [Code]));
    case Code of
      RemovalDone:
        begin
          RemoveEmptyDirs(RemoveBackslash(PluginRoot()));
          PluginRemoved := True;
          PluginKept := False;
          Exit;
        end;
      RemovalNotInstalled:
        begin
          RemoveEmptyDirs(RemoveBackslash(PluginRoot()));
          Log('Plugin is not installed in Otzaria.');
          Exit;
        end;
      RemovalOtzariaRunning:
        begin
          PluginKept := True;
          if UninstallSilent() then
          begin
            Log('Plugin kept: Otzaria is open (silent uninstall).');
            Exit;
          end;
        end;
    else
      begin
        RemovePluginInOtzaria(Before);
        Exit;
      end;
    end;
  until MsgBox(CustomMessage('PluginCloseOtzaria'), mbInformation, MB_OKCANCEL) <> IDOK;
  Log('Plugin kept: Otzaria stayed open.');
end;

{ TerminateProcess אסינכרוני: קובץ ההרצה, היומן והקטלוג נעולים עד שהתהליך
  באמת יוצא. מוחקים את קובץ ההרצה בעצמנו; כשזה מצליח, הכול שוחרר. }
procedure StopHelper();
var
  ResultCode, I: Integer;
  Exe: String;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'),
    ExpandConstant('/F /FI "USERNAME eq {username}" /IM {#HelperExe}'), '', SW_HIDE,
    ewWaitUntilTerminated, ResultCode);
  Exe := ExpandConstant('{app}\bin\{#HelperExe}');
  for I := 1 to 50 do
  begin
    if not FileExists(Exe) or DeleteFile(Exe) then Break;
    Sleep(100);
  end;
  Log(Format('Service stopped; executable removed: %d', [Ord(not FileExists(Exe))]));
end;

procedure RemoveData();
var
  Dir: String;
  I: Integer;
begin
  Dir := ExpandConstant('{#DataDir}');
  for I := 1 to 5 do
  begin
    if not DirExists(Dir) then Break;
    DelTree(Dir, True, True, True);
    if not DirExists(Dir) then Break;
    Sleep(300);
  end;
  DataLeft := DirExists(Dir);
  DataRemoved := not DataLeft;
  Log(Format('Data dir removed: %d', [Ord(DataRemoved)]));
end;

function Bullet(Text: String): String;
begin
  Result := #13#10 + #$2022 + ' ' + Text;
end;

procedure ShowSummary();
var
  Removed, Kept, Text, Dir: String;
  Releases: TArrayOfString;
begin
  Dir := ExpandConstant('{#DataDir}');
  Releases := PluginReleases();
  Removed := Bullet(CustomMessage('DoneService'));
  Kept := '';
  if DataRemoved then
    Removed := Removed + Bullet(CustomMessage('DoneData'))
  else if (UninstallMode = ModeUpdate) and DirExists(Dir) then
    Kept := Kept + Bullet(FmtMessage(CustomMessage('KeptData'), [Dir]));
  if PluginRemoved then
    Removed := Removed + Bullet(CustomMessage('DonePlugin'))
  else if PluginKept or (GetArrayLength(Releases) > 0) then
    Kept := Kept + Bullet(CustomMessage('KeptPlugin'));

  Text := CustomMessage('DoneRemoved') + Removed;
  if Kept <> '' then Text := Text + #13#10#13#10 + CustomMessage('DoneKept') + Kept;
  if DataLeft then Text := Text + #13#10#13#10 + FmtMessage(CustomMessage('DataLeft'), [Dir]);
  Log(Text);
  if not UninstallSilent() then MsgBox(Text, mbInformation, MB_OK);
end;

{ ההסרה רצה מעותק ב-%TEMP%\is-XXXX-uninstall.tmp, ו-Inno מוחקת אותו רק
  בהסרה הבאה של תוכנה כלשהי. התהליך לא יכול למחוק את עצמו, ולכן cmd מוחק את
  התיקייה אחרי שהוא יוצא (עד 30 שניות). רק תיקייה שנראית בדיוק כך. }
procedure ScheduleTempCleanup();
var
  Dir: String;
  ResultCode: Integer;
begin
  Dir := ExtractFileDir(ParamStr(0));
  if (CompareText(ExtractFileName(ParamStr(0)), '_unins.tmp') <> 0)
    or (Pos('is-', Lowercase(ExtractFileName(Dir))) <> 1)
    or (Pos('-uninstall.tmp', Lowercase(ExtractFileName(Dir))) = 0) then
  begin
    Log('Temp cleanup skipped: ' + ParamStr(0));
    Exit;
  end;
  Exec(ExpandConstant('{cmd}'),
    '/s /c "for /l %i in (1,1,30) do @if exist "' + Dir + '" (ping -n 2 127.0.0.1 >nul & rd /s /q "' + Dir + '" 2>nul)"',
    '', SW_HIDE, ewNoWait, ResultCode);
  Log('Temp cleanup scheduled: ' + Dir);
end;

procedure DeinitializeUninstall();
begin
  ScheduleTempCleanup();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  case CurUninstallStep of
    usUninstall:
      begin
        if UninstallMode = ModeFull then RemovePlugin();
        StopHelper();
      end;
    usPostUninstall:
      begin
        if UninstallMode >= ModeRegular then RemoveData();
        ShowSummary();
      end;
  end;
end;
