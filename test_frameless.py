import os
import sys
import ctypes
from ctypes import wintypes
import time
import webview

user32 = ctypes.windll.user32
dwmapi = ctypes.windll.dwmapi

GWL_STYLE = -16
GWL_EXSTYLE = -20

WS_CAPTION = 0x00C00000
WS_THICKFRAME = 0x00040000
WS_MINIMIZEBOX = 0x00020000
WS_MAXIMIZEBOX = 0x00010000
WS_SYSMENU = 0x00080000
WS_POPUP = 0x80000000

WS_EX_TOPMOST = 0x00000008
WS_EX_TOOLWINDOW = 0x00000080

SWP_FRAMECHANGED = 0x0020
SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
SWP_NOZORDER = 0x0004
SWP_SHOWWINDOW = 0x0040

DWMWA_USE_IMMERSIVE_DARK_MODE = 20
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_ROUND = 2

def apply_frameless_acrylic_style(hwnd):
    # Strip standard window title bar and borders
    style = user32.GetWindowLongW(hwnd, GWL_STYLE)
    style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU)
    style |= WS_POPUP
    user32.SetWindowLongW(hwnd, GWL_STYLE, style)

    # Make toolwindow and topmost
    ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    ex_style |= (WS_EX_TOPMOST | WS_EX_TOOLWINDOW)
    user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

    # Windows 11 Modern Rounded Corners
    corner_pref = ctypes.c_int(DWMWCP_ROUND)
    dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(corner_pref), ctypes.sizeof(corner_pref))

    # Dark Mode Titlebar & Frame
    dark_mode = ctypes.c_int(1)
    dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ctypes.byref(dark_mode), ctypes.sizeof(dark_mode))

    # Trigger redraw with new style
    user32.SetWindowPos(hwnd, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW)
    print("Frameless modern styling applied successfully to HWND:", hwnd)

print("Win32 frameless helper defined.")
