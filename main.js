// ============================================================================
// Playback Joe v10.18.2 - Main Process (Production & Secure)
// Fixed: Context Isolation enabled, Preload Bridge, RFC file URLs, Safe IPC
// ============================================================================

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Single instance: a second launch exits immediately and focuses the running operator window,
// so two copies can't fight over the output display or the cuelist autosave.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    app.exit(0);
}

app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

const APP_ICON = path.join(__dirname, 'icon.png');

let mainWindow = null;
let outputWindow = null;

const cuelistSavePath = path.join(app.getPath('userData'), 'last-cuelist.json');

// One-time carry-over of the autosaved cuelist from the old "Playback Bro" userData folders.
// Copies only (never deletes) and only when the new location has no autosave yet.
try {
    if (!fs.existsSync(cuelistSavePath)) {
        const legacyDirs = ['playback-bro', 'Playback Bro'];
        for (const dir of legacyDirs) {
            const legacyPath = path.join(app.getPath('appData'), dir, 'last-cuelist.json');
            if (fs.existsSync(legacyPath)) {
                fs.mkdirSync(path.dirname(cuelistSavePath), { recursive: true });
                fs.copyFileSync(legacyPath, cuelistSavePath);
                break;
            }
        }
    }
} catch (err) {
    console.error('Failed to migrate legacy cuelist autosave:', err);
}

// Windowed output is locked to 16:9 (resize drags keep the ratio). Fullscreen is left free so the
// output always fills its display. On leaving fullscreen the window is snapped to 16:9 inside its
// current bounds and the display's work area, so a 16:10 or 4:3 screen can't leave it stretched.
const OUTPUT_ASPECT = 16 / 9;

function applyOutputAspect(win) {
    if (!win || win.isDestroyed()) return;
    if (win.isFullScreen()) {
        win.setAspectRatio(0);
        return;
    }
    win.setAspectRatio(OUTPUT_ASPECT);
    const b = win.getContentBounds();
    const workArea = screen.getDisplayMatching(b).workArea;
    let width = Math.min(b.width, workArea.width);
    let height = Math.round(width / OUTPUT_ASPECT);
    if (height > workArea.height) {
        height = workArea.height;
        width = Math.round(height * OUTPUT_ASPECT);
    }
    if (width !== b.width || height !== b.height) {
        const x = Math.min(Math.max(b.x, workArea.x), workArea.x + workArea.width - width);
        const y = Math.min(Math.max(b.y, workArea.y), workArea.y + workArea.height - height);
        win.setContentBounds({ x, y, width, height });
    }
}

// Where the output belongs for the displays connected right now.
// Dual display: fullscreen on the second display. Single display: a 16:9 window in the top-right
// corner of the main screen, so it doesn't cover the operator console (top-left).
function getOutputLayout() {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const secondaryDisplay = displays.find(d => d.id !== primaryDisplay.id);
    if (displays.length > 1 && secondaryDisplay) {
        return { fullscreen: true, display: secondaryDisplay, bounds: { ...secondaryDisplay.bounds } };
    }
    const workArea = primaryDisplay.workArea;
    const width = Math.min(854, workArea.width);
    const height = Math.round(width * 9 / 16);
    return {
        fullscreen: false,
        display: primaryDisplay,
        bounds: { x: workArea.x + workArea.width - width, y: workArea.y, width, height }
    };
}

function sendOutputStatus(win) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isOpen = !!win && !win.isDestroyed();
    mainWindow.webContents.send('output-window-status', { isOpen, isFullScreen: isOpen && win.isFullScreen() });
}

// Messages for the operator's console (shown red, and the CONSOLE button turns red)
function notifyOperator(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('append-console-log', message);
    }
}

// ---- Output crash / hang recovery ----
// If the output's page crashes or hangs, it is replaced with a fresh output window on the right
// display, and the operator is told and reset to idle (the output comes back black; TAKE to carry on).
// After 3 restarts within a minute it stops retrying, so a broken file or driver can't loop forever.
const OUTPUT_RESTART_LIMIT = 3;
const OUTPUT_RESTART_WINDOW_MS = 60000;
let outputRestartTimes = [];

