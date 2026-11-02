// ============================================================================
// Playback Joe - Main Process (Production & Secure)
// Fixed: Context Isolation enabled, Preload Bridge, RFC file URLs, Safe IPC
// ============================================================================

const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');

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

// App settings that outlast a session (OUTPUT on/off), kept next to the cuelist autosave in
// userData/settings.json.
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
    try {
        const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        return (data && typeof data === 'object') ? data : {};
    } catch (err) {
        return {};
    }
}

function saveSettings(changes) {
    try {
        const tmpPath = settingsPath + '.tmp';
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(tmpPath, JSON.stringify({ ...loadSettings(), ...changes }, null, 2), 'utf-8');
        fs.renameSync(tmpPath, settingsPath);
    } catch (err) {
        console.error('Failed to save settings:', err);
    }
}

// Operator interface size (SIZE button). The output window is never scaled. The level is stored
// with the cues in the autosave and in exported cuelists: { uiScale, cues }.
const UI_SCALES = { 1: 0.85, 2: 1, 3: 1.15 };
let uiScaleLevel = 2;

function isUiScale(level) {
    return [1, 2, 3].includes(level);
}

function readSavedUiScale() {
    try {
        const level = JSON.parse(fs.readFileSync(cuelistSavePath, 'utf-8')).uiScale;
        return isUiScale(level) ? level : 2;
    } catch (err) {
        return 2;
    }
}

// Cue rows keep one height: titles truncate (min ~30 chars), format/codec/resolution tags drop out,
// runtime always stays. Below ~1080 wide the fade row would overflow; 1100 leaves room for "LOADING...".
// The minimum window scales with the interface, so the page always has at least 1100x900 to lay out in.
function applyUiScale(level) {
    const zoom = UI_SCALES[level];
    mainWindow.webContents.setZoomFactor(zoom);
    const bounds = mainWindow.getBounds();
    const { workArea } = screen.getDisplayMatching(bounds);
    const minWidth = Math.min(Math.round(1100 * zoom), workArea.width);
    const minHeight = Math.min(Math.round(900 * zoom), workArea.height);
    mainWindow.setMinimumSize(minWidth, minHeight);
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
    if (bounds.width < minWidth || bounds.height < minHeight) {
        const width = Math.max(bounds.width, minWidth);
        const height = Math.max(bounds.height, minHeight);
        mainWindow.setBounds({
            x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)),
            y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)),
            width,
            height
        });
    }
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
            sandbox: true,
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

    win.webContents.on('did-finish-load', () => {
        sendOutputStatus(win);
        // The page is listening now (the status above can also fire earlier, on entering fullscreen)
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('output-ready');
    });
}

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();

    // OUTPUT comes back the way it was left (on unless it was switched off last session)
    if (loadSettings().outputOpen !== false) createOutputWindow();
    watchDisplays();

    uiScaleLevel = readSavedUiScale();
    mainWindow = new BrowserWindow({
        title: 'PLAYBACK JOE ' + app.getVersion() + ' - OPERATOR',
        icon: APP_ICON,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            zoomFactor: UI_SCALES[uiScaleLevel],
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Operator console starts in the top-left corner of the primary display (above the taskbar)
    const workArea = primaryDisplay.workArea;
    mainWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: Math.min(1350, workArea.width),
        height: Math.min(980, workArea.height)
    });
    applyUiScale(uiScaleLevel);

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    // Tell the operator whether the output is open (it may have started switched off)
    mainWindow.webContents.on('did-finish-load', () => {
        sendOutputStatus(outputWindow);
        // Chromium can bring back an older zoom on load, so the saved scale is set again here
        mainWindow.webContents.setZoomFactor(UI_SCALES[uiScaleLevel]);
    });

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
// Input checks
// ============================================================================
// Cuelists can come from anyone's file, so a cue is rebuilt field by field before it is used or saved:
// local media files only (no web addresses), known cue types, values inside the ranges the UI allows.
const CUE_TYPES = ['video', 'audio', 'image'];
const END_BEHAVIORS = ['hold', 'advance', 'loop'];
const ROTATIONS = [0, 90, 180, 270];
const PROGRAM_COMMANDS = ['play', 'pause', 'seek', 'goto-end', 'set-points'];
const OUTPUT_AUDIO_OUT_S = 0.04; // the output's half of the crossfade when the PGM monitor takes over

