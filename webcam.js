// ============================================================================
// Playback Joe - WEBCAM cues (shared by the operator console and the output)
// A webcam cue is an image cue with `webcam` settings: the live picture of a camera, and optionally the
// sound of a separate input (SOUND), for a camera whose own microphone is wrong or out of sync.
// clip.webcam = { videoId, videoLabel, audioId, audioLabel }; '' = the default camera / no sound.
// ============================================================================
(function (global) {
    // The url a webcam cue carries: never loaded, but it names the cue for the media-error checks
    function webcamUrl(w) {
        return 'webcam:' + encodeURIComponent((w && w.videoId) || 'default');
    }

    function constraints(w) {
        const video = { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
        if (w.videoId) video.deviceId = { exact: w.videoId };
        // Straight sound: no echo cancelling, noise suppression or level riding
        const audio = w.audioId ? { deviceId: { exact: w.audioId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false;
        return { video, audio };
    }

    function open(w) {
        return navigator.mediaDevices.getUserMedia(constraints(w || {}));
    }

    function stop(stream) {
        if (stream) stream.getTracks().forEach(t => t.stop());
    }

    // Cameras and sound inputs. Their names only show once the app has been allowed to use a camera and a
    // microphone, so the first time it opens them for a moment to unlock the names.
    async function listDevices() {
        let devices = await navigator.mediaDevices.enumerateDevices();
        if (!devices.some(d => d.label)) {
            for (const kind of [{ video: true }, { audio: true }]) {
                try { stop(await navigator.mediaDevices.getUserMedia(kind)); } catch (err) { /* none, or not allowed */ }
            }
            devices = await navigator.mediaDevices.enumerateDevices();
        }
        const pick = (kind, fallback) => devices.filter(d => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications')
            .map((d, i) => ({ id: d.deviceId, label: (d.label || `${fallback} ${i + 1}`).toUpperCase() }));
        return { cameras: pick('videoinput', 'CAMERA'), mics: pick('audioinput', 'INPUT') };
    }

    // Before a TAKE: is the chosen camera (and sound input) still connected? Device ids can change between
    // computers, so a device is also found by its name, and the cue's ids are updated to match.
    async function checkDevices(w) {
        const { cameras, mics } = await listDevices();
        const find = (list, id, label) => list.find(d => d.id === id) || list.find(d => label && d.label === label);
        const result = { ok: true, message: '', webcam: { ...w } };
        if (w.videoId) {
            const cam = find(cameras, w.videoId, w.videoLabel);
            if (cam) { result.webcam.videoId = cam.id; result.webcam.videoLabel = cam.label; }
            else { result.ok = false; result.message = `CAMERA NOT FOUND: ${w.videoLabel || 'CHOSEN CAMERA'}`; }
        } else if (!cameras.length) {
            result.ok = false;
            result.message = 'NO CAMERA CONNECTED';
        }
        if (w.audioId) {
            const mic = find(mics, w.audioId, w.audioLabel);
            if (mic) { result.webcam.audioId = mic.id; result.webcam.audioLabel = mic.label; }
            else if (result.ok) { result.ok = false; result.message = `SOUND INPUT NOT FOUND: ${w.audioLabel || 'CHOSEN INPUT'}`; }
        }
        return result;
    }

    // What a failed getUserMedia means, in the console's words
    function describeError(err) {
        const name = err && err.name;
        if (name === 'NotAllowedError' || name === 'SecurityError') return 'CAMERA OR MICROPHONE ACCESS NOT ALLOWED';
        if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'CAMERA OR SOUND INPUT NOT FOUND';
        if (name === 'NotReadableError' || name === 'AbortError') return 'CAMERA IN USE BY ANOTHER APP OR NOT RESPONDING';
        return `CAMERA ERROR${err && err.message ? ': ' + String(err.message).toUpperCase() : ''}`;
    }

    global.PlaybackWebcam = { webcamUrl, open, stop, listDevices, checkDevices, describeError };
})(window);
