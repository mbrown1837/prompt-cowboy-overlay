const { app, BrowserWindow, WebContentsView, globalShortcut, Tray, Menu, screen, nativeImage, ipcMain, dialog, session, net, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.log('electron-updater not loaded in dev mode:', e);
}

let mainWindow = null;
let contentView = null;
let settingsWindow = null;
let onboardingWindow = null;
let tray = null;
let isExpanded = false;
let isAnimating = false;
let hookEngineProcess = null;

// Compact Mascot Dimensions
const BUBBLE_WIDTH = 36;
const BUBBLE_HEIGHT = 36;
const HEADER_HEIGHT = 42;

const CONFIG_PATH = path.join(app.getPath('userData'), 'overlay-config.json');
const ICON_PATH = path.join(__dirname, 'PC-pixel-icon.png');
const ICO_PATH = path.join(__dirname, 'icon.ico');
const DEFAULT_URL = 'https://www.promptcowboy.ai/30c09323-e446-4b58-9e85-7077bf9b9547/prompt/7e6d840c-3cc7-43f5-938c-7c4453fa8d40';

function getHookEnginePath() {
  const localPath = path.join(__dirname, 'hook_engine.exe');
  if (fs.existsSync(localPath)) return localPath;
  const appPath = path.join(process.resourcesPath, 'hook_engine.exe');
  if (fs.existsSync(appPath)) return appPath;
  const rootAppPath = path.join(path.dirname(process.execPath), 'hook_engine.exe');
  if (fs.existsSync(rootAppPath)) return rootAppPath;
  return localPath;
}