function numberInRange(value, min, max, fallback) {
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function isLocalFileUrl(url) {
    if (typeof url !== 'string') return false;
    try {
        return new URL(url).protocol === 'file:';
    } catch (err) {
        return false;
    }
}

// A cue's IN / OUT points (seconds), kept only when set and valid
function cuePoints(c) {
    const points = {};
    if (Number.isFinite(c.inPoint) && c.inPoint > 0) points.inPoint = c.inPoint;
    if (Number.isFinite(c.outPoint) && c.outPoint > (points.inPoint || 0)) points.outPoint = c.outPoint;
    return points;
}

// A generated test pattern is an image cue with a `pattern` recipe. Its picture is a PNG the operator
// drew (a data: URL), never saved: the recipe is, and the picture is drawn again on load.
const PATTERN_KINDS = ['grid', 'bars', 'greyscale', 'checker', 'white', 'grey', 'red', 'green', 'blue'];
const MAX_PATTERN_URL_LENGTH = 30000000;

function cleanPattern(p) {
    if (!p || typeof p !== 'object' || !PATTERN_KINDS.includes(p.kind)) return null;
    if (!Number.isInteger(p.width) || !Number.isInteger(p.height)) return null;
    if (p.width < 16 || p.width > 7680 || p.height < 16 || p.height > 4320) return null;
    return { kind: p.kind, width: p.width, height: p.height };
}

function isPatternPicture(url) {
    return typeof url === 'string' && url.startsWith('data:image/png;base64,') && url.length <= MAX_PATTERN_URL_LENGTH;
}

// A PDF is one image cue: `pdf` holds the file and page, and its picture is the page the operator drew.
// Like a pattern, the picture is never saved; the page is drawn again on load.
const MAX_PDF_BYTES = 300 * 1024 * 1024;

function isPdfFile(url) {
    return isLocalFileUrl(url) && /\.pdf$/i.test(new URL(url).pathname);
}

function cleanPdf(p) {
    if (!p || typeof p !== 'object' || !isPdfFile(p.file)) return null;
    const page = Number.isInteger(p.page) && p.page >= 1 ? p.page : 1;
    const pages = Number.isInteger(p.pages) && p.pages >= 1 ? p.pages : 1;
    return { file: p.file, page, pages };
}

function cleanCue(c) {
    if (!c || typeof c !== 'object') return null;
    const originalName = c.originalName || c.name;
    const pattern = c.type === 'image' ? cleanPattern(c.pattern) : null;
    const pdf = c.type === 'image' ? cleanPdf(c.pdf) : null;
    const drawn = !!pattern || !!pdf;
    if (typeof originalName !== 'string' || !CUE_TYPES.includes(c.type)) return null;
    if (!drawn && !isLocalFileUrl(c.url)) return null;
    return {
        originalName: originalName.slice(0, 512),
        url: drawn ? (isPatternPicture(c.url) ? c.url : '') : c.url,
        ...(pattern ? { pattern } : {}),
        ...(pdf ? { pdf } : {}),
        type: c.type,
        gain: numberInRange(c.gain, 0, 3, 1.0),
        fadeIn: numberInRange(c.fadeIn, 0, 5, 0.0),
        fadeOut: numberInRange(c.fadeOut, 0, 5, 0.0),
        rotation: ROTATIONS.includes(c.rotation) ? c.rotation : 0,
        endBehavior: END_BEHAVIORS.includes(c.endBehavior) ? c.endBehavior : 'hold',
        ...cuePoints(c),
        format: typeof c.format === 'string' ? c.format.slice(0, 40) : undefined,
        codec: typeof c.codec === 'string' ? c.codec.slice(0, 40) : undefined
    };
}

// What goes into a cuelist file: a pattern or PDF keeps its recipe, not its picture
function cueForSaving(c) {
    const cue = cleanCue(c);
    if (cue && (cue.pattern || cue.pdf)) cue.url = '';
    return cue;
}

// Cuelist files before 10.27.3 are a plain list of cues
function cuesInFile(data) {
    return Array.isArray(data) ? data : data?.cues;
}

function cuelistFileText(cues) {
    return JSON.stringify({ uiScale: uiScaleLevel, cues }, null, 2);
}

// Write to a temp file then rename, so a crash or power cut mid-write can't corrupt the autosave
function writeAutosave(cues) {
    const tmpPath = cuelistSavePath + '.tmp';
    fs.writeFileSync(tmpPath, cuelistFileText(cues), 'utf-8');
    fs.renameSync(tmpPath, cuelistSavePath);
}

// Cues read from a file: anything refused is reported in the operator's console
function cleanLoadedCuelist(data, label) {
    if (!Array.isArray(data)) {
        notifyOperator(`${label}: NOT A CUELIST FILE. NOTHING LOADED.`);
        return null;
    }
    const cues = data.map(cleanCue).filter(Boolean);
    const skipped = data.length - cues.length;
    if (skipped > 0) notifyOperator(`${label}: ${skipped} CUE(S) SKIPPED (NOT A VALID CUE OR NOT A LOCAL MEDIA FILE).`);
    return cues;
}

function fromOperator(event) {
    return !!mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function fromOutput(event) {
    return !!outputWindow && !outputWindow.isDestroyed() && event.sender === outputWindow.webContents;
}

// ============================================================================
// IPC Handlers - Coordinated Broadcast
// ============================================================================

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-ui-scale', () => uiScaleLevel);

ipcMain.on('set-ui-scale', (event, level) => {
    if (!fromOperator(event) || !isUiScale(level)) return;
    uiScaleLevel = level;
    applyUiScale(level);
    // Rewrites the autosave's own cues, as the operator's list may not have loaded yet
    try {
        if (!fs.existsSync(cuelistSavePath)) return;
        const cues = cuesInFile(JSON.parse(fs.readFileSync(cuelistSavePath, 'utf-8')));
        if (Array.isArray(cues)) writeAutosave(cues);
    } catch (err) {
        console.error('Failed to save the interface size:', err);
    }
});

ipcMain.on('toggle-output-window', (event, opts) => {
    if (!fromOperator(event)) return;
    // With nothing live, turning the output on or off forces a kill without confirmation.
    // Off with a cue live ({ handoff: true }): the operator's PGM monitor has already taken over
    // the picture and sound, so the output just closes and the operator is left playing.
    // On with a cue live ({ handback: true }): no kill either; the PGM monitor keeps playing until
    // the new output has picked the cue up (resume-output / output-resumed below).
    const outputIsOpen = !!outputWindow && !outputWindow.isDestroyed();
    const keepPlaying = !!opts && (outputIsOpen ? !!opts.handoff : !!opts.handback);
    if (!keepPlaying) {
        if (outputWindow && !outputWindow.isDestroyed()) {
            outputWindow.webContents.send('trigger-kill');
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('execute-kill');
        }
    }

    if (outputWindow && !outputWindow.isDestroyed()) {
        const closing = outputWindow;
        outputWindow = null;
        if (keepPlaying) {
            // The PGM monitor is fading up: fade the output's sound down, then close it (no cut)
            closing.webContents.send('program-command', 'audio-out', OUTPUT_AUDIO_OUT_S);
            setTimeout(() => { if (!closing.isDestroyed()) closing.close(); }, OUTPUT_AUDIO_OUT_S * 1000 + 20);
        } else {
            closing.close();
        }
        saveSettings({ outputOpen: false });
    } else {
        createOutputWindow();
        saveSettings({ outputOpen: true });
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
    }
});

ipcMain.on('toggle-fullscreen', (event) => {
    if (!fromOperator(event)) return;
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
    if (!fromOperator(event)) return;
    const cue = cleanCue(clip);
    if (!cue || !cue.url) {
        notifyOperator('TAKE REFUSED BY THE OUTPUT: NOT A VALID CUE OR NOT A LOCAL MEDIA FILE.');
        return;
    }
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('play-video', cue);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mirror-program', cue);
    }
});

// OUTPUT turned on with a cue live: the new output picks the cue up mid-way
ipcMain.on('resume-output', (event, state) => {
    if (!fromOperator(event) || !state) return;
    const cue = cleanCue(state.clip);
    if (!cue || !cue.url || !(Number.isFinite(state.position) && state.position >= 0)) return;
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('resume-video', {
            clip: cue,
            position: state.position,
            paused: !!state.paused,
            preroll: !!state.preroll,
            operatorPaused: !!state.operatorPaused,
            atEnd: !!state.atEnd,
            level: numberInRange(state.level, 0, 1, 1),
            token: numberInRange(state.token, 0, Number.MAX_SAFE_INTEGER, 0)
        });
    }
});

