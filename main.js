const { app, BrowserWindow, WebContentsView, globalShortcut, Tray, Menu, screen, nativeImage, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.log('electron-updater not available in dev mode:', e);
}

let mainWindow = null;
let contentView = null;
let tray = null;
let isExpanded = false;
let isAnimating = false;

// Compact Mascot Dimensions
const BUBBLE_WIDTH = 36;
const BUBBLE_HEIGHT = 36;
const HEADER_HEIGHT = 42;

const CONFIG_PATH = path.join(app.getPath('userData'), 'overlay-config.json');
const ICON_PATH = path.join(__dirname, 'PC-pixel-icon.png');
const ICO_PATH = path.join(__dirname, 'icon.ico');
const DEFAULT_URL = 'https://www.promptcowboy.ai/30c09323-e446-4b58-9e85-7077bf9b9547/prompt/7e6d840c-3cc7-43f5-938c-7c4453fa8d40';

function loadConfig() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  let config = {
    url: DEFAULT_URL,
    expandedWidth: 680,
    expandedHeight: 760,
    bubbleX: workArea.x + workArea.width - 50,
    bubbleY: workArea.y + workArea.height - 120,
    shortcut: 'CommandOrControl+Shift+P',
    autostart: true,
  };

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      config = { ...config, ...saved };
    }
  } catch (e) {
    console.error('Config load error:', e);
  }
  return config;
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.error('Config save error:', e);
  }
}

function calculateExpandedBounds(bubbleX, bubbleY) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const config = loadConfig();

  const expW = config.expandedWidth || 680;
  const expH = config.expandedHeight || 760;

  const midX = workArea.x + workArea.width / 2;
  const midY = workArea.y + workArea.height / 2;

  let targetX, targetY;

  if (bubbleX > midX) {
    targetX = bubbleX - expW + BUBBLE_WIDTH;
  } else {
    targetX = bubbleX;
  }

  if (bubbleY > midY) {
    targetY = bubbleY - expH + BUBBLE_HEIGHT;
  } else {
    targetY = bubbleY;
  }

  targetX = Math.max(workArea.x + 10, Math.min(targetX, workArea.x + workArea.width - expW - 10));
  targetY = Math.max(workArea.y + 10, Math.min(targetY, workArea.y + workArea.height - expH - 10));

  return {
    x: Math.round(targetX),
    y: Math.round(targetY),
    width: expW,
    height: expH,
  };
}

function updateContentViewBounds(w, h) {
  if (contentView && isExpanded) {
    contentView.setBounds({
      x: 1,
      y: HEADER_HEIGHT,
      width: w - 2,
      height: h - HEADER_HEIGHT - 1,
    });
  }
}

function animateBounds(startBounds, endBounds, duration = 120, steps = 10, onComplete) {
  if (isAnimating) return;
  isAnimating = true;

  const stepTime = duration / steps;
  let currentStep = 0;

  const interval = setInterval(() => {
    currentStep++;
    const t = currentStep / steps;
    const ease = 1 - Math.pow(1 - t, 3);

    const curX = Math.round(startBounds.x + (endBounds.x - startBounds.x) * ease);
    const curY = Math.round(startBounds.y + (endBounds.y - startBounds.y) * ease);
    const curW = Math.round(startBounds.width + (endBounds.width - startBounds.width) * ease);
    const curH = Math.round(startBounds.height + (endBounds.height - startBounds.height) * ease);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBounds({ x: curX, y: curY, width: curW, height: curH });
      updateContentViewBounds(curW, curH);
    }

    if (currentStep >= steps) {
      clearInterval(interval);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBounds(endBounds);
        updateContentViewBounds(endBounds.width, endBounds.height);
      }
      isAnimating = false;
      if (onComplete) onComplete();
    }
  }, stepTime);
}

function collapseToBubble() {
  if (!isExpanded || isAnimating || !mainWindow) return;

  const config = loadConfig();
  const startBounds = mainWindow.getBounds();

  config.expandedWidth = startBounds.width;
  config.expandedHeight = startBounds.height;
  saveConfig(config);

  const endBounds = {
    x: config.bubbleX,
    y: config.bubbleY,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
  };

  if (contentView) {
    contentView.setVisible(false);
  }

  mainWindow.setResizable(false);
  mainWindow.webContents.send('state-change', 'bubble');

  animateBounds(startBounds, endBounds, 120, 8, () => {
    isExpanded = false;
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.show();
  });
}

function expandToPanel() {
  if (isExpanded || isAnimating || !mainWindow) return;

  const config = loadConfig();
  const startBounds = mainWindow.getBounds();
  const endBounds = calculateExpandedBounds(config.bubbleX, config.bubbleY);

  mainWindow.webContents.send('state-change', 'expanded');

  animateBounds(startBounds, endBounds, 140, 10, () => {
    isExpanded = true;
    mainWindow.setResizable(true);
    if (contentView) {
      updateContentViewBounds(endBounds.width, endBounds.height);
      contentView.setVisible(true);
      contentView.webContents.focus();
    }
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.focus();
  });
}

function toggleOverlay() {
  if (isExpanded) {
    collapseToBubble();
  } else {
    expandToPanel();
  }
}