function loadConfig() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  let config = {
    url: DEFAULT_URL,
    lastUrl: DEFAULT_URL,
    expandedWidth: 680,
    expandedHeight: 760,
    bubbleX: workArea.x + workArea.width - 50,
    bubbleY: workArea.y + workArea.height - 120,
    shortcut: 'CommandOrControl+Shift+P',
    inlineTrigger: '/cowboy',
    inlineEnabled: true,
    autostart: true,
    hasSeenOnboarding: false,
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
    const current = loadConfig();
    const updated = { ...current, ...cfg };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
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

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  settingsWindow = new BrowserWindow({
    width: 390,
    height: 500,
    x: workArea.x + Math.round((workArea.width - 390) / 2),
    y: workArea.y + Math.round((workArea.height - 500) / 2),
    frame: true,
    title: 'Prompt Cowboy Settings',
    resizable: false,
    alwaysOnTop: true,
    icon: fs.existsSync(ICO_PATH) ? ICO_PATH : ICON_PATH,
    backgroundColor: '#121214',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function openOnboardingWindow() {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  onboardingWindow = new BrowserWindow({
    width: 480,
    height: 530,
    x: workArea.x + Math.round((workArea.width - 480) / 2),
    y: workArea.y + Math.round((workArea.height - 530) / 2),
    frame: true,
    title: 'Welcome to Prompt Cowboy',
    resizable: false,
    alwaysOnTop: true,
    icon: fs.existsSync(ICO_PATH) ? ICO_PATH : ICON_PATH,
    backgroundColor: '#09090b',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  onboardingWindow.setMenuBarVisibility(false);
  onboardingWindow.loadFile(path.join(__dirname, 'onboarding.html'));

  onboardingWindow.on('closed', () => {
    onboardingWindow = null;
  });
}

// ----------------- Headless Inline /cowboy Polishing Engine -----------------
async function polishPromptHeadless(roughPrompt) {
  if (!contentView) return null;

  try {
    const jsInjection = `
      (function() {
        return new Promise((resolve) => {
          var ta = document.querySelector('textarea') || document.querySelector('input[type="text"]');
          if (!ta) {
            resolve({ success: false, error: 'no_textarea' });
            return;
          }
          ta.value = ${JSON.stringify(roughPrompt)};
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));

          setTimeout(function() {
            var btn = document.querySelector('button[type="submit"]') || 
                      Array.from(document.querySelectorAll('button')).find(b => b.querySelector('svg') || b.textContent.includes('Improve') || b.textContent.includes('↑'));
            if (btn) {
              btn.click();
            }

            var attempts = 0;
            var checkInterval = setInterval(function() {
              attempts++;
              var outputEl = document.querySelector('.prose') || document.querySelector('[data-testid="prompt-output"]') || document.querySelector('.whitespace-pre-wrap');

              if (outputEl && outputEl.innerText && outputEl.innerText.length > (roughPrompt.length + 10)) {
                clearInterval(checkInterval);
                resolve({ success: true, polished: outputEl.innerText });
                return;
              }

              if (attempts > 35) {
                clearInterval(checkInterval);
                var fallback = outputEl ? outputEl.innerText : null;
                resolve({ success: true, polished: fallback || roughPrompt });
              }
            }, 100);
          }, 150);
        });
      })();
    `;

    const result = await contentView.webContents.executeJavaScript(jsInjection);
    return result && result.polished ? result.polished : roughPrompt;
  } catch (err) {
    console.error('Headless polish error:', err);
    return roughPrompt;
  }
}

// ----------------- Native Global Keyboard Hook Engine -----------------
function startNativeHookEngine() {
  const exePath = getHookEnginePath();
  if (!fs.existsSync(exePath)) {
    console.log('hook_engine.exe not found at:', exePath);
    return;
  }

  try {
    hookEngineProcess = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const config = loadConfig();
    const activeTriggers = config.inlineTrigger ? `${config.inlineTrigger},/cowboy,/cowboys,/prompt,/pc` : '/cowboy,/cowboys,/prompt,/pc';
    hookEngineProcess.stdin.write(`SET_TRIGGERS:${activeTriggers}\n`);

    hookEngineProcess.stdout.on('data', async (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('PAYLOAD:')) {
          const roughPrompt = trimmed.substring('PAYLOAD:'.length).trim();
          if (roughPrompt.length > 0) {
            // 1. Show glowing spinning badge on mascot
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('state-change', 'loading');
            }

            // 2. Headless polish through Prompt Cowboy session
            const polished = await polishPromptHeadless(roughPrompt);

            // 3. Write to clipboard & trigger instant paste
            if (polished) {
              clipboard.writeText(polished);
              if (hookEngineProcess && !hookEngineProcess.killed) {
                hookEngineProcess.stdin.write('PASTE:\n');
              }
            }

            // 4. Restore resting mascot state
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed() && !isExpanded) {
                mainWindow.webContents.send('state-change', 'bubble');
              }
            }, 300);
          }
        }
      }
    });

    hookEngineProcess.on('error', (err) => {
      console.log('Hook engine spawn error:', err);
    });

    console.log('hook_engine.exe started successfully.');
  } catch (e) {
    console.log('Hook engine execution error:', e);
  }
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

function checkGitHubReleaseUpdate() {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'GET',
      url: 'https://api.github.com/repos/mbrown1837/prompt-cowboy-overlay/releases/latest',
      headers: {
        'User-Agent': 'PromptCowboyApp',
      },
    });

    let body = '';
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        resolve({ status: 'error', error: `Server returned HTTP ${response.statusCode}` });
        return;
      }
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          const latestTag = (data.tag_name || '').replace(/^v/, '');
          const currentVer = app.getVersion().replace(/^v/, '');

          if (latestTag && latestTag > currentVer) {
            resolve({
              status: 'update-available',
              latestVersion: 'v' + latestTag,
              currentVersion: 'v' + currentVer,
              releaseUrl: data.html_url,
            });
          } else {
            resolve({
              status: 'latest',
              currentVersion: 'v' + currentVer,
              latestVersion: 'v' + latestTag,
            });
          }
        } catch (e) {
          resolve({ status: 'error', error: 'Failed to parse update info' });
        }
      });
    });

    request.on('error', (err) => {
      resolve({ status: 'error', error: err.message || 'Network error' });
    });

    request.end();
  });
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `Prompt Cowboy version ${info.version} is available. Downloading in background...`,
      buttons: ['OK'],
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready to Install',
      message: `Prompt Cowboy version ${info.version} has been downloaded. Restart now to apply update?`,
      buttons: ['Restart and Update', 'Later'],
    }).then((res) => {
      if (res.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((e) => console.log('Auto-update error:', e));
    }, 4000);
  }
}

