// ============================================================================
// Playback Joe - WEB VIDEO cues (shared by main.js, the operator console and the output)
// A web video cue (type 'webvideo') plays a YouTube or Vimeo link, or a direct link to a video file, on the
// output with no site buttons on it, driven from the console like a video cue. It plays while on air and
// pauses off air; RESTART starts it from the top on every TAKE, RESUME carries on where it stopped.
// clip.webvideo = { link (what was pasted), kind ('youtube' | 'vimeo' | 'file'), id, hash, start }
// clip.url = the player page the output loads (playerUrl()).
// ============================================================================
(function (global) {
    const FILE_EXT = /\.(mp4|m4v|mov|webm|ogv)$/i;
    const YT_ID = /^[A-Za-z0-9_-]{11}$/;

    // What a pasted link points at, or null. A link without a scheme gets https://
    function parseLink(text) {
        let t = String(text || '').trim();
        if (!t) return null;
        if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
        let u;
        try { u = new URL(t); } catch (err) { return null; }
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
        const host = u.hostname.replace(/^(www|m|music)\./, '');
        const parts = u.pathname.split('/').filter(Boolean);
        if (host === 'youtu.be' && YT_ID.test(parts[0] || '')) return { link: u.href, kind: 'youtube', id: parts[0], hash: '' };
        if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            const id = u.searchParams.get('v') || (['embed', 'shorts', 'live', 'v'].includes(parts[0]) ? parts[1] : '');
            if (YT_ID.test(id || '')) return { link: u.href, kind: 'youtube', id, hash: '' };
            return null;
        }
        if (host === 'vimeo.com' || host === 'player.vimeo.com') {
            const p = host === 'player.vimeo.com' ? parts.slice(1) : parts;
            const i = p.findIndex(s => /^\d+$/.test(s));
            if (i === -1) return null;
            const next = p[i + 1] || '';
            const hash = u.searchParams.get('h') || (/^[0-9a-f]{6,}$/i.test(next) ? next : '');
            return { link: u.href, kind: 'vimeo', id: p[i], hash };
        }
        if (FILE_EXT.test(u.pathname)) return { link: u.href, kind: 'file', id: '', hash: '' };
        return null;
    }

    // The page the output loads: the site's bare player, with its own buttons and suggestions off
    function playerUrl(w) {
        if (!w) return '';
        if (w.kind === 'youtube') {
            return `https://www.youtube.com/embed/${w.id}?autoplay=0&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0&playsinline=1&cc_load_policy=0`;
        }
        if (w.kind === 'vimeo') {
            return `https://player.vimeo.com/video/${w.id}?${w.hash ? `h=${w.hash}&` : ''}autoplay=0&controls=0&title=0&byline=0&portrait=0&dnt=1&keyboard=0`;
        }
        return w.link;
    }

    // A still for the console's monitors (YouTube only; the others show their address)
    function thumbnailUrl(w) {
        return w && w.kind === 'youtube' ? `https://i.ytimg.com/vi/${w.id}/hqdefault.jpg` : '';
    }

    function kindLabel(w) {
        return { youtube: 'YOUTUBE', vimeo: 'VIMEO', file: 'VIDEO LINK' }[w && w.kind] || 'WEB VIDEO';
    }

    // Put into the player page by the output: one small controller (window.__pjv) for the three kinds of
    // player, and a style that hides every site button, title, logo and end screen on the picture.
    const CONTROLLER = `(() => {
        if (window.__pjv) return true;
        const css = document.createElement('style');
        css.textContent = [
            'html, body { background: #000 !important; cursor: none !important; overflow: hidden !important; }',
            'video { object-fit: contain !important; background: #000 !important; }',
            'video::-webkit-media-controls, video::-webkit-media-controls-enclosure { display: none !important; }',
            '.ytp-chrome-top, .ytp-chrome-bottom, .ytp-gradient-top, .ytp-gradient-bottom, .ytp-pause-overlay, .ytp-watermark,',
            '.ytp-large-play-button, .ytp-spinner, .ytp-ce-element, .ytp-endscreen-content, .ytp-videowall-still, .ytp-show-cards-title,',
            '.ytp-paid-content-overlay, .ytp-cards-teaser, .ytp-cards-button, .iv-branding, .ytp-title, .ytp-impression-link,',
            '.ytp-youtube-button, .ytp-contextmenu, .ytp-tooltip, .ytp-bezel, .ytp-bezel-text-wrapper, .ytp-doubletap-ui-legacy,',
            '.vp-controls, .vp-controls-wrapper, .vp-title, .vp-sidedock, .vp-badge, .vp-overlay-wrapper, .vp-preview, .vp-outro-wrapper, .vp-spin',
            '{ display: none !important; }',
            '.ytp-cued-thumbnail-overlay { display: none !important; }',
            // Everything YouTube lays over the picture (current and future buttons, titles, logos, suggestions):
            // only the video itself is left in the player
            '#movie_player > *:not(.html5-video-container), .html5-video-container > *:not(video) { display: none !important; }',
            '#movie_player { background: #000 !important; }',
            // The video itself is lifted into the page's top layer, above anything the site draws (its buttons can
            // live anywhere in the page and change names), and fills the screen
            'video[data-pj-top] { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;',
            '  max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important;',
            '  transform: none !important; object-fit: contain !important; background: #000 !important; display: block !important;',
            '  opacity: 1 !important; visibility: visible !important; overflow: hidden !important; }',
            'video[data-pj-top]::backdrop { background: #000; }'
        ].join('\\n');
        (document.head || document.documentElement).appendChild(css);
        const yt = () => { const p = document.getElementById('movie_player'); return p && typeof p.getPlayerState === 'function' ? p : null; };
        const vid = () => { let best = null; document.querySelectorAll('video').forEach(v => { if (!best || v.videoWidth * v.videoHeight > best.videoWidth * best.videoHeight) best = v; }); return best; };
        let lifted = null;
        const lift = () => {
            const v = vid();
            if (!v) return;
            if (lifted && lifted !== v) { lifted.removeAttribute('data-pj-top'); try { lifted.hidePopover(); } catch (e) {} }
            lifted = v;
            v.setAttribute('data-pj-top', '');
            if (!v.hasAttribute('popover')) v.setAttribute('popover', 'manual');
            try { if (!v.matches(':popover-open')) v.showPopover(); } catch (e) { /* stays a fixed, full-screen element */ }
        };
        const errorText = () => {
            const e = document.querySelector('.ytp-error, .vp-error, .player-error');
            if (!e || e.offsetParent === null) return '';
            return (e.innerText || 'VIDEO UNAVAILABLE').replace(/\\s+/g, ' ').trim().slice(0, 160);
        };
        window.__pjv = {
            play() { lift(); const p = yt(); if (p) p.playVideo(); else { const v = vid(); if (v) v.play().catch(() => {}); } },
            pause() { const p = yt(); if (p) p.pauseVideo(); const v = vid(); if (v) v.pause(); },
            seek(t) { const p = yt(); if (p) p.seekTo(Math.max(0, t), true); else { const v = vid(); if (v) v.currentTime = Math.max(0, t); } },
            volume(x) {
                const p = yt(); if (p) { p.unMute(); p.setVolume(Math.round(x * 100)); }
                const v = vid(); if (v) { v.muted = false; v.volume = x; }
            },
            status() {
                lift();
                const err = errorText();
                const p = yt();
                const v = vid();
                if (p) {
                    const st = p.getPlayerState();
                    const data = typeof p.getVideoData === 'function' ? p.getVideoData() : null;
                    return { ready: st !== -1 || (v && v.readyState >= 1), t: p.getCurrentTime() || 0, d: p.getDuration() || 0, playing: st === 1, paused: st === 2 || st === 5 || st === -1, ended: st === 0, title: data && data.title || '', error: err };
                }
                if (v) return { ready: v.readyState >= 2, t: v.currentTime || 0, d: Number.isFinite(v.duration) ? v.duration : 0, playing: !v.paused && !v.ended && v.readyState >= 3, paused: v.paused, ended: v.ended, title: '', error: err || (v.error ? 'VIDEO COULD NOT BE PLAYED' : '') };
                return { ready: false, t: 0, d: 0, playing: false, paused: true, ended: false, title: '', error: err };
            }
        };
        return true;
    })()`;

    const api = { parseLink, playerUrl, thumbnailUrl, kindLabel, CONTROLLER };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else global.PlaybackWebVideo = api;
})(typeof window !== 'undefined' ? window : globalThis);
