# 🤠 Prompt Cowboy Floating Desktop Overlay

A modern, ultra-lightweight, Grammarly/Pieces-style always-on-top floating desktop widget for **Prompt Cowboy**.

---

## ✨ Features

- **Floating Mascot Bubble (Grammarly Style):**
  - Floats on screen with the official **Kawaii Pink Pixel Cowboy mascot** and glowing orange neon border.
  - Left-edge **Dotted Drag Handle (`::`)** allows smooth drag-and-drop to any corner or position on your desktop.
- **Custom Resizing (Drag & Drop):**
  - In expanded panel mode, easily drag the window edges to resize width & height according to your preference. The app automatically remembers your custom dimensions.
- **Custom Global Shortcut Selector:**
  - Click the **`Ctrl+Shift+P ⚙`** badge in the header to change the global hotkey (`Ctrl+Shift+P`, `Alt+Space`, `Ctrl+Space`, `F1`, `Alt+P`, etc.).
- **Smooth Cubic Spring Animation:**
  - Morphs smoothly from the exact bubble position to the full panel and back.
- **Instant Collapse (`Esc` Key):**
  - Press `Esc` or click `─` to instantly collapse back to the compact floating bubble.
- **Auto-Remember Position & Dimensions:**
  - Persists your chosen bubble position, custom panel width, and custom height across restarts.
- **System Tray Integration & Windows Startup:**
  - Runs in the background and supports launch on Windows boot.

---

## 🚀 How to Run

Double click **`Start-Overlay.bat`** or run:
```bash
npm start
```

---

## 📦 GitHub Release & Version Updates

To build a standalone Windows Installer / Portable `.exe` for GitHub releases:
```bash
npm run build:win
```

### Git Repository Setup:
```bash
git init
git add .
git commit -m "feat: initial release of prompt cowboy floating widget v1.0.0"
```
