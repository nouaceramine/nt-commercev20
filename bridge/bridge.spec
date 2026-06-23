# -*- mode: python ; coding: utf-8 -*-
# ============================================================
#  NT Commerce Bridge — PyInstaller spec
#  Produces:  dist/NT_Commerce_Bridge/NT_Commerce_Bridge.exe
#
#  Build (Windows, inside bridge/ directory):
#      pip install pyinstaller pystray Pillow pyserial requests
#      pyinstaller bridge.spec
# ============================================================

import sys
from pathlib import Path

block_cipher = None

# Hidden imports required at runtime
HIDDEN = [
    # networking
    "requests",
    "urllib3",
    "certifi",
    "charset_normalizer",
    "idna",
    # serial port
    "serial",
    "serial.tools",
    "serial.tools.list_ports",
    # GUI / tray
    "tkinter",
    "tkinter.ttk",
    "tkinter.font",
    "tkinter.messagebox",
    "PIL",
    "PIL.Image",
    "PIL.ImageDraw",
    "pystray",
    "pystray._win32",       # Windows tray backend
    # stdlib extras sometimes missed by the analyser
    "logging.handlers",
    "json",
    "threading",
    "pathlib",
]

a = Analysis(
    ["bridge_tray.py"],
    pathex=["."],
    binaries=[],
    datas=[
        # Ship the template config so users can inspect/edit it
        ("config.json", "."),
        # Include bridge loop and modem driver
        ("bridge.py",        "."),
        ("modem.py",         "."),
        ("setup_wizard.py",  "."),
    ],
    hiddenimports=HIDDEN,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["matplotlib", "numpy", "pandas", "scipy", "PyQt5", "PyQt6"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="NT_Commerce_Bridge",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,            # compress — set to False if UPX is not installed
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,       # no black terminal window — tray-only UI
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon="nt_commerce.ico",   # uncomment and add a .ico file to use a custom icon
)
