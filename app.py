import os
import sys
import json
import time
import math
import base64
import threading
import winreg
import ctypes
from ctypes import wintypes
from PIL import Image, ImageDraw
import webview
import pystray

# ----------------- Win32 Constants & APIs -----------------
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
dwmapi = ctypes.windll.dwmapi

MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_NOREPEAT = 0x4000
WM_HOTKEY = 0x0312
HOTKEY_ID = 1001

VK_P = 0x50  # 'P'
VK_ESCAPE = 0x1B

SW_HIDE = 0
SW_SHOW = 5
SW_RESTORE = 9

HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_SHOWWINDOW = 0x0040
SWP_FRAMECHANGED = 0x0020
SWP_NOACTIVATE = 0x0010

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

DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_ROUND = 2
DWMWA_USE_IMMERSIVE_DARK_MODE = 20

APP_DIR = os.path.dirname(os.path.abspath(__file__))
ICON_PATH = os.path.join(APP_DIR, "PC-pixel-icon.png")
CONFIG_PATH = os.path.join(os.environ.get("LOCALAPPDATA", os.path.expanduser("~")), "PromptCowboyOverlay", "config.json")
DEFAULT_URL = "https://www.promptcowboy.ai/30c09323-e446-4b58-9e85-7077bf9b9547/prompt/7e6d840c-3cc7-43f5-938c-7c4453fa8d40"

os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)

# Load base64 of icon for direct webview injection
ICON_B64 = ""
if os.path.exists(ICON_PATH):
    try:
        with open(ICON_PATH, "rb") as f:
            ICON_B64 = base64.b64encode(f.read()).decode("utf-8")
    except Exception:
        pass

class RECT(ctypes.Structure):
    _fields_ = [('left', wintypes.LONG),
                ('top', wintypes.LONG),
                ('right', wintypes.LONG),
                ('bottom', wintypes.LONG)]

def get_work_area():
    rect = RECT()
    user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0)
    return rect

def load_config():
    rect = get_work_area()
    exp_w = 680
    exp_h = 760
    
    bubble_x = rect.right - 80
    bubble_y = rect.bottom - 160
    
    config = {
        "url": DEFAULT_URL,
        "expanded_width": exp_w,
        "expanded_height": exp_h,
        "bubble_x": bubble_x,
        "bubble_y": bubble_y,
        "always_on_top": True
    }
    
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
                config.update(saved)
        except Exception:
            pass
            
    return config

def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
    except Exception:
        pass

def get_hwnds_for_pid():
    my_pid = os.getpid()
    hwnds = []
    
    WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    
    def enum_cb(hwnd, lparam):
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if pid.value == my_pid:
            parent = user32.GetParent(hwnd)
            if parent == 0:
                hwnds.append(hwnd)
        return True

    cb = WNDENUMPROC(enum_cb)
    user32.EnumWindows(cb, 0)
    return hwnds

# ----------------- Windows Startup Registry -----------------
def set_autostart(enable=True):
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE)
        if enable:
            python_exe = sys.executable
            script_path = os.path.abspath(__file__)
            pythonw_exe = os.path.join(os.path.dirname(python_exe), "pythonw.exe")
            exe_to_use = pythonw_exe if os.path.exists(pythonw_exe) else python_exe
            cmd = f'"{exe_to_use}" "{script_path}"'
            winreg.SetValueEx(key, "PromptCowboyOverlay", 0, winreg.REG_SZ, cmd)
        else:
            try:
                winreg.DeleteValue(key, "PromptCowboyOverlay")
            except FileNotFoundError:
                pass
        winreg.CloseKey(key)
        return True
    except Exception:
        return False

def is_autostart_enabled():
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    try:
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_READ)
        winreg.QueryValueEx(key, "PromptCowboyOverlay")
        winreg.CloseKey(key)
        return True
    except Exception:
        return False

# ----------------- Tray Icon -----------------
def get_tray_icon():
    if os.path.exists(ICON_PATH):
        try:
            return Image.open(ICON_PATH)
        except Exception:
            pass
    # Fallback
    img = Image.new("RGBA", (64, 64), color=(0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(4, 4), (60, 60)], radius=16, fill="#18181b", outline="#f97316", width=4)
    draw.polygon([(16, 22), (48, 22), (40, 32), (24, 32)], fill="#f97316")
    draw.ellipse([(12, 30), (52, 38)], fill="#f97316")
    return img

