import sys
import os
import time
import json
import threading
import ctypes
from ctypes import wintypes

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

WH_KEYBOARD_LL = 13
WM_KEYDOWN = 0x0100
WM_SYSKEYDOWN = 0x0104

INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

VK_SHIFT = 0x10
VK_CONTROL = 0x11
VK_BACK = 0x08
VK_RETURN = 0x0D
VK_SPACE = 0x20
VK_V = 0x56

class KBDLLHOOKSTRUCT(ctypes.Structure):
    _fields_ = [
        ('vkCode', wintypes.DWORD),
        ('scanCode', wintypes.DWORD),
        ('flags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk', wintypes.WORD),
        ('wScan', wintypes.WORD),
        ('dwFlags', wintypes.DWORD),
        ('time', wintypes.DWORD),
        ('dwExtraInfo', ctypes.c_size_t)
    ]

class INPUT(ctypes.Structure):
    class _INPUT(ctypes.Union):
        _fields_ = [('ki', KEYBDINPUT)]
    _anonymous_ = ('_input',)
    _fields_ = [
        ('type', wintypes.DWORD),
        ('_input', _INPUT)
    ]

def send_key_down(vk_code):
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.ki.wVk = vk_code
    inp.ki.dwFlags = 0
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

def send_key_up(vk_code):
    inp = INPUT()
    inp.type = INPUT_KEYBOARD
    inp.ki.wVk = vk_code
    inp.ki.dwFlags = KEYEVENTF_KEYUP
    user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))

def press_key(vk_code):
    send_key_down(vk_code)
    time.sleep(0.005)
    send_key_up(vk_code)

def erase_chars(count):
    for _ in range(count):
        press_key(VK_BACK)
        time.sleep(0.002)

def paste_clipboard():
    send_key_down(VK_CONTROL)
    time.sleep(0.01)
    press_key(VK_V)
    time.sleep(0.01)
    send_key_up(VK_CONTROL)

# Key mapping helper
def get_char_from_vk(vk_code):
    if 0x30 <= vk_code <= 0x39:
        return chr(vk_code)
    if 0x41 <= vk_code <= 0x5A:
        is_shift = (user32.GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0
        char = chr(vk_code)
        return char if is_shift else char.lower()
    if vk_code == VK_SPACE:
        return ' '
    if vk_code in (0xBF, 191):
        return '/'
    if vk_code in (0xBD, 189):
        return '-'
    if vk_code in (0xBE, 190):
        return '.'
    return ''

# Global state
buffer = []
hook_handle = None
triggers = ["/cowboy", "/cowboys", "/prompt", "/pc", "/improve"]

def on_stdin_command():
    # Reads commands from Electron via stdin
    global triggers
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if line.startswith("SET_TRIGGERS:"):
                raw = line[len("SET_TRIGGERS:"):]
                triggers = [t.strip().lower() for t in raw.split(",") if t.strip()]
            elif line.startswith("PASTE:"):
                time.sleep(0.05)
                paste_clipboard()
        except Exception:
            break

def keyboard_proc(nCode, wParam, lParam):
    global buffer, triggers

    if nCode >= 0 and wParam in (WM_KEYDOWN, WM_SYSKEYDOWN):
        kbd = ctypes.cast(lParam, ctypes.POINTER(KBDLLHOOKSTRUCT)).contents
        vk = kbd.vkCode

        if vk == VK_BACK:
            if buffer:
                buffer.pop()
        elif vk == VK_RETURN:
            buffer.clear()
        else:
            ch = get_char_from_vk(vk)
            if ch:
                buffer.append(ch)
                if len(buffer) > 200:
                    buffer.pop(0)

                current_text = "".join(buffer)

                # Check if text ends with any active trigger
                matched_trigger = None
                for trig in triggers:
                    if current_text.lower().endswith(trig):
                        matched_trigger = trig
                        break

                if matched_trigger:
                    # Captured rough text before trigger
                    full_line = current_text[:-len(matched_trigger)].strip()
                    if full_line:
                        # Erase typed trigger + rough text from screen
                        chars_to_erase = len(current_text)
                        erase_chars(chars_to_erase)

                        buffer.clear()

                        # Emit JSON payload to Electron main process
                        payload = json.dumps({"event": "trigger", "roughPrompt": full_line, "trigger": matched_trigger})
                        print(f"PAYLOAD:{payload}", flush=True)

    return user32.CallNextHookEx(hook_handle, nCode, wParam, lParam)

def main():
    global hook_handle

    # Start stdin reader thread
    t = threading.Thread(target=on_stdin_command, daemon=True)
    t.start()

    HOOKPROC = ctypes.WINFUNCTYPE(ctypes.c_long, ctypes.c_int, wintypes.WPARAM, wintypes.LPARAM)
    proc = HOOKPROC(keyboard_proc)

    hMod = kernel32.GetModuleHandleW(None)
    hook_handle = user32.SetWindowsHookExW(WH_KEYBOARD_LL, proc, hMod, 0)

    if not hook_handle:
        print(f"HOOK_FAILED: {ctypes.GetLastError()}", flush=True)
        return

    print("HOOK_READY", flush=True)

    msg = wintypes.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
        user32.TranslateMessage(ctypes.byref(msg))
        user32.DispatchMessageW(ctypes.byref(msg))

    user32.UnhookWindowsHookEx(hook_handle)

if __name__ == "__main__":
    main()
