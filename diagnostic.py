import os
import sys
import traceback

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug.log")

def log(msg):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"[{os.getpid()}] {msg}\n")

log("Starting app...")

try:
    import json
    import time
    import threading
    import winreg
    import ctypes
    from ctypes import wintypes
    from PIL import Image, ImageDraw
    import webview
    import pystray
    log("Imports succeeded!")
except Exception as e:
    log(f"Import failed: {traceback.format_exc()}")

log(f"Python exe: {sys.executable}")
