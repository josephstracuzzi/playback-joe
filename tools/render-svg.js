// Renders an SVG to a transparent PNG at a given width using Electron's Chromium engine.
// Usage: electron main.js <input.svg> <output.png> <width>
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(process.argv.indexOf(__filename) + 1).filter(a => !a.startsWith('--'));
const [svgPath, outPath, widthArg] = args;
const targetWidth = parseInt(widthArg, 10) || 2400;

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    const svg = fs.readFileSync(svgPath, 'utf8');
    await win.loadURL('data:text/html,<html><body></body></html>');
    const dataUrl = await win.webContents.executeJavaScript(`
        new Promise((resolve, reject) => {
            const svgText = ${JSON.stringify(svg)};
            const vb = svgText.match(/viewBox="([\\d.\\s-]+)"/)[1].trim().split(/\\s+/).map(Number);
            const w = ${targetWidth}, h = Math.round(w * vb[3] / vb[2]);
            const fixed = svgText.replace(/width="100%"/, 'width="' + w + '"').replace(/height="100%"/, 'height="' + h + '"');
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas'); c.width = w; c.height = h;
                c.getContext('2d').drawImage(img, 0, 0, w, h);
                resolve(c.toDataURL('image/png'));
            };
            img.onerror = () => reject(new Error('SVG failed to load'));
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fixed);
        })`);
    fs.writeFileSync(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote', outPath);
    app.quit();
}).catch(err => { console.error(err); app.exit(1); });
