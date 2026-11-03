// Plays every clip in a folder with the app's Electron and reports whether picture and sound decode.
// Run with Electron, not node:  npx electron tools/probe-codecs.js test-media/codecs [results.json]
// (on Linux under xvfb-run, and add --no-sandbox where the system blocks Electron's sandbox).
// A video whose codec can't be decoded still plays its sound with a black picture and no error, so the
// check counts decoded frames, not just errors.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const args = process.argv.slice(process.defaultApp ? 2 : 1).filter(a => !a.startsWith('--'));
const dir = path.resolve(args[0] || path.join(__dirname, '..', 'test-media', 'codecs'));
const outFile = args[1] ? path.resolve(args[1]) : null;
const IMAGES = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
const AUDIO = ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.aiff', '.opus'];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.on('window-all-closed', () => {});

const probe = `(async (url, kind) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  if (kind === 'image') {
    const img = new Image();
    const ok = await new Promise(r => { img.onload = () => r(true); img.onerror = () => r(false); img.src = url; setTimeout(() => r(false), 5000); });
    return { picture: ok && img.naturalWidth > 0, size: img.naturalWidth + 'x' + img.naturalHeight };
  }
  const el = document.createElement(kind);
  document.body.appendChild(el);
  let err = '';
  el.onerror = () => { err = el.error ? el.error.message : 'error'; };
  el.src = url;
  const meta = await new Promise(r => { el.onloadedmetadata = () => r(true); setTimeout(() => r(false), 6000); });
  if (meta) { try { await el.play(); } catch (e) { err = err || e.message; } await wait(1500); }
  const q = el.getVideoPlaybackQuality ? el.getVideoPlaybackQuality() : null;
  const r = { picture: kind === 'video' ? !!(el.videoWidth && q && q.totalVideoFrames > 10) : null,
    sound: (el.webkitAudioDecodedByteCount || 0) > 0, size: el.videoWidth ? el.videoWidth + 'x' + el.videoHeight : '', err };
  el.pause(); el.removeAttribute('src'); el.load(); el.remove();
  return r;
})`;

app.whenReady().then(async () => {
  const page = path.join(os.tmpdir(), 'playback-joe-codec-probe.html');
  fs.writeFileSync(page, '<!doctype html><title>codec probe</title><body></body>');
  const win = new BrowserWindow({ show: false, width: 640, height: 360, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  await win.loadFile(page);
  const results = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const ext = path.extname(name).toLowerCase();
    const kind = IMAGES.includes(ext) ? 'image' : (AUDIO.includes(ext) || /audio only/i.test(name)) ? 'audio' : 'video';
    let r;
    try { r = await win.webContents.executeJavaScript(`${probe}(${JSON.stringify(pathToFileURL(path.join(dir, name)).href)}, ${JSON.stringify(kind)})`); }
    catch (e) { r = { picture: false, sound: false, err: e.message }; }
    results.push({ name, kind, ...r });
  }
  const mark = v => v === null ? '-' : v ? 'yes' : 'NO';
  console.log(`${process.platform} ${process.arch} / Electron ${process.versions.electron} / Chrome ${process.versions.chrome}`);
  console.log('FILE'.padEnd(36) + 'PICTURE  SOUND');
  for (const r of results) {
    console.log(r.name.padEnd(36) + mark(r.picture).padEnd(9) + (r.kind === 'image' ? '-' : mark(r.sound)).padEnd(7) + (r.err ? ' ' + r.err.slice(0, 70) : ''));
  }
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ platform: process.platform, arch: process.arch, electron: process.versions.electron, results }, null, 2));
  app.exit(0);
});
