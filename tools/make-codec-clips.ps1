# Builds short codec test clips (3 s, 1080p30 colour test pattern + 1 kHz stereo tone) for checking which
# formats Playback Joe can play. Each file is named after its container, video codec and audio codec.
# Not shipped with the app: test-media/ is gitignored. Run again any time to rebuild them, then check them
# with tools/probe-codecs.js. Works in pwsh on macOS and Linux too (pass -FFmpeg ffmpeg).
param(
    [string]$Out = (Join-Path $PSScriptRoot '..\test-media\codecs'),
    [string]$FFmpeg = 'C:\Program Files\Shutter Encoder\Library\ffmpeg.exe'
)
$ff = $FFmpeg
New-Item -ItemType Directory -Force $Out | Out-Null
$Out = (Resolve-Path $Out).Path

$v = @('-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3')
$v4k = @('-f', 'lavfi', '-i', 'testsrc2=size=3840x2160:rate=30:duration=3')
$a = @('-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=3', '-ac', '2')

# name, inputs, codec options
$clips = @(
    @('MP4 - H264 8-bit - AAC.mp4',          $v,   '-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k'),
    @('MP4 - H264 10-bit - AAC.mp4',         $v,   '-c:v libx264 -profile:v high10 -pix_fmt yuv420p10le -c:a aac'),
    @('MP4 - H264 4-2-2 - AAC.mp4',          $v,   '-c:v libx264 -profile:v high422 -pix_fmt yuv422p -c:a aac'),
    @('MP4 - H264 3840x2160 - AAC.mp4',      $v4k, '-c:v libx264 -pix_fmt yuv420p -c:a aac'),
    @('MP4 - H264 - MP3.mp4',                $v,   '-c:v libx264 -pix_fmt yuv420p -c:a libmp3lame -b:a 192k'),
    @('MP4 - H264 - AC3.mp4',                $v,   '-c:v libx264 -pix_fmt yuv420p -c:a ac3'),
    @('M4V - H264 - AAC.m4v',                $v,   '-c:v libx264 -pix_fmt yuv420p -c:a aac'),
    @('MOV - H264 - AAC.mov',                $v,   '-c:v libx264 -pix_fmt yuv420p -c:a aac'),
    @('MOV - H264 - PCM.mov',                $v,   '-c:v libx264 -pix_fmt yuv420p -c:a pcm_s16le'),
    @('MP4 - HEVC 8-bit - AAC.mp4',          $v,   '-c:v libx265 -pix_fmt yuv420p -tag:v hvc1 -c:a aac -x265-params log-level=error'),
    @('MP4 - HEVC 10-bit - AAC.mp4',         $v,   '-c:v libx265 -pix_fmt yuv420p10le -tag:v hvc1 -c:a aac -x265-params log-level=error'),
    @('MOV - HEVC - AAC.mov',                $v,   '-c:v libx265 -pix_fmt yuv420p -tag:v hvc1 -c:a aac -x265-params log-level=error'),
    @('WEBM - VP8 - Vorbis.webm',            $v,   '-c:v libvpx -b:v 4M -c:a libvorbis'),
    @('WEBM - VP9 - Opus.webm',              $v,   '-c:v libvpx-vp9 -b:v 4M -deadline realtime -cpu-used 8 -c:a libopus'),
    @('WEBM - VP9 10-bit - Opus.webm',       $v,   '-c:v libvpx-vp9 -pix_fmt yuv420p10le -profile:v 2 -b:v 4M -deadline realtime -cpu-used 8 -c:a libopus'),
    @('WEBM - AV1 - Opus.webm',              $v,   '-c:v libsvtav1 -preset 10 -crf 35 -c:a libopus'),
    @('MP4 - AV1 - AAC.mp4',                 $v,   '-c:v libsvtav1 -preset 10 -crf 35 -c:a aac'),
    @('MOV - ProRes 422 HQ - PCM.mov',       $v,   '-c:v prores_ks -profile:v 3 -c:a pcm_s16le'),
    @('MOV - ProRes 4444 - PCM.mov',         $v,   '-c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -c:a pcm_s16le'),
    @('MOV - DNxHR HQ - PCM.mov',            $v,   '-c:v dnxhd -profile:v dnxhr_hq -pix_fmt yuv422p -c:a pcm_s16le'),
    @('MOV - MJPEG - PCM.mov',               $v,   '-c:v mjpeg -q:v 3 -pix_fmt yuvj420p -c:a pcm_s16le'),
    @('MP4 - MPEG-4 Part 2 - AAC.mp4',       $v,   '-c:v mpeg4 -q:v 3 -c:a aac'),
    @('MP4 - MPEG-2 - AAC.mp4',              $v,   '-c:v mpeg2video -q:v 3 -c:a aac'),
    @('MP3 - 320k.mp3',                      $a,   '-c:a libmp3lame -b:a 320k'),
    @('WAV - PCM 16-bit 48k.wav',            $a,   '-c:a pcm_s16le'),
    @('WAV - PCM 24-bit 48k.wav',            $a,   '-c:a pcm_s24le'),
    @('WAV - PCM 32-bit float 48k.wav',      $a,   '-c:a pcm_f32le'),
    @('AAC - ADTS.aac',                      $a,   '-c:a aac -b:a 256k'),
    @('M4A - AAC.m4a',                       $a,   '-c:a aac -b:a 256k'),
    @('M4A - ALAC.m4a',                      $a,   '-c:a alac'),
    @('FLAC.flac',                           $a,   '-c:a flac'),
    @('OGG - Vorbis.ogg',                    $a,   '-c:a libvorbis'),
    @('WEBM - Opus audio only.webm',         $a,   '-c:a libopus'),
    @('AIFF - PCM 16-bit.aiff',              $a,   '-c:a pcm_s16be')
)

$failed = 0
foreach ($c in $clips) {
    $name, $inputs, $opts = $c
    $audioInputs = if ($inputs -eq $a) { @() } else { $a }
    & $ff -hide_banner -loglevel error -y @inputs @audioInputs ($opts -split ' ') -shortest (Join-Path $Out $name)
    if ($LASTEXITCODE -ne 0) { "FAILED: $name"; $failed++ }
}

# Stills
& $ff -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=1920x1080:rate=1:duration=1' -frames:v 1 (Join-Path $Out 'JPG.jpg')
& $ff -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=1920x1080:rate=1:duration=1' -frames:v 1 (Join-Path $Out 'PNG.png')
& $ff -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=1920x1080:rate=1:duration=1' -frames:v 1 -c:v libwebp (Join-Path $Out 'WEBP.webp')
& $ff -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=1920x1080:rate=1:duration=1' -frames:v 1 (Join-Path $Out 'BMP.bmp')
& $ff -hide_banner -loglevel error -y -f lavfi -i 'testsrc2=size=640x360:rate=10:duration=2' -vf 'split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse' (Join-Path $Out 'GIF - animated.gif')

$files = Get-ChildItem $Out -File
"wrote $($files.Count) files to $Out ($([math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 1)) MB), $failed failed"