function snapToCorner() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;
  const config = loadConfig();
  config.bubbleX = workArea.x + workArea.width - 50;
  config.bubbleY = workArea.y + workArea.height - 120;
  saveConfig(config);
  collapseToBubble();
}

function registerAppShortcut(shortcutKey) {
  globalShortcut.unregisterAll();
  const keyToRegister = shortcutKey || 'CommandOrControl+Shift+P';
  try {
    const success = globalShortcut.register(keyToRegister, () => {
      toggleOverlay();
    });
    return success;
  } catch (err) {
    return false;
  }
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Prompt Cowboy version ${info.version} is available. Downloading in the background...`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `Prompt Cowboy version ${info.version} has been downloaded. Restart to apply update.`,
      buttons: ['Restart Now', 'Later'],
    }).then((res) => {
      if (res.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => console.log('Update check error:', e));
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  const cfg = loadConfig();
  cfg.openAtLogin = app.getLoginItemSettings().openAtLogin;
  return cfg;
});

ipcMain.handle('save-config', (_event, cfg) => {
  saveConfig(cfg);
  return true;
});

ipcMain.handle('set-shortcut', (_event, key) => {
  const config = loadConfig();
  const ok = registerAppShortcut(key);
  if (ok) {
    config.shortcut = key;
    saveConfig(config);
    return { success: true, shortcut: key };
  }
  registerAppShortcut(config.shortcut);
  return { success: false, error: 'Failed to register shortcut' };
});

ipcMain.handle('toggle-autostart', (_event, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable });
  const config = loadConfig();
  config.autostart = enable;
  saveConfig(config);
  return { success: true, autostart: enable };
});

ipcMain.handle('check-updates', async () => {
  if (!autoUpdater || !app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Check for Updates',
      message: 'You are running the latest version of Prompt Cowboy (v1.0.0).',
      buttons: ['OK'],
    });
    return { status: 'latest' };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    return { status: 'checked', res };
  } catch (e) {
    dialog.showErrorBox('Update Check Failed', e.message || 'Unable to reach GitHub updates.');
    return { status: 'error', error: e.message };
  }
});

ipcMain.on('collapse-overlay', () => collapseToBubble());
ipcMain.on('expand-overlay', () => expandToPanel());
ipcMain.on('toggle-overlay', () => toggleOverlay());
ipcMain.on('snap-corner', () => snapToCorner());
ipcMain.on('reload-content', () => {
  if (contentView) {
    contentView.webContents.reload();
  }
});

ipcMain.on('move-bubble', (_event, { dx, dy }) => {
  if (!isExpanded && mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    const newX = bounds.x + dx;
    const newY = bounds.y + dy;
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: BUBBLE_WIDTH,
      height: BUBBLE_HEIGHT,
    });
    const config = loadConfig();
    config.bubbleX = newX;
    config.bubbleY = newY;
    saveConfig(config);
  }
});

function createWindow() {
  const config = loadConfig();

  mainWindow = new BrowserWindow({
    x: config.bubbleX,
    y: config.bubbleY,
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    minWidth: 420,
    minHeight: 480,
    skipTaskbar: true,
    hasShadow: false,
    show: true,
    icon: fs.existsSync(ICO_PATH) ? ICO_PATH : ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.show();

  isExpanded = false;

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  contentView = new WebContentsView({
    webPreferences: {
      partition: 'persist:promptcowboy',
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  contentView.webContents.loadURL(config.url);
  contentView.setVisible(false);

  contentView.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      collapseToBubble();
    }
  });

  mainWindow.contentView.addChildView(contentView);

  mainWindow.on('resize', () => {
    if (isExpanded && !isAnimating) {
      const bounds = mainWindow.getBounds();
      updateContentViewBounds(bounds.width, bounds.height);
      const config = loadConfig();
      config.expandedWidth = bounds.width;
      config.expandedHeight = bounds.height;
      saveConfig(config);
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      collapseToBubble();
    }
  });
}

function createTray() {
  const icon = fs.existsSync(ICO_PATH)
    ? nativeImage.createFromPath(ICO_PATH)
    : (fs.existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : nativeImage.createEmpty());

  tray = new Tray(icon);
  tray.setToolTip('Prompt Cowboy Floating Widget');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Toggle Prompt Cowboy (HotKey)',
      click: () => toggleOverlay(),
    },
    { type: 'separator' },
    {
      label: 'Snap to Bottom-Right Corner',
      click: () => snapToCorner(),
    },
    {
      label: 'Reload Prompt Cowboy',
      click: () => {
        if (contentView) contentView.webContents.reload();
      },
    },
    {
      label: 'Check for Updates...',
      click: () => {
        if (autoUpdater && app.isPackaged) {
          autoUpdater.checkForUpdatesAndNotify();
        } else {
          dialog.showMessageBox({
            type: 'info',
            title: 'Prompt Cowboy Updates',
            message: 'You are using Prompt Cowboy v1.0.0 (Latest Release).',
            buttons: ['OK'],
          });
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Launch on Windows Startup',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        const config = loadConfig();
        config.autostart = item.checked;
        saveConfig(config);
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => toggleOverlay());
}

app.whenReady().then(() => {
  const config = loadConfig();
  createWindow();
  createTray();
  setupAutoUpdater();

  registerAppShortcut(config.shortcut);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