// IPC Handlers
ipcMain.handle('get-config', () => {
  const cfg = loadConfig();
  cfg.openAtLogin = app.getLoginItemSettings().openAtLogin;
  cfg.version = app.getVersion();
  return cfg;
});

ipcMain.handle('save-config', (_event, cfg) => {
  saveConfig(cfg);
  if (hookEngineProcess && cfg.inlineTrigger) {
    hookEngineProcess.stdin.write(`SET_TRIGGERS:${cfg.inlineTrigger},/cowboy,/cowboys,/prompt,/pc\n`);
  }
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
  const result = await checkGitHubReleaseUpdate();
  if (result.status === 'update-available' && autoUpdater && app.isPackaged) {
    autoUpdater.checkForUpdates().catch(() => {});
  }
  return result;
});

ipcMain.on('open-settings', () => openSettingsWindow());
ipcMain.on('open-onboarding', () => openOnboardingWindow());
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

  const ses = session.fromPartition('persist:promptcowboy', { cache: true });

  contentView = new WebContentsView({
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const urlToLoad = config.lastUrl || config.url || DEFAULT_URL;
  contentView.webContents.loadURL(urlToLoad);
  contentView.setVisible(false);

  function saveCurrentURL(navUrl) {
    if (navUrl && !navUrl.startsWith('about:blank') && !navUrl.startsWith('data:')) {
      const cfg = loadConfig();
      cfg.lastUrl = navUrl;
      saveConfig(cfg);
      ses.cookies.flushStore().catch(() => {});
    }
  }

  contentView.webContents.on('did-navigate', (_event, url) => saveCurrentURL(url));
  contentView.webContents.on('did-navigate-in-page', (_event, url) => saveCurrentURL(url));

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
      const cfg = loadConfig();
      cfg.expandedWidth = bounds.width;
      cfg.expandedHeight = bounds.height;
      saveConfig(cfg);
    }
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      collapseToBubble();
    }
  });

  if (!config.hasSeenOnboarding) {
    setTimeout(() => {
      openOnboardingWindow();
    }, 800);
  }
}

function createTray() {
  const icon = fs.existsSync(ICO_PATH)
    ? nativeImage.createFromPath(ICO_PATH)
    : (fs.existsSync(ICON_PATH) ? nativeImage.createFromPath(ICON_PATH) : nativeImage.createEmpty());

  tray = new Tray(icon);
  tray.setToolTip(`Prompt Cowboy v${app.getVersion()}`);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Toggle Prompt Cowboy (HotKey)',
      click: () => toggleOverlay(),
    },
    { type: 'separator' },
    {
      label: 'Settings & Preferences...',
      click: () => openSettingsWindow(),
    },
    {
      label: 'Quick Tour & Setup...',
      click: () => openOnboardingWindow(),
    },
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
      click: async () => {
        const res = await checkGitHubReleaseUpdate();
        if (res.status === 'latest') {
          dialog.showMessageBox({
            type: 'info',
            title: 'Prompt Cowboy Updates',
            message: `✓ You are running the latest version of Prompt Cowboy (${res.currentVersion}).`,
            buttons: ['OK'],
          });
        } else if (res.status === 'update-available') {
          dialog.showMessageBox({
            type: 'info',
            title: 'Update Available',
            message: `✨ Update ${res.latestVersion} is available! Downloading in background...`,
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
        const cfg = loadConfig();
        cfg.autostart = item.checked;
        saveConfig(cfg);
      },
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.isQuitting = true;
        if (hookEngineProcess) {
          try { hookEngineProcess.kill(); } catch (e) {}
        }
        const ses = session.fromPartition('persist:promptcowboy');
        ses.cookies.flushStore().then(() => {
          app.quit();
        }).catch(() => {
          app.quit();
        });
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
  startNativeHookEngine();

  registerAppShortcut(config.shortcut);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (hookEngineProcess) {
    try { hookEngineProcess.kill(); } catch (e) {}
  }
});
