# Playback Joe v10.18.2 - Standalone Desktop App
Designed by Joseph Stracuzzi

![Playback Joe: operator console (left) and fullscreen output on a second display (right)](docs/screenshot-dual-display.png)

## 🚀 Complete Self-Contained Application
This package contains all necessary files to run Playback Joe natively on Windows 10/11, macOS or Linux:
- **index.html**: Operator Console window (CUE & PGM monitors, cuelist, transport controls, audio boost)
- **output.html**: Hardware-accelerated presentation window for projectors/external displays
- **main.js**: Electron main process with automatic multi-monitor routing
- **preload.js**: Hardened ContextBridge security bridge
- **package.json**: Configured with Electron 28 and electron-builder scripts
- **logo.png**: Application icon & branding

---

## 💻 Quick Start on Windows 10 / 11

### 1. Extract the ZIP
Extract this ZIP folder to any directory on your PC (e.g., `C:\PlaybackJoe`).

### 2. Open PowerShell in the folder
Hold `Shift` and right-click inside the folder, then select **Open PowerShell window here** (or open Command Prompt and `cd` to the folder):
```powershell
cd C:\PlaybackJoe
```

### 3. Install Dependencies
```powershell
npm install
```

### 4. Launch Playback Joe
```powershell
npm start
```
- If a projector or secondary monitor is connected (Windows **Win + P** -> **Extend**), the borderless Output window will automatically snap to the external display in fullscreen!
- On a single display, the Output window opens in an interactive floating window alongside the Operator Console.

---

## 📦 Build Standalone (Portable) Apps
Playback Joe ships as self-contained portable apps only: nothing to install, just run the file. Each platform's build is made on that platform (electron-builder can't build Mac apps on Windows, and the Linux AppImage needs Linux or WSL). Run `npm install` once first. Files go to the `dist/` folder.

| Platform | Run on | Command | Output |
|---|---|---|---|
| Windows | Windows | `npm run build:win` | `Playback Joe 10.18.2 Portable.exe` (single file, runs without installing) |
| macOS | a Mac | `npm run build:mac` | `.zip` containing `Playback Joe.app`, for Intel (x64) and Apple Silicon (arm64) |
| Linux | Linux (or WSL) | `npm run build:linux` | `.AppImage` (single file) and `.tar.gz` (unpack and run) |

`npm run build` builds for whatever system you run it on. The builds are not code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first launch (Windows: **More info → Run anyway**; macOS: right-click the app → **Open**). Settings, the autosaved cuelist and the starter clips are kept in the user's app-data folder, so they survive moving or replacing the app file.
