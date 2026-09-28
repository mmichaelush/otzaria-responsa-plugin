"""מסמן קובץ הרצה של Windows כתוכנת GUI (IMAGE_SUBSYSTEM_WINDOWS_GUI).

`dart build cli` מפיק תוכנת קונסול, ו-Windows פותח לה חלון שחור בכל הפעלה,
גם בכניסה למערכת. השירות אינו צריך קונסול: היומן שלו נכתב לקובץ.

    py tools/set_gui_subsystem.py <path/to/responsa_helper.exe>
"""
import struct
import sys

IMAGE_SUBSYSTEM_WINDOWS_GUI = 2
IMAGE_SUBSYSTEM_WINDOWS_CUI = 3


def main(path: str) -> None:
    with open(path, 'r+b') as exe:
        header = exe.read(0x40)
        if header[:2] != b'MZ':
            sys.exit(f'{path}: לא קובץ PE')
        pe_offset = struct.unpack_from('<I', header, 0x3C)[0]
        exe.seek(pe_offset)
        if exe.read(4) != b'PE\0\0':
            sys.exit(f'{path}: חתימת PE חסרה')
        # שדה Subsystem: ‏0x5C בתוך ה-optional header, זהה ב-PE32 וב-PE32+.
        subsystem_at = pe_offset + 4 + 20 + 0x44
        exe.seek(subsystem_at)
        current = struct.unpack('<H', exe.read(2))[0]
        if current == IMAGE_SUBSYSTEM_WINDOWS_GUI:
            print(f'{path}: כבר GUI')
            return
        if current != IMAGE_SUBSYSTEM_WINDOWS_CUI:
            sys.exit(f'{path}: subsystem לא צפוי ({current})')
        exe.seek(subsystem_at)
        exe.write(struct.pack('<H', IMAGE_SUBSYSTEM_WINDOWS_GUI))
        print(f'{path}: CUI -> GUI')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
