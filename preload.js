// ============================================================================
// Playback Joe - Preload Script (Security Bridge)
// Eliminates nodeIntegration: true and securely bridges IPC communication
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('playbackAPI', {
    // Window Controls
    toggleOutputWindow: () => ipcRenderer.send('toggle-output-window'),
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
    
    // Playback Engine Commands
    cueVideo: (clip) => ipcRenderer.send('cue-video', clip),
    programCommand: (command, value) => ipcRenderer.send('program-command', command, value),
    triggerKill: () => ipcRenderer.send('trigger-kill'),
    autoAdvance: () => ipcRenderer.send('auto-advance'),
    sendTimeUpdate: (currentTime, duration) => ipcRenderer.send('program-timeupdate', currentTime, duration),
    sendAudioLevel: (level) => ipcRenderer.send('audio-level-update', level),
    logError: (message) => ipcRenderer.send('log-error', message),
    reportMediaError: (info) => ipcRenderer.send('output-media-error', info),
    heartbeat: () => ipcRenderer.send('output-heartbeat'),

    // File & Cuelist Dialogs
    openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
    saveCuelistDialog: (cuelist) => ipcRenderer.invoke('dialog:saveCuelist', cuelist),
    loadCuelistDialog: () => ipcRenderer.invoke('dialog:loadCuelist'),
    saveLastCuelist: (cuelist) => ipcRenderer.send('save-last-cuelist', cuelist),
    loadLastCuelist: () => ipcRenderer.invoke('load-last-cuelist'),

    // Event Listeners (Incoming from Main Process)
    onOutputWindowStatus: (callback) => {
        const handler = (event, status) => callback(status);
        ipcRenderer.on('output-window-status', handler);
        return () => ipcRenderer.removeListener('output-window-status', handler);
    },
    onPlayVideo: (callback) => {
        const handler = (event, clip) => callback(clip);
        ipcRenderer.on('play-video', handler);
        return () => ipcRenderer.removeListener('play-video', handler);
    },
    onMirrorProgram: (callback) => {
        const handler = (event, clip) => callback(clip);
        ipcRenderer.on('mirror-program', handler);
        return () => ipcRenderer.removeListener('mirror-program', handler);
    },
    onProgramCommand: (callback) => {
        const handler = (event, command, value) => callback(command, value);
        ipcRenderer.on('program-command', handler);
        return () => ipcRenderer.removeListener('program-command', handler);
    },
    onTriggerKill: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('trigger-kill', handler);
        return () => ipcRenderer.removeListener('trigger-kill', handler);
    },
    onExecuteKill: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('execute-kill', handler);
        return () => ipcRenderer.removeListener('execute-kill', handler);
    },
    onAutoAdvanceNext: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('auto-advance-next', handler);
        return () => ipcRenderer.removeListener('auto-advance-next', handler);
    },
    onProgramTimeupdate: (callback) => {
        const handler = (event, currentTime, duration) => callback(currentTime, duration);
        ipcRenderer.on('program-timeupdate', handler);
        return () => ipcRenderer.removeListener('program-timeupdate', handler);
    },
    onAudioLevelUpdate: (callback) => {
        const handler = (event, level) => callback(level);
        ipcRenderer.on('audio-level-update', handler);
        return () => ipcRenderer.removeListener('audio-level-update', handler);
    },
    onProgramMediaError: (callback) => {
        const handler = (event, info) => callback(info);
        ipcRenderer.on('program-media-error', handler);
        return () => ipcRenderer.removeListener('program-media-error', handler);
    },
    onAppendConsoleLog: (callback) => {
        const handler = (event, message) => callback(message);
        ipcRenderer.on('append-console-log', handler);
        return () => ipcRenderer.removeListener('append-console-log', handler);
    }
});
