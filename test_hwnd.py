import os
import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32

def get_process_hwnd():
    my_pid = os.getpid()
    hwnds = []
    
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    
    def enum_windows_callback(hwnd, lparam):
        if not user32.IsWindowVisible(hwnd):
            # Also check if it's our window even if hidden
            pass
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == my_pid:
            # Check if it has WS_VISIBLE or is a top-level window
            length = user32.GetWindowTextLengthW(hwnd)
            title_buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, title_buf, length + 1)
            hwnds.append((hwnd, title_buf.value))
        return True

    cb = WNDENUMPROC(enum_windows_callback)
    user32.EnumWindows(cb, 0)
    return hwnds

print(f"Current PID: {os.getpid()}")
print("EnumWindows test function defined successfully.")