ipcMain.on('start-output', (event, state) => {
    if (!fromOperator(event) || !state) return;
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('start-output', {
            level: numberInRange(state.level, 0, 1, 1),
            fadeInLeft: numberInRange(state.fadeInLeft, 0, 5, 0),
            fadingOut: !!state.fadingOut,
            token: numberInRange(state.token, 0, Number.MAX_SAFE_INTEGER, 0)
        });
    }
});

ipcMain.on('output-resumed', (event, token) => {
    if (!fromOutput(event) || !Number.isFinite(token)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('output-resumed', token);
    }
});

// A live PDF cue changed page: straight to the output, as the operator already has the picture
ipcMain.on('show-page', (event, url) => {
    if (!fromOperator(event) || !isPatternPicture(url)) return;
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('show-page', url);
    }
});

ipcMain.on('program-command', (event, command, value) => {
    if (!fromOperator(event) || !PROGRAM_COMMANDS.includes(command)) return;
    if ((command === 'seek' || command === 'goto-end') && !(Number.isFinite(value) && value >= 0)) return;
    const payload = command === 'set-points' ? cuePoints(value || {}) : value;
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('program-command', command, payload);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mirror-command', command, payload);
    }
});

ipcMain.on('trigger-kill', (event) => {
    if (!fromOperator(event)) return;
    if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.webContents.send('trigger-kill');
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('execute-kill');
    }
});

