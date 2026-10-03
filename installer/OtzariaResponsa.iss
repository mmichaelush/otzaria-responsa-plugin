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
#ifndef PluginId
  #define PluginId "com.otzaria-responsa"
#endif
#define RunValue "OtzariaResponsa"
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
UninstallDisplayIcon={app}\bin\{#HelperExe}
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

[CustomMessages]
he.InstallPlugin=להתקין את התוסף באוצריא (מומלץ)
he.UpdatePlugin=לעדכן את התוסף באוצריא לגרסה %1 (מומלץ)
; מסך הסיום לפי מצב התוסף באוצריא (CurPageChanged). אוצריא מציעה את שתי
; ההרשאות כבויות, ובלעדיהן אין תפריט, קיצורים ועבודה ברקע.
he.FinishInstall=ההתקנה הסתיימה.%n%nעם הסימון שלמטה אוצריא תיפתח ותציע להתקין את התוסף. בחלון ההתקנה של אוצריא הדליקו את "הוספת רכיבים לתוכנה", ולחצו "התקן".%n%nהתוסף נמצא בכלים ← תוספים ← "בר אילן". בפעם הראשונה הוא יקרא את רשימת הספרים מבר אילן; זה לוקח כחמש דקות, פעם אחת.
he.FinishUpdate=ההתקנה הסתיימה.%n%nעם הסימון שלמטה אוצריא תיפתח ותציע לעדכן את התוסף. ההרשאות שכבר הדלקתם נשמרות; אם עוד לא הדלקתם את "הוספת רכיבים לתוכנה": הגדרות אוצריא ← כלים ← "בר אילן".
he.FinishCurrent=ההתקנה הסתיימה. התוסף באוצריא כבר מותקן ומעודכן (גרסה %1).%n%nהתוסף נמצא בכלים ← תוספים ← "בר אילן". אם עוד לא עשיתם זאת: הגדרות אוצריא ← כלים ← "בר אילן", והדליקו את "הוספת רכיבים לתוכנה".
he.OtzariaNotFound=לא נמצאה אוצריא במחשב, ולכן התוסף לא הותקן בה.%n%nאחרי שתתקינו את אוצריא, פתחו את הקובץ הזה כדי להתקין את התוסף:%n%1

[Files]
Source: "staging\bin\{#HelperExe}"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "staging\lib\sqlite3.dll"; DestDir: "{app}\lib"; Flags: ignoreversion
Source: "staging\{#PluginFile}"; DestDir: "{app}"; Flags: ignoreversion

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
Filename: "{sys}\taskkill.exe"; Parameters: "/F /FI ""USERNAME eq {username}"" /IM {#HelperExe}"; Flags: runhidden; RunOnceId: "StopHelper"

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
  Root := ExpandConstant('{userappdata}\otzaria\plugins\installed\{#PluginId}\');
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

function PluginNeeded(): Boolean;
begin
  CheckPlugin();
  Result := not PluginCurrent;
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
  else if PluginFound then
    Text := FmtMessage(CustomMessage('FinishUpdate'), [''])
  else
    Text := FmtMessage(CustomMessage('FinishInstall'), ['']);
  OldHeight := WizardForm.FinishedLabel.Height;
  WizardForm.FinishedLabel.Caption := Text + #13#10#13#10 + SetupMessage(msgClickFinish);
  WizardForm.AdjustLabelHeight(WizardForm.FinishedLabel);
  WizardForm.RunList.Top := WizardForm.RunList.Top + WizardForm.FinishedLabel.Height - OldHeight;
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