function recoverOutputWindow(win, what) {
    if (win !== outputWindow) return; // already replaced or closed on purpose
    const now = Date.now();
    outputRestartTimes = outputRestartTimes.filter(t => now - t < OUTPUT_RESTART_WINDOW_MS);
    outputWindow = null;
    if (!win.isDestroyed()) win.destroy();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('execute-kill');

    if (outputRestartTimes.length >= OUTPUT_RESTART_LIMIT) {
        notifyOperator(`OUTPUT WINDOW ${what} AGAIN. AUTO-RESTART STOPPED AFTER ${OUTPUT_RESTART_LIMIT} TRIES IN 1 MINUTE. PRESS OUTPUT TO REOPEN IT.`);
        sendOutputStatus(null);
        return;
    }
    outputRestartTimes.push(now);
    notifyOperator(`OUTPUT WINDOW ${what}. IT HAS BEEN RESTARTED AND IS BLACK. TAKE A CUE TO CONTINUE.`);
    setImmediate(() => { if (!outputWindow) createOutputWindow(); });
}

// ---- Display connected / disconnected ----
// Re-place the output when displays change: projector unplugged -> windowed on the main screen
// (playback keeps running); projector plugged back in -> fullscreen on it again.
let displayChangeTimer = null;

function outputIsPlacedFor(win, layout) {
    const current = screen.getDisplayMatching(win.getBounds());
    if (layout.fullscreen) return win.isFullScreen() && current.id === layout.display.id;
    return !win.isFullScreen() && current.id === layout.display.id;
}

function moveOutputTo(win, layout) {
    const apply = () => {
        if (win.isDestroyed()) return;
        win.setBounds(layout.bounds);
        if (layout.fullscreen) win.setFullScreen(true);
        else applyOutputAspect(win);
        sendOutputStatus(win);
    };
    if (win.isFullScreen()) {
        win.once('leave-full-screen', () => setTimeout(apply, 250));
        win.setFullScreen(false);
    } else {
        apply();
    }
}

function handleDisplaysChanged() {
    const win = outputWindow;
    if (!win || win.isDestroyed()) return;
    const layout = getOutputLayout();
    if (outputIsPlacedFor(win, layout)) return;
    notifyOperator(layout.fullscreen
        ? 'SECOND DISPLAY CONNECTED. OUTPUT MOVED TO IT IN FULLSCREEN.'
        : 'OUTPUT DISPLAY DISCONNECTED. OUTPUT MOVED TO A WINDOW ON THIS SCREEN. PLAYBACK CONTINUES.');
    moveOutputTo(win, layout);
}

function watchDisplays() {
    const onChange = () => {
        // Windows fires several events per plug/unplug; act once things settle
        if (displayChangeTimer) clearTimeout(displayChangeTimer);
        displayChangeTimer = setTimeout(() => { displayChangeTimer = null; handleDisplaysChanged(); }, 1000);
    };
    screen.on('display-added', onChange);
    screen.on('display-removed', onChange);
}