ipcMain.on('auto-advance', (event) => {
    if (!fromOutput(event)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('auto-advance-next');
    }
});

ipcMain.on('program-timeupdate', (event, currentTime, duration) => {
    if (!fromOutput(event) || !Number.isFinite(currentTime) || !Number.isFinite(duration)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('program-timeupdate', currentTime, duration);
    }
});

ipcMain.on('audio-level-update', (event, level) => {
    if (!fromOutput(event) || !Number.isFinite(level)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('audio-level-update', level);
    }
});

ipcMain.on('output-media-error', (event, info) => {
    if (!fromOutput(event) || !info || typeof info.url !== 'string') return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('program-media-error', {
            url: info.url,
            message: String(info.message || 'UNKNOWN MEDIA ERROR').slice(0, 500)
        });
    }
});

ipcMain.on('log-error', (event, message) => {
    if (!fromOutput(event)) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('append-console-log', String(message).slice(0, 500));
    }
});

// File Dialogs with standard RFC URL formatting
ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Media Files', extensions: ['mp4', 'm4v', 'webm', 'mov', 'mp3', 'wav', 'aac', 'jpg', 'jpeg', 'png', 'gif', 'pdf'] }
        ]
    });

    if (result.canceled) return [];

    return result.filePaths.map(filePath => {
        const ext = path.extname(filePath).toLowerCase();
        let type = 'video';
        if (['.mp3', '.wav', '.aac', '.ogg', '.flac'].includes(ext)) type = 'audio';
        else if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'].includes(ext)) type = 'image';

        return {
            name: path.basename(filePath),
            url: pathToFileURL(filePath).href,
            type: type
        };
    });
});

