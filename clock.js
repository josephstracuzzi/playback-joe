// ============================================================================
// Playback Joe - CLOCK cues (shared by the operator console and the output)
// A clock cue has no file: it's drawn live on a 1920x1080 canvas from its settings (clip.clock).
// ClockRunner keeps its time like a media file (elapsed, duration, play / pause / seek, end), so the
// console's timecode, GO TO 20 / 10, fades, HOLD / ADV / LOOP and the OUTPUT hand-off all work with it.
// ============================================================================
(function (global) {
    const CLOCK_MODES = [
        ['time', 'TIME OF DAY'],
        ['countdown', 'COUNTDOWN'],
        ['until', 'COUNTDOWN TO'],
        ['countup', 'COUNT UP']
    ];
    const WIDTH = 1920;
    const HEIGHT = 1080;
    const FONT = '"Consolas", "DejaVu Sans Mono", "Menlo", monospace';

    function defaultClock() {
        return { mode: 'time', duration: 300, target: '19:30', h24: false, seconds: true, date: false, label: '' };
    }

    function modeLabel(mode) {
        return (CLOCK_MODES.find(m => m[0] === mode) || CLOCK_MODES[0])[1];
    }

    const pad = n => String(n).padStart(2, '0');

    // 75 -> "1:15", 3725 -> "1:02:05"; without seconds 3725 -> "1:02"
    function formatSpan(total, withSeconds) {
        total = Math.max(0, Math.floor(total));
        const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
        if (!withSeconds) return `${h}:${pad(m)}`;
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    }

    // Seconds from `from` to the next HH:MM today; 0 once it has passed (a show time doesn't roll over)
    function secondsUntil(target, from) {
        const [h, m] = String(target || '').split(':').map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
        const at = new Date(from);
        at.setHours(h, m, 0, 0);
        return Math.max(0, (at - from) / 1000);
    }

    // How long a clock runs: a COUNTDOWN its length, COUNTDOWN TO the time left until its target when it
    // starts; TIME OF DAY and COUNT UP have no end (0)
    function clockDuration(s, from = new Date()) {
        if (s.mode === 'countdown') return Math.max(1, s.duration || 0);
        if (s.mode === 'until') return secondsUntil(s.target, from);
        return 0;
    }

    function hasEnd(s) {
        return s.mode === 'countdown' || s.mode === 'until';
    }

    // The cue's name in the cuelist, e.g. "CLOCK - COUNTDOWN 5:00"
    function clockName(s) {
        if (s.mode === 'countdown') return `CLOCK - COUNTDOWN ${formatSpan(s.duration, true)}`;
        if (s.mode === 'until') return `CLOCK - COUNTDOWN TO ${s.target}`;
        if (s.mode === 'countup') return 'CLOCK - COUNT UP';
        return `CLOCK - TIME OF DAY ${s.h24 ? '24H' : '12H'}`;
    }

    function timeOfDay(s, now) {
        let h = now.getHours();
        let suffix = '';
        if (!s.h24) {
            suffix = h < 12 ? 'AM' : 'PM';
            h = h % 12 || 12;
        }
        const main = s.h24 ? pad(h) + ':' + pad(now.getMinutes()) : h + ':' + pad(now.getMinutes());
        return { main: s.seconds ? `${main}:${pad(now.getSeconds())}` : main, suffix };
    }

    const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

    // Draws the clock: black background, optional label above, the time in large digits, and (time of day)
    // an optional date below. Countdowns turn amber in the last minute and red in the last 10 seconds.
    function drawClock(ctx, s, elapsed, duration, now = new Date()) {
        ctx.save();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let main, suffix = '', colour = '#ffffff';
        if (s.mode === 'time') {
            ({ main, suffix } = timeOfDay(s, now));
        } else if (hasEnd(s)) {
            const left = Math.max(0, duration - elapsed);
            main = formatSpan(Math.ceil(left - 0.001), s.seconds !== false || left < 60);
            if (left <= 10 && duration > 0) colour = '#ef4444';
            else if (left <= 60 && duration > 0) colour = '#f59e0b';
        } else {
            main = formatSpan(elapsed, s.seconds !== false);
        }

        // As large as fits in 86% of the width (and 46% of the height)
        let size = 520;
        ctx.font = `bold ${size}px ${FONT}`;
        const suffixGap = suffix ? 0.42 : 0;
        const measure = () => ctx.measureText(main).width * (1 + suffixGap * 0.55);
        size = Math.min(size * (WIDTH * 0.86) / measure(), HEIGHT * 0.46);
        ctx.font = `bold ${size}px ${FONT}`;
        const mainWidth = ctx.measureText(main).width;
        const centreY = HEIGHT * 0.5 + (s.label ? size * 0.08 : 0) - (s.mode === 'time' && s.date ? size * 0.12 : 0);

        ctx.fillStyle = colour;
        if (suffix) {
            const suffixSize = size * 0.32;
            ctx.font = `bold ${suffixSize}px ${FONT}`;
            const suffixWidth = ctx.measureText(suffix).width;
            const total = mainWidth + suffixSize * 0.35 + suffixWidth;
            const left = (WIDTH - total) / 2;
            ctx.font = `bold ${size}px ${FONT}`;
            ctx.textAlign = 'left';
            ctx.fillText(main, left, centreY);
            ctx.font = `bold ${suffixSize}px ${FONT}`;
            ctx.fillText(suffix, left + mainWidth + suffixSize * 0.35, centreY + size * 0.2);
            ctx.textAlign = 'center';
        } else {
            ctx.fillText(main, WIDTH / 2, centreY);
        }

        if (s.label) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = `bold ${Math.round(size * 0.2)}px ${FONT}`;
            ctx.fillText(String(s.label).toUpperCase().slice(0, 60), WIDTH / 2, centreY - size * 0.72);
        }
        if (s.mode === 'time' && s.date) {
            ctx.fillStyle = '#9ca3af';
            ctx.font = `bold ${Math.round(size * 0.16)}px ${FONT}`;
            ctx.fillText(`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`, WIDTH / 2, centreY + size * 0.7);
        }
        ctx.restore();
    }

    // Keeps a clock's time and draws it 10 times a second. ontick(elapsed, duration) and onend() are set
    // by the page. Paused, it still redraws (a time of day keeps moving; a countdown stays where it is).
    class ClockRunner {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.settings = null;
            this.duration = 0;
            this.paused = true;
            this.startPerf = 0;
            this.pausedAt = 0;
            this.ended = false;
            this.timer = null;
            this.ontick = null;
            this.onend = null;
        }

        get running() { return !!this.settings; }

        get elapsed() {
            if (!this.settings) return 0;
            const t = this.paused ? this.pausedAt : (performance.now() - this.startPerf) / 1000;
            return this.duration > 0 ? Math.min(t, this.duration) : t;
        }

        start(settings, { elapsed = 0, paused = false, duration = null } = {}) {
            this.settings = { ...defaultClock(), ...settings };
            this.duration = duration !== null ? duration : clockDuration(this.settings);
            this.ended = false;
            this.paused = paused;
            this.pausedAt = elapsed;
            this.startPerf = performance.now() - elapsed * 1000;
            clearInterval(this.timer);
            this.timer = setInterval(() => this.tick(), 100);
            this.tick();
        }

        stop() {
            clearInterval(this.timer);
            this.timer = null;
            this.settings = null;
        }

        pause() {
            if (!this.settings || this.paused) return;
            this.pausedAt = this.elapsed;
            this.paused = true;
            this.tick();
        }

        play() {
            if (!this.settings) return;
            if (this.ended || (this.duration > 0 && this.elapsed >= this.duration)) this.pausedAt = 0; // from the top
            this.ended = false;
            this.startPerf = performance.now() - this.pausedAt * 1000;
            this.paused = false;
            this.tick();
        }

        seek(t) {
            if (!this.settings) return;
            t = Math.max(0, this.duration > 0 ? Math.min(t, this.duration) : t);
            this.ended = false;
            this.pausedAt = t;
            this.startPerf = performance.now() - t * 1000;
            this.tick();
        }

        tick() {
            if (!this.settings) return;
            const elapsed = this.elapsed;
            drawClock(this.ctx, this.settings, elapsed, this.duration);
            if (this.ontick) this.ontick(elapsed, this.duration);
            if (this.duration > 0 && elapsed >= this.duration && !this.ended && !this.paused) {
                this.ended = true;
                this.pausedAt = this.duration;
                this.paused = true;
                if (this.onend) this.onend();
            }
        }
    }

    global.PlaybackClock = { CLOCK_MODES, WIDTH, HEIGHT, defaultClock, modeLabel, formatSpan, clockDuration, hasEnd, clockName, drawClock, ClockRunner };
})(window);
