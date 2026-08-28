# 🤠 Prompt Cowboy Floating Desktop Overlay

A modern, ultra-lightweight, Grammarly / Pieces-style always-on-top floating desktop widget for **Prompt Cowboy**.

---

## 📥 Download & Install (Windows)

Download the latest standalone installer from the [Releases](https://github.com/mbrown1837/prompt-cowboy-overlay/releases/latest) page:

👉 **[Download Prompt Cowboy Setup v1.2.1 (.exe)](https://github.com/mbrown1837/prompt-cowboy-overlay/releases/download/v1.2.1/Prompt.Cowboy.Setup.1.2.1.exe)**

---

## ✨ Features

- **Floating Mascot Bubble (Grammarly Scale):**
  - Floats on your screen as a crisp 32px circular badge featuring the official **Kawaii Pink Pixel Cowboy mascot** with neon-amber border.
  - Seamless **Drag & Drop**: Click and hold anywhere on the bubble to reposition it anywhere on your desktop.
  - **Instant Tap to Expand**: Single click instantly expands the Prompt Cowboy canvas.
- **Inline Magic Trigger (`/cowboy`):**
  - Type any rough prompt followed by `/cowboy` in any app (VS Code, Cursor, Chrome, ChatGPT, WhatsApp) to have Prompt Cowboy automatically enhance and replace it right at your cursor position!
  - Animated glowing loading spinner on the mascot badge provides instant real-time polishing feedback.
- **Global Hotkey Toggle (`Ctrl + Shift + P`):**
  - Toggle the overlay instantly from any app, browser, or game on your PC.
  - Press **`Esc`** or click **`─`** to collapse back into the sleek floating bubble.
- **Interactive Onboarding Tour & Preferences:**
  - 4-step onboarding tour on first launch to guide you through shortcuts, inline commands, and startup behavior.
  - Open **`Settings ⚙`** anytime to customize shortcuts, trigger keywords, and autostart.
- **Live URL & Navigation Memory:**
  - Automatically remembers the exact prompt studio, library page, or homepage where you left off.
- **Persistent Session & Auth:**
  - Login once with Google / Email. Session tokens, cookies, and local storage persist across reboots.
- **Background Auto-Updater:**
  - Automatically checks GitHub Releases for new updates and notifies you when an update is ready.
- **Windows Startup & Clean Uninstaller:**
  - Optional "Launch on Windows Startup" toggle.
  - Standard Windows Uninstaller registered in Control Panel / Apps.

---

## ⌨️ Shortcuts Reference

| Action | Shortcut / Trigger |
| :--- | :--- |
| **Inline AI Enhancement** | Type `your rough thought /cowboy` in any app |
| **Open / Expand Panel** | Click Mascot Bubble **OR** `Ctrl + Shift + P` |
| **Collapse / Minimize** | Press **`Esc`** **OR** Click **`─`** in header |
| **Open Preferences** | Click **`Settings ⚙`** in header |
| **Move Floating Bubble** | Hold left click on bubble & drag anywhere |
| **Resize Panel** | Drag any window edge/corner with mouse |
| **Snap to Corner** | Click **`📌`** in header or settings |

---

## 🛠️ Development & Building from Source

```bash
# Clone the repository
git clone https://github.com/mbrown1837/prompt-cowboy-overlay.git
cd prompt-cowboy-overlay

# Install dependencies
npm install

# Start in development mode
npm start

# Build Windows NSIS Installer (.exe)
npm run build:installer
```