# ----------------- Main Overlay App Controller -----------------
class FloatingPromptCowboyApp:
    def __init__(self):
        self.config = load_config()
        self.window = None
        self.hwnd = None
        self.is_expanded = True
        self.is_animating = False
        self.tray = None
        self.running = True
        self.lock = threading.Lock()
        
        self.bubble_size = 64
        self.expanded_w = self.config["expanded_width"]
        self.expanded_h = self.config["expanded_height"]

    def get_hwnd(self):
        if not self.hwnd or not user32.IsWindow(self.hwnd):
            hwnds = get_hwnds_for_pid()
            if hwnds:
                self.hwnd = hwnds[0]
        return self.hwnd

    def apply_frameless_styling(self):
        hwnd = self.get_hwnd()
        if not hwnd:
            return
            
        style = user32.GetWindowLongW(hwnd, GWL_STYLE)
        style &= ~(WS_CAPTION | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX | WS_SYSMENU)
        style |= WS_POPUP
        user32.SetWindowLongW(hwnd, GWL_STYLE, style)

        ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        ex_style |= (WS_EX_TOPMOST | WS_EX_TOOLWINDOW)
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style)

        corner_pref = ctypes.c_int(DWMWCP_ROUND)
        dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ctypes.byref(corner_pref), ctypes.sizeof(corner_pref))

        dark_mode = ctypes.c_int(1)
        dwmapi.DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ctypes.byref(dark_mode), ctypes.sizeof(dark_mode))

        user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED | SWP_SHOWWINDOW)

    def calculate_expanded_coords(self):
        rect = get_work_area()
        bx = self.config["bubble_x"]
        by = self.config["bubble_y"]
        
        mid_x = (rect.left + rect.right) // 2
        mid_y = (rect.top + rect.bottom) // 2
        
        if bx > mid_x:
            target_x = bx - self.expanded_w + self.bubble_size
        else:
            target_x = bx
            
        if by > mid_y:
            target_y = by - self.expanded_h + self.bubble_size
        else:
            target_y = by
            
        target_x = max(rect.left + 10, min(target_x, rect.right - self.expanded_w - 10))
        target_y = max(rect.top + 10, min(target_y, rect.bottom - self.expanded_h - 10))
        
        return int(target_x), int(target_y)

    def animate_window(self, start_x, start_y, start_w, start_h, end_x, end_y, end_w, end_h, steps=8, duration=0.12):
        hwnd = self.get_hwnd()
        if not hwnd:
            return
            
        self.is_animating = True
        step_time = duration / steps
        
        for i in range(1, steps + 1):
            t = i / steps
            ease = 1 - math.pow(1 - t, 3) # Cubic ease-out
            
            cur_x = int(start_x + (end_x - start_x) * ease)
            cur_y = int(start_y + (end_y - start_y) * ease)
            cur_w = int(start_w + (end_w - start_w) * ease)
            cur_h = int(start_h + (end_h - start_h) * ease)
            
            user32.SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                cur_x, cur_y, cur_w, cur_h,
                SWP_SHOWWINDOW | SWP_NOACTIVATE
            )
            time.sleep(step_time)
            
        user32.SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            int(end_x), int(end_y), int(end_w), int(end_h),
            SWP_SHOWWINDOW
        )
        self.is_animating = False

    def expand(self):
        hwnd = self.get_hwnd()
        if not hwnd or self.is_animating:
            return
            
        with self.lock:
            if self.is_expanded:
                return
                
            bx = self.config["bubble_x"]
            by = self.config["bubble_y"]
            target_x, target_y = self.calculate_expanded_coords()
            
            # Hide the bubble overlay inside WebView
            if self.window:
                try:
                    self.window.evaluate_js("window.showExpandedView && window.showExpandedView();")
                except Exception:
                    pass

            self.animate_window(
                bx, by, self.bubble_size, self.bubble_size,
                target_x, target_y, self.expanded_w, self.expanded_h,
                steps=10, duration=0.14
            )
            
            user32.SetForegroundWindow(hwnd)
            self.apply_frameless_styling()
            self.is_expanded = True
            
            if self.window:
                try:
                    self.window.evaluate_js("""
                        setTimeout(function() {
                            var ta = document.querySelector('textarea');
                            if (ta) ta.focus();
                        }, 200);
                    """)
                except Exception:
                    pass

    def collapse(self):
        hwnd = self.get_hwnd()
        if not hwnd or self.is_animating:
            return
            
        with self.lock:
            if not self.is_expanded:
                return
                
            bx = self.config["bubble_x"]
            by = self.config["bubble_y"]
            target_x, target_y = self.calculate_expanded_coords()
            
            # Show bubble icon view inside WebView
            if self.window:
                try:
                    self.window.evaluate_js("window.showBubbleView && window.showBubbleView();")
                except Exception:
                    pass

            self.animate_window(
                target_x, target_y, self.expanded_w, self.expanded_h,
                bx, by, self.bubble_size, self.bubble_size,
                steps=8, duration=0.12
            )
            
            self.apply_frameless_styling()
            self.is_expanded = False

    def toggle(self):
        if self.is_expanded:
            self.collapse()
        else:
            self.expand()

    def start_hotkey_listener(self):
        def loop():
            modifiers = MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT
            if not user32.RegisterHotKey(None, HOTKEY_ID, modifiers, VK_P):
                user32.RegisterHotKey(None, HOTKEY_ID, MOD_CONTROL | MOD_SHIFT, VK_P)

            msg = wintypes.MSG()
            while self.running:
                if user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
                    if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                        self.toggle()
                    user32.TranslateMessage(ctypes.byref(msg))
                    user32.DispatchMessageW(ctypes.byref(msg))
                time.sleep(0.01)
            user32.UnregisterHotKey(None, HOTKEY_ID)

        t = threading.Thread(target=loop, daemon=True)
        t.start()

    def start_shortcuts_and_esc_listener(self):
        def loop():
            time.sleep(1.5)
            self.apply_frameless_styling()
            
            while self.running:
                hwnd = self.get_hwnd()
                # If window is active and user presses Escape, collapse to bubble
                if self.is_expanded and not self.is_animating and hwnd:
                    foreground_hwnd = user32.GetForegroundWindow()
                    if foreground_hwnd == hwnd:
                        if (user32.GetAsyncKeyState(VK_ESCAPE) & 0x8000):
                            self.collapse()
                            time.sleep(0.3)
                time.sleep(0.03)

        t = threading.Thread(target=loop, daemon=True)
        t.start()

    def start_tray(self):
        icon = get_tray_icon()
        
        def on_toggle_boot(icon, item):
            set_autostart(not is_autostart_enabled())

        menu = pystray.Menu(
            pystray.MenuItem("Toggle Prompt Cowboy (Ctrl+Shift+P)", lambda: self.toggle(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Snap to Bottom-Right", lambda: self.snap_bottom_right()),
            pystray.MenuItem("Snap to Center", lambda: self.snap_center()),
            pystray.MenuItem("Reload Prompt Cowboy", lambda: self.reload_page()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Toggle Windows Startup", on_toggle_boot),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Exit", lambda: self.exit())
        )
        
        self.tray = pystray.Icon("PromptCowboyOverlay", icon, "Prompt Cowboy Floating Overlay", menu)
        t = threading.Thread(target=self.tray.run, daemon=True)
        t.start()

    def snap_bottom_right(self):
        rect = get_work_area()
        self.config["bubble_x"] = rect.right - 80
        self.config["bubble_y"] = rect.bottom - 160
        save_config(self.config)
        self.collapse()

    def snap_center(self):
        rect = get_work_area()
        screen_w = rect.right - rect.left
        screen_h = rect.bottom - rect.top
        self.config["bubble_x"] = rect.left + screen_w // 2 - 32
        self.config["bubble_y"] = rect.top + screen_h // 2 - 32
        save_config(self.config)
        self.collapse()

    def reload_page(self):
        if self.window:
            try:
                self.window.load_url(self.config["url"])
            except Exception:
                pass

    def exit(self):
        self.running = False
        if self.tray:
            self.tray.stop()
        hwnd = self.get_hwnd()
        if hwnd:
            user32.PostMessageW(hwnd, 0x0010, 0, 0)
        time.sleep(0.2)
        os._exit(0)

# Custom JS API exposed to the webview
class AppAPI:
    def __init__(self, app):
        self.app = app
    def toggle(self):
        self.app.toggle()
    def expand(self):
        self.app.expand()
    def collapse(self):
        self.app.collapse()
    def reload(self):
        self.app.reload_page()
    def exit(self):
        self.app.exit()

def inject_overlay_ui_and_bubble(window, icon_b64):
    time.sleep(2.0)
    
    js_code = f"""
    (function() {{
        if (window.__pc_injected) return;
        window.__pc_injected = true;

        var iconSrc = "data:image/png;base64,{icon_b64}";

        // 1. Injected Styles
        var style = document.createElement('style');
        style.innerHTML = `
            #pc-floating-bubble-layer {{
                display: none;
                position: fixed;
                inset: 0;
                background: #09090b;
                z-index: 2147483647;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                border-radius: 50%;
                box-shadow: 0 4px 20px rgba(249, 115, 22, 0.4);
                border: 2px solid #f97316;
                transition: transform 0.15s ease;
                overflow: hidden;
            }}
            #pc-floating-bubble-layer:hover {{
                transform: scale(1.08);
                box-shadow: 0 6px 25px rgba(249, 115, 22, 0.6);
            }}
            #pc-floating-bubble-img {{
                width: 44px;
                height: 44px;
                object-fit: contain;
                pointer-events: none;
            }}
            #pc-custom-overlay-bar {{
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                height: 36px;
                background: rgba(24, 24, 27, 0.96);
                backdrop-filter: blur(16px);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                z-index: 2147483640;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 12px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                color: #e4e4e7;
                user-select: none;
                -webkit-app-region: drag;
            }}
        `;
        document.head.appendChild(style);

        // 2. Floating Bubble Element (Visible when collapsed)
        var bubble = document.createElement('div');
        bubble.id = 'pc-floating-bubble-layer';
        bubble.title = 'Click to Expand Prompt Cowboy (Ctrl+Shift+P)';
        bubble.innerHTML = '<img id="pc-floating-bubble-img" src="' + iconSrc + '" alt="Prompt Cowboy" />';
        bubble.onclick = function(e) {{
            e.stopPropagation();
            if (window.pywebview && window.pywebview.api) {{
                window.pywebview.api.expand();
            }}
        }};
        document.body.appendChild(bubble);

        // 3. Custom Header Bar (Visible when expanded)
        var bar = document.createElement('div');
        bar.id = 'pc-custom-overlay-bar';
        bar.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; font-weight:600; color:#f97316;">
                <img src="${{iconSrc}}" style="width:18px; height:18px; object-fit:contain;" />
                <span style="color:#ffffff; font-size:12px; letter-spacing:0.3px;">Prompt Cowboy</span>
                <span style="font-size:10px; background:#27272a; color:#a1a1aa; padding:2px 6px; border-radius:4px;">Ctrl+Shift+P</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; -webkit-app-region:no-drag;">
                <button id="pc-btn-reload" title="Reload" style="background:transparent; border:none; color:#a1a1aa; cursor:pointer; padding:4px 6px; border-radius:4px; font-size:12px;">⟳</button>
                <button id="pc-btn-minimize" title="Collapse to Bubble (Esc)" style="background:transparent; border:none; color:#a1a1aa; cursor:pointer; padding:4px 8px; border-radius:4px; font-weight:bold; font-size:14px;">─</button>
                <button id="pc-btn-close" title="Hide" style="background:transparent; border:none; color:#ef4444; cursor:pointer; padding:4px 8px; border-radius:4px; font-size:13px; font-weight:bold;">✕</button>
            </div>
        `;
        document.body.prepend(bar);
        document.body.style.paddingTop = '36px';

        document.getElementById('pc-btn-reload').onclick = function() {{
            if (window.pywebview && window.pywebview.api) window.pywebview.api.reload();
            else location.reload();
        }};
        document.getElementById('pc-btn-minimize').onclick = function() {{
            if (window.pywebview && window.pywebview.api) window.pywebview.api.collapse();
        }};
        document.getElementById('pc-btn-close').onclick = function() {{
            if (window.pywebview && window.pywebview.api) window.pywebview.api.collapse();
        }};

        // Keydown handlers for Escape
        window.addEventListener('keydown', function(e) {{
            if (e.key === 'Escape') {{
                if (window.pywebview && window.pywebview.api) {{
                    window.pywebview.api.collapse();
                }}
            }}
        }}, true);

        // State switch helpers
        window.showBubbleView = function() {{
            var b = document.getElementById('pc-floating-bubble-layer');
            var topBar = document.getElementById('pc-custom-overlay-bar');
            if (b) b.style.display = 'flex';
            if (topBar) topBar.style.display = 'none';
            document.body.style.overflow = 'hidden';
        }};

        window.showExpandedView = function() {{
            var b = document.getElementById('pc-floating-bubble-layer');
            var topBar = document.getElementById('pc-custom-overlay-bar');
            if (b) b.style.display = 'none';
            if (topBar) topBar.style.display = 'flex';
            document.body.style.overflow = 'auto';
        }};
    }})();
    """
    try:
        window.evaluate_js(js_code)
    except Exception:
        pass

def main():
    app = FloatingPromptCowboyApp()
    api = AppAPI(app)
    
    coords = app.calculate_expanded_coords()
    
    app.window = webview.create_window(
        title="Prompt Cowboy Floating Overlay",
        url=app.config["url"],
        js_api=api,
        width=app.expanded_w,
        height=app.expanded_h,
        x=coords[0],
        y=coords[1],
        shadow=True,
        on_top=True
    )

    app.start_hotkey_listener()
    app.start_shortcuts_and_esc_listener()
    app.start_tray()
    
    # Inject UI & Favicon Bubble Layer
    threading.Thread(target=lambda: inject_overlay_ui_and_bubble(app.window, ICON_B64), daemon=True).start()
    
    # Run Edge WebView2
    webview.start(gui='edgechromium', private_mode=False)

if __name__ == "__main__":
    main()
