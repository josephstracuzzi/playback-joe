# Playback Joe
Designed by Joseph Stracuzzi

**Cue-based video, audio and image playback for live shows.** Line up your media in a cuelist, preview the next cue, and TAKE it to a clean fullscreen output on your projector or second screen, while you keep full control from the operator console.

![Playback Joe: operator console (left) and fullscreen output on a second display (right)](docs/screenshot-dual-display.png)

---

## ⬇️ Download
Get the latest version from the **[Releases page](https://github.com/josephstracuzzi/playback-joe/releases/latest)**. Playback Joe is a portable app: nothing to install, just download and run.

| System | Download | How to run |
|---|---|---|
| Windows 10 / 11 (64-bit) | `Playback Joe <version> Portable.exe` | Double-click it. |
| Linux (x64) | `playback-joe-<version>.tar.gz` | Unpack it, then start `./playback-joe` from that folder. |
| macOS 10.15 or later (experimental) | `Playback Joe <version> Mac Apple Silicon.zip` (M1 and newer) or `Playback Joe <version> Mac Intel.zip` | Unzip it and move **Playback Joe** to Applications. |

The apps are not code-signed, so on first launch Windows SmartScreen says "Windows protected your PC". Click **More info → Run anyway**.

On a Mac, the first time you open it macOS says it can't check the app. Go to **System Settings → Privacy & Security** and click **Open Anyway**. If macOS says the app "is damaged", run `xattr -cr "/Applications/Playback Joe.app"` in Terminal once. If the menu bar shows over the fullscreen output, go to **System Settings → Control Center** and set **Automatically hide and show the menu bar** to **In Full Screen Only** (on older macOS, tick **Automatically hide and show the menu bar in full screen** under **Dock & Menu Bar**). The Mac version is new and hasn't been tested at a show yet.

On some Linux systems, Ubuntu 24.04 for example, the app stops at launch with a message about `chrome-sandbox`. Fix it once from the app's folder with `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox`, or start it with `./playback-joe --no-sandbox` instead.

Your settings, your autosaved cuelist and the starter clips are kept in your app-data folder (`%APPDATA%\playback-joe` on Windows, `~/.config/playback-joe` on Linux), so they stay put when you move or replace the app file.

---

## ✨ Features

### Two windows, one show
- **Operator console** with the cuelist, a **CUE** monitor (what's next) and a **PGM** monitor (what's live).
- **Output window** that shows only your media, with no borders or controls. With a second display connected it opens fullscreen there automatically. On a single screen it opens as a 16:9 window you can move around.
- **FULLSCREEN** switches the output instantly between filling its screen and a small 16:9 window, without reloading, so a playing cue carries on.
- **DISPLAY** picks which screen gets the output (AUTO uses the second screen).
- Plug in or unplug a projector mid-show and the output moves to the right screen without stopping playback.
- At launch the console and the output appear together, once both are ready, so nothing half-drawn flashes on the projector.

### Cuelist
- Add video, audio, images and PDFs: **MP4, M4V, MOV, WEBM, MP3, WAV, AAC, M4A, FLAC, OGG, JPG, PNG, GIF, WEBP, BMP, PDF**. See [Supported formats](#-supported-formats) for which codecs play.
- Each cue shows its type, resolution, codec and running time.
- Per-cue **end behaviour**: **HOLD** on the last frame, **LOOP**, or **ADV**ance to the next cue.
- Per-cue **fade in and fade out** for both picture and sound.
- Per-cue **volume from 0 to 300%**, with a centre detent at 100%.
- Reorder cues with ▲▼, **IMPORT** and **EXPORT** cuelists, and everything is **autosaved** so you pick up where you left off.
- CLEAR, IMPORT, EXPORT and ADD MEDIA lock while a cue is live, so a stray click can't wreck the show.

### Playback control
- **TAKE** puts the selected cue on air. **KILL** fades picture and sound to black over a second.
- **PLAY / PAUSE**, a scrub bar, and **GO TO 20 / GO TO 10** to jump to 20 or 10 seconds before the end for rehearsals.
- **PAUSE** with nothing live puts the selected video or audio cue on air already paused, without playing a frame, so you can scrub it and set IN / OUT first.
- **Frame-accurate IN / OUT points per cue**: step to a frame with ◀| |▶ and press **IN** or **OUT**. The cue then starts at IN and ends at OUT, and its fades, HOLD, ADV and LOOP all follow the points. A trimmed cue shows its running time in blue; double-click it to clear the points.
- Large **elapsed and remaining timecode** and an audio level meter.

<img src="docs/feature-in-out.png" width="467" alt="Timecode panel with IN at 00:00:08, OUT at 00:00:45, and a blue strip under the scrub bar marking the range">

### Built for live use
- If a media file is missing or won't play, the output cuts to black, the cue turns red and the problem is logged, instead of the show freezing.
- A video whose picture can't be played on this computer (ProRes, for example) turns red when you add it, and TAKE won't put it on air, so it can't go out as sound over a black screen.
- If the output window crashes or hangs, it is replaced automatically.
- Switch **OUTPUT** off in the middle of a cue and the operator's PGM monitor takes over the picture and sound where the output left off. Switch it back on and the output picks the cue up again. OUTPUT on/off is remembered for the next launch.
- Only one copy of the app runs at a time, so a double-click can't open a second set of windows.
- A built-in **CONSOLE** shows a log of what happened.
- **SIZE** makes the operator console **SMALL**, **DEFAULT** or **LARGE**. The output is never affected. The size is saved with the autosave and with exported cuelists, so it comes back at the next launch or IMPORT.

<img src="docs/feature-size.png" width="342" alt="SIZE list open with SMALL, DEFAULT and LARGE, next to the CONSOLE, OUTPUT and FULLSCREEN buttons">

### Keyboard shortcuts
| Key | Action |
|---|---|
| **↑ / ↓** | Select the previous / next cue |
| **Enter**, **Numpad Enter** or **Space** | TAKE |
| **Esc** or **Backspace** | KILL |
| **-** / **+** | Previous / next page on a live PDF cue (main keyboard or numpad) |

### PDF slides
Add a **PDF** with ADD MEDIA and it becomes one cue. Pick a page from its dropdown, or step with **◀ PREV** and **NEXT ▶**, or press **-** and **+** (main keyboard or numpad) while it's live. Pages cut instantly on the output. For a PowerPoint deck, export it as a PDF first. Animations, transitions and embedded video don't carry over.

<img src="docs/feature-pdf-cue.png" width="738" alt="A PDF cue on page 3 of 6, with its page list open and PREV and NEXT buttons beside it">

### Test patterns
The **PATTERN** list next to CLEAR adds a test cue to the cuelist: the bundled **Grid** or **Sync Test**, or a **Generator** cue. A generator cue is a normal cue with its own pattern and size pickers: grid, colour bars, greyscale, checkerboard or a solid colour, from 720p to 4K.

### Clock
**PATTERN → CLOCK** adds a live clock cue. **SET** on the cue opens its settings: the mode, each in its own colour (**TIME OF DAY** in 12H or 24H, with or without seconds and the date; **COUNTDOWN**, a set length from TAKE typed as HH:MM:SS; **COUNTDOWN TO**, a target time of day such as doors at 19:30; or **COUNT UP**), and an optional label above the clock. What a countdown does at zero is set with the cue's HOLD / ADV / LOOP badges, like any cue (a clock with no end only holds). Countdowns turn amber in the last minute and red in the last 10 seconds, and PLAY, PAUSE, GO TO 20 / 10, fades and OUTPUT on / off all work with them.

### Webcam
**ADD MEDIA → WEBCAM** adds a live camera cue. Pick the camera on the cue, and a separate **SOUND** input if you want sound (NONE by default), for example a mixer feed instead of the camera's own microphone. Sound goes through the cue's volume fader and the meter. If the camera or sound input isn't connected, the cue turns red and won't TAKE. On a Mac, allow the camera and microphone the first time macOS asks.

### When a cue can't play
If TAKE is refused (a missing or unplayable file, a web cue with OUTPUT off, a PDF still loading), or a cue fails while on air, a popup names the cue and says why. Enter, Space and Esc keep working with it open, the next TAKE that goes ahead closes it, and the CONSOLE keeps the full list.

### Webvideo
**ADD MEDIA → WEBVIDEO** adds a YouTube or Vimeo link, or a direct link to a video file (MP4, M4V, MOV, WEBM). It plays on the output as a clean picture, with no site buttons, titles or suggestions, and the console drives it like a video cue: PLAY, PAUSE, scrubbing, frame steps, IN / OUT points, GO TO 20 / 10, timecode, HOLD / ADV / LOOP, fades and volume (up to 100%). Webvideos and webpages play on the output only: with OUTPUT off, TAKE refuses them and says so in the console. It loads on the output as soon as it's added, reads its title and length, plays when taken and pauses when it goes off air. The ⏮ / ⏯ badge on the cue picks **RESTART** (every TAKE starts from the top) or **RESUME** (carries on where it stopped). The CUE and PGM monitors show YouTube's still image, or the link for the others. The site's own ads, if any, still play. A video that can't be played (removed, private, or not allowed to be embedded) turns the cue red.

### Webpage
**ADD MEDIA → WEBPAGE** adds a web page cue, for example Slido, Canva or Google Slides, or a live data page: type an address (http or https) or pick a local **.html** file. The page starts running on the output as soon as the cue is added, hidden and muted while it's off air, so live data keeps updating. On TAKE it appears with the cue's fade in and volume (up to 100%; a new webpage cue starts with its fader down); KILL or the next TAKE hides and mutes it again, without closing it. It can be clicked, scrolled and typed into **on the output screen only**; the CUE and PGM monitors show its address. A page's own fullscreen or Present button fills the output screen, and it stays fullscreen while off air (Esc on the page leaves it). Links that would open a new window open in place. A page that can't load turns the cue red when taken, and is tried again on the next TAKE. OUTPUT off and on reloads the pages. While the output window has the keyboard, a banner on the console warns that Enter, Space and Esc go to the page until you click back on the console. Pages can't use the camera, microphone or other permissions, and can't reach the app.

<img src="docs/feature-test-patterns.png" width="738" alt="A generator cue with its pattern list open, showing grid, colour bars, greyscale, checkerboard and solid colours">

### Starter cues
A fresh install opens with three test cues made for Playback Joe:
- **Grid - Playback Joe - 1920x1080**: a projector alignment grid with labelled rows and columns, centre cross and circles.
- **Sync Test - Playback Joe - 1920x1080x30p**: a one-frame flash with a beep every second, alternating left and right, for checking audio/video sync and speaker channels.
- **Generator - Colour Bars**: a generator cue set to colour bars. Change its pattern or size right on the cue.

---

## 🎞️ Supported formats
Tested with short clips in every format below, on Windows, macOS and Linux.

**Video**

| Codec | File types | Windows | macOS | Linux |
|---|---|---|---|---|
| H.264 (8-bit, 10-bit, 4:2:2, up to 4K) | MP4, M4V, MOV | ✅ | ✅ | ✅ |
| VP9 (8-bit and 10-bit), VP8 | WEBM | ✅ | ✅ | ✅ |
| AV1 | MP4, WEBM | ✅ | ✅ | ✅ |
| HEVC / H.265 | MP4, MOV | ✅ on most PCs (needs hardware support) | ⚠️ depends on the Mac | ❌ |
| ProRes, DNxHD / DNxHR, MJPEG, MPEG-2, MPEG-4 Part 2 | MOV, MP4 | ❌ | ❌ | ❌ |

A video that can't be played is marked red with **MEDIA ERROR** as soon as you add it. To use it, convert it to H.264 MP4 first (with HandBrake or Shutter Encoder, for example).

**Audio** (the same on every system)
- ✅ AAC (AAC, M4A, or inside MP4 / MOV), MP3, WAV (16-bit, 24-bit, 32-bit float), FLAC, OGG Vorbis, and Opus or Vorbis in WEBM
- ❌ AC3 / Dolby Digital (the picture plays but is silent), ALAC, AIFF

**Images:** JPG, PNG, GIF (animated too), WEBP, BMP, and PDF pages.

---

## 🛠️ Building from source (developers)
You only need this if you want to change the code. Install [Node.js](https://nodejs.org/), then in the project folder:

```bash
npm install
npm start
```

To make the portable apps yourself, run `npm run build:win` on Windows, `npm run build:linux` on Linux, or `npm run build:mac` on a Mac. The files go to the `dist/` folder.

To check which formats play on a computer, build the test clips with `tools/make-codec-clips.ps1` (needs ffmpeg, and PowerShell 7 on macOS or Linux), then run `npx electron tools/probe-codecs.js test-media/codecs`.