ipcMain.handle('dialog:saveCuelist', async (event, cuelist) => {
    if (!fromOperator(event) || !Array.isArray(cuelist)) return false;
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Cuelist',
        defaultPath: 'cuelist.json',
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return false;

    try {
        const cleanData = cuelist.map(cueForSaving).filter(Boolean);
        fs.writeFileSync(result.filePath, cuelistFileText(cleanData), 'utf-8');
        return true;
    } catch (err) {
        console.error('Failed to export cuelist:', err);
        return false;
    }
});

ipcMain.handle('dialog:loadCuelist', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Cuelist',
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    try {
        const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
        const cues = cleanLoadedCuelist(cuesInFile(data), 'IMPORT');
        return cues && { cues, uiScale: isUiScale(data.uiScale) ? data.uiScale : null };
    } catch (err) {
        console.error('Failed to import cuelist:', err);
        notifyOperator('IMPORT: THAT FILE COULD NOT BE READ AS A CUELIST.');
        return null;
    }
});

ipcMain.on('save-last-cuelist', (event, cuelist) => {
    if (!fromOperator(event) || !Array.isArray(cuelist)) return;
    try {
        writeAutosave(cuelist.map(cueForSaving).filter(Boolean));
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
        if (cues.length === 0) return null;
        // A generator cue preset to colour bars; the operator draws its picture from the recipe on load
        cues.push({
            originalName: 'GENERATOR - COLOUR BARS.png',
            url: '',
            type: 'image',
            pattern: { kind: 'bars', width: 1920, height: 1080 },
            gain: 1.0,
            fadeIn: 0.0,
            fadeOut: 0.0,
            rotation: 0,
            endBehavior: 'hold'
        });
        return cues;
    } catch (err) {
        console.error('Failed to load starter cues:', err);
        return null;
    }
}

// The bytes of a PDF cue's file, for the operator to draw pages from
ipcMain.handle('read-pdf', (event, url) => {
    if (!fromOperator(event) || !isPdfFile(url)) return null;
    try {
        const file = fileURLToPath(url);
        if (fs.statSync(file).size > MAX_PDF_BYTES) return null;
        return fs.readFileSync(file);
    } catch (err) {
        console.error('Failed to read PDF:', err);
        return null;
    }
});

// The bundled Grid and Sync Test, for the TEST PATTERNS list
ipcMain.handle('get-starter-cues', () => loadStarterCues() || []);

// The logo for generated patterns (grid-logo.png, rendered from logo.svg by tools/render-svg.js, so the
// app needs no font for it)
ipcMain.handle('get-pattern-logo', () => {
    try {
        return 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'grid-logo.png')).toString('base64');
    } catch (err) {
        console.error('Failed to read the pattern logo:', err);
        return null;
    }
});

ipcMain.handle('load-last-cuelist', () => {
    try {
        if (fs.existsSync(cuelistSavePath)) {
            const data = fs.readFileSync(cuelistSavePath, 'utf-8');
            return cleanLoadedCuelist(cuesInFile(JSON.parse(data)), 'AUTOSAVE');
        }
        // No autosave at all means a clean install: start with the bundled test clips.
        // A cleared cuelist still autosaves as [], so it stays blank on the next launch.
        return loadStarterCues();
    } catch (err) {
        console.error('Failed to autoload cuelist:', err);
    }
    return null;
});