function createOutputWindow() {
    const layout = getOutputLayout();
    const version = app.getVersion();

    let windowOptions = {
        title: 'PLAYBACK JOE ' + version + ' - OUTPUT',
        frame: false, // Borderless output display
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        icon: APP_ICON,
        fullscreen: layout.fullscreen,
        resizable: true,
        movable: true,
        ...layout.bounds,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            // Keep timers (heartbeat, fades, time updates) running at full rate even if the output
            // is hidden behind other windows or minimized
            backgroundThrottling: false,
            preload: path.join(__dirname, 'preload.js')
        }
    };

    outputWindow = new BrowserWindow(windowOptions);
    outputWindow.loadFile(path.join(__dirname, 'output.html'));

    const win = outputWindow;
    applyOutputAspect(win);
    win.on('enter-full-screen', () => { applyOutputAspect(win); sendOutputStatus(win); });
    // Windows restores the pre-fullscreen bounds just after this event, so snap once that has settled
    win.on('leave-full-screen', () => setTimeout(() => { applyOutputAspect(win); sendOutputStatus(win); }, 150));

    // Crash: the page's process died (anything but a normal shutdown)
    win.webContents.on('render-process-gone', (event, details) => {
        if (details.reason === 'clean-exit') return;
        const why = { crashed: 'CRASHED', oom: 'RAN OUT OF MEMORY', killed: 'WAS CLOSED BY WINDOWS', 'launch-failed': 'FAILED TO START' }[details.reason]
            || `STOPPED (${String(details.reason).toUpperCase()})`;
        recoverOutputWindow(win, why);
    });

    // Hang: Windows only flags a window "not responding" when someone clicks or types in it, which
    // nobody does on the output. So output.html sends a heartbeat every second; if it goes quiet for
    // 4s the operator is warned, and at 8s the output is replaced.
    let lastHeartbeat = 0;
    let hangWarned = false;
    const onHeartbeat = (event) => {
        if (win.isDestroyed() || event.sender !== win.webContents) return;
        lastHeartbeat = Date.now();
        if (hangWarned) {
            hangWarned = false;
            notifyOperator('OUTPUT WINDOW IS RESPONDING AGAIN. NO RESTART NEEDED.');
        }
    };
    ipcMain.on('output-heartbeat', onHeartbeat);
    const watchdog = setInterval(() => {
        if (win.isDestroyed() || win !== outputWindow || !lastHeartbeat) return;
        const silentMs = Date.now() - lastHeartbeat;
        if (silentMs >= 8000) {
            recoverOutputWindow(win, 'STOPPED RESPONDING');
        } else if (silentMs >= 4000 && !hangWarned) {
            hangWarned = true;
            notifyOperator('OUTPUT WINDOW IS NOT RESPONDING. RESTARTING IT IN 4 SECONDS UNLESS IT RECOVERS.');
        }
    }, 1000);

    win.on('closed', () => {
        clearInterval(watchdog);
        ipcMain.removeListener('output-heartbeat', onHeartbeat);
        // Only report "closed" if no replacement window has been opened in the meantime
        if (outputWindow === win) outputWindow = null;
        if (outputWindow === null && mainWindow && !mainWindow.isDestroyed()) {
            sendOutputStatus(null);
            mainWindow.focus();
        }
    });

    win.webContents.on('did-finish-load', () => sendOutputStatus(win));
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();

    createOutputWindow();
    watchDisplays();

    mainWindow = new BrowserWindow({
        title: 'PLAYBACK JOE ' + app.getVersion() + ' - OPERATOR',
        icon: APP_ICON,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Cue rows keep one height: titles truncate (min ~30 chars), format/codec/resolution tags drop out,
    // runtime always stays. Below ~1080 wide the fade row would overflow; 1100 leaves room for "LOADING...".
    mainWindow.setMinimumSize(1100, 900);

    // Operator console starts in the top-left corner of the primary display (above the taskbar)
    const workArea = primaryDisplay.workArea;
    mainWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: Math.min(1350, workArea.width),
        height: Math.min(980, workArea.height)
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (outputWindow && !outputWindow.isDestroyed()) {
            outputWindow.close();
        }
        app.quit();
    });
}

if (gotSingleInstanceLock) {
    app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================================================
// IPC Handlers - Coordinated Broadcast
// ============================================================================

ipcMain.on('toggle-output-window', () => {
    // Turning the output on or off forces a kill without confirmation
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('trigger-kill');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('execute-kill');
    }

    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.close();
        outputWindow = null;
    } else {
        createOutputWindow();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
    }
});

ipcMain.on('toggle-fullscreen', () => {
    if (outputWindow && !outputWindow.isDestroyed()) {
        const isFS = outputWindow.isFullScreen();
        outputWindow.setFullScreen(!isFS);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('output-window-status', { isOpen: true, isFullScreen: !isFS });
            mainWindow.focus();
        }
    }
});

ipcMain.on('cue-video', (event, clip) => {
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('play-video', clip);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mirror-program', clip);
    }
});

ipcMain.on('program-command', (event, command, value) => {
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('program-command', command, value);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mirror-command', command, value);
    }
});

ipcMain.on('trigger-kill', () => {
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('trigger-kill');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('execute-kill');
    }
});

ipcMain.on('auto-advance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-advance-next');
    }
});

ipcMain.on('program-timeupdate', (event, currentTime, duration) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('program-timeupdate', currentTime, duration);
    }
});

ipcMain.on('audio-level-update', (event, level) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio-level-update', level);
    }
});

ipcMain.on('output-media-error', (event, info) => {
    if (!info || typeof info.url !== 'string') return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('program-media-error', {
            url: info.url,
            message: String(info.message || 'UNKNOWN MEDIA ERROR')
        });
    }
});

ipcMain.on('log-error', (event, message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('append-console-log', message);
    }
});

// File Dialogs with standard RFC URL formatting
ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Media Files', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'wav', 'aac', 'jpg', 'jpeg', 'png', 'gif'] }
        ]
    });

    if (result.canceled) return [];

    return result.filePaths.map(filePath => {
        const ext = path.extname(filePath).toLowerCase();
        let type = 'video';
        if (['.mp3', '.wav', '.aac', '.ogg', '.flac'].includes(ext)) type = 'audio';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) type = 'image';

        return {
            name: path.basename(filePath),
            url: pathToFileURL(filePath).href,
            type: type
        };
    });
});

ipcMain.handle('dialog:saveCuelist', async (event, cuelist) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Cuelist',
        defaultPath: 'cuelist.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return false;

    try {
        const cleanData = cuelist.map(c => ({
            originalName: c.originalName || c.name,
            url: c.url,
            type: c.type,
            gain: c.gain !== undefined ? c.gain : 1.0,
            fadeIn: c.fadeIn !== undefined ? c.fadeIn : 0.0,
            fadeOut: c.fadeOut !== undefined ? c.fadeOut : 0.0,
            rotation: c.rotation || 0,
            endBehavior: c.endBehavior || 'hold',
            format: c.format,
            codec: c.codec
        }));
        fs.writeFileSync(result.filePath, JSON.stringify(cleanData, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('Failed to save cuelist:', err);
        return false;
    }
});

ipcMain.handle('dialog:loadCuelist', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    try {
        const data = fs.readFileSync(result.filePaths[0], 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Failed to load cuelist:', err);
        return null;
    }
});

ipcMain.on('save-last-cuelist', (event, cuelist) => {
    try {
        const cleanData = cuelist.map(c => ({
            originalName: c.originalName || c.name,
            url: c.url,
            type: c.type,
            gain: c.gain !== undefined ? c.gain : 1.0,
            fadeIn: c.fadeIn !== undefined ? c.fadeIn : 0.0,
            fadeOut: c.fadeOut !== undefined ? c.fadeOut : 0.0,
            rotation: c.rotation || 0,
            endBehavior: c.endBehavior || 'hold',
            format: c.format,
            codec: c.codec
        }));
        // Write to a temp file then rename, so a crash or power cut mid-write can't corrupt the autosave
        const tmpPath = cuelistSavePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(cleanData, null, 2), 'utf-8');
        fs.renameSync(tmpPath, cuelistSavePath);
    } catch (err) {
        console.error('Failed to autosave cuelist:', err);
    }
});

// Starter cues for a clean install (no autosave yet): every supported file in test_clips,
// sorted by name. Packaged builds ship the folder as an extraResource next to app.asar.
// The Windows portable .exe unpacks itself to a new temp folder on every launch, so in packaged
// builds the clips are first copied to userData/test_clips and the cues point there instead,
// keeping the autosaved paths valid on the next launch.
// The cue list always follows the bundled files (not whatever is in the copy folder), and a copy
// is refreshed when its size differs, so a new version's clips replace older ones.
function starterClips() {
    const devDir = path.join(__dirname, 'test_clips');
    if (!app.isPackaged) {
        return { dir: devDir, files: fs.existsSync(devDir) ? fs.readdirSync(devDir) : [] };
    }
    const bundled = path.join(process.resourcesPath, 'test_clips');
    const stable = path.join(app.getPath('userData'), 'test_clips');
    if (!fs.existsSync(bundled)) return { dir: stable, files: [] };
    const files = fs.readdirSync(bundled);
    try {
        fs.mkdirSync(stable, { recursive: true });
        for (const file of files) {
            const source = path.join(bundled, file);
            const target = path.join(stable, file);
            if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) {
                fs.copyFileSync(source, target);
            }
        }
        return { dir: stable, files };
    } catch (err) {
        console.error('Failed to copy starter clips, using bundled copy:', err);
        return { dir: bundled, files };
    }
}

function loadStarterCues() {
    const { dir, files } = starterClips();
    const typeByExt = {
        '.mp4': 'video', '.m4v': 'video', '.webm': 'video', '.mov': 'video',
        '.mp3': 'audio', '.wav': 'audio', '.aac': 'audio',
        '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image'
    };
    try {
        if (!fs.existsSync(dir)) return null;
        const cues = files
            .filter(file => typeByExt[path.extname(file).toLowerCase()])
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            .map(file => ({
                originalName: file,
                url: pathToFileURL(path.join(dir, file)).href,
                type: typeByExt[path.extname(file).toLowerCase()],
                gain: 1.0,
                fadeIn: 0.0,
                fadeOut: 0.0,
                rotation: 0,
                endBehavior: 'hold'
            }));
        return cues.length > 0 ? cues : null;
    } catch (err) {
        console.error('Failed to load starter cues:', err);
        return null;
    }
}

ipcMain.handle('load-last-cuelist', () => {
    try {
        if (fs.existsSync(cuelistSavePath)) {
            const data = fs.readFileSync(cuelistSavePath, 'utf-8');
            return JSON.parse(data);
        }
        // No autosave at all means a clean install: start with the bundled test clips.
        // A cleared cuelist still autosaves as [], so it stays blank on the next launch.
        return loadStarterCues();
    } catch (err) {
        console.error('Failed to autoload cuelist:', err);
    }
    return null;
});
