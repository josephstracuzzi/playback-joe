# Builds the Playback Joe audio/video sync test: 1920x1080, 30 fps, 60 s, VP9 + Opus stereo.
# Every whole second (frame 0 of each second): the centre panel flashes white for exactly 1 frame and a
# 1 kHz tone starts on that frame and plays for 100 ms (3 frames; the L/R box stays lit as long). Even seconds = LEFT channel (L box lights), odd = RIGHT.
# A marker sweeps along the track once per second and crosses the red centre line on the flash frame.
param([string]$Work, [string]$Logo, [string]$Out, [int]$Seconds = 60)
$ff = 'C:\Program Files\Shutter Encoder\Library\ffmpeg.exe'
Set-Location $Work
Copy-Item 'C:\Windows\Fonts\arialbd.ttf' "$Work\arialbd.ttf" -Force
Copy-Item 'C:\Windows\Fonts\consolab.ttf' "$Work\consolab.ttf" -Force
Copy-Item $Logo "$Work\logo.png" -Force
Set-Content "$Work\title.txt" 'AUDIO / VIDEO SYNC TEST' -NoNewline -Encoding ascii
Set-Content "$Work\sub.txt" '1920 x 1080  /  30P  /  1 KHZ TONE ON EVERY FLASH  /  L-R ALTERNATING' -NoNewline -Encoding ascii
Set-Content "$Work\l.txt" 'L' -NoNewline -Encoding ascii
Set-Content "$Work\r.txt" 'R' -NoNewline -Encoding ascii
Set-Content "$Work\left.txt" 'LEFT' -NoNewline -Encoding ascii
Set-Content "$Work\right.txt" 'RIGHT' -NoNewline -Encoding ascii
Set-Content "$Work\sync.txt" 'SYNC' -NoNewline -Encoding ascii

$d = $Seconds
$flashOn = 'eq(mod(n\,30)\,0)'
$f = @(
  "color=c=0x1c1c1c:s=1920x1080:r=30:d=$d,format=gbrp[bg]",
  "movie=logo.png,scale=900:-1[logo]",
  "color=c=white:s=640x200:r=30:d=$d[flash]",
  "color=c=0x28a745:s=240x200:r=30:d=$d[lit1]",
  "color=c=0x28a745:s=240x200:r=30:d=$d[lit2]",
  "color=c=white:s=12x150:r=30:d=$d[mark]",
  # static layout: sweep track with ticks every 0.1 s, red centre line, outlines for L / SYNC / R
  ("[bg]drawbox=x=160:y=478:w=1600:h=4:c=0x777777:t=fill," + ((0..10 | ForEach-Object { "drawbox=x=$(158 + 160*$_):y=462:w=4:h=36:c=0x777777:t=fill" }) -join ',') +
   ",drawbox=x=957:y=420:w=6:h=120:c=0x28a745:t=fill,drawbox=x=640:y=600:w=640:h=200:c=0x666666:t=3,drawbox=x=200:y=600:w=240:h=200:c=0x666666:t=3,drawbox=x=1480:y=600:w=240:h=200:c=0x666666:t=3[base]"),
  "[base][logo]overlay=x=(W-w)/2:y=60:format=gbrp[b1]",
  "[b1][flash]overlay=x=640:y=600:enable='$flashOn':format=gbrp[b2]",
  "[b2][lit1]overlay=x=200:y=600:enable='lt(mod(n\,30)\,3)*eq(mod(floor(n/30)\,2)\,0)':format=gbrp[b3]",
  "[b3][lit2]overlay=x=1480:y=600:enable='lt(mod(n\,30)\,3)*eq(mod(floor(n/30)\,2)\,1)':format=gbrp[b4]",
  "[b4][mark]overlay=x='960+(mod(t+0.5\,1)-0.5)*1600-6':y=405:format=gbrp[b5]",
  ("[b5]drawtext=fontfile=arialbd.ttf:textfile=title.txt:fontsize=56:fontcolor=white:x=(w-tw)/2:y=300," +
   "drawtext=fontfile=arialbd.ttf:textfile=sub.txt:fontsize=26:fontcolor=0xaaaaaa:x=(w-tw)/2:y=372," +
   "drawtext=fontfile=arialbd.ttf:textfile=l.txt:fontsize=110:fontcolor=white:x=320-tw/2:y=640," +
   "drawtext=fontfile=arialbd.ttf:textfile=r.txt:fontsize=110:fontcolor=white:x=1600-tw/2:y=640," +
   "drawtext=fontfile=arialbd.ttf:textfile=left.txt:fontsize=26:fontcolor=0xaaaaaa:x=320-tw/2:y=815," +
   "drawtext=fontfile=arialbd.ttf:textfile=right.txt:fontsize=26:fontcolor=0xaaaaaa:x=1600-tw/2:y=815," +
   "drawtext=fontfile=arialbd.ttf:textfile=sync.txt:fontsize=26:fontcolor=0xaaaaaa:x=960-tw/2:y=815," +
   "drawtext=fontfile=consolab.ttf:timecode='00\:00\:00\:00':rate=30:fontsize=90:fontcolor=white:x=(w-tw)/2:y=890,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv[v]"),
  # audio: 1 kHz tone for 100 ms (3 frames) from each whole second, 2 ms fade-in / 5 ms fade-out, alternating L and R
  "aevalsrc='0.5*sin(2*PI*1000*t)*lt(mod(t\,1)\,0.1)*min(1\,min(mod(t\,1)/0.002\,(0.1-mod(t\,1))/0.005))*eq(mod(floor(t)\,2)\,0)|0.5*sin(2*PI*1000*t)*lt(mod(t\,1)\,0.1)*min(1\,min(mod(t\,1)/0.002\,(0.1-mod(t\,1))/0.005))*eq(mod(floor(t)\,2)\,1)':s=48000:c=stereo:d=$d[a]"
)
Set-Content "$Work\sync-filter.txt" ($f -join ";`n") -Encoding ascii
& $ff -hide_banner -loglevel error -y -filter_complex_script sync-filter.txt -map '[v]' -map '[a]' -t $d `
   -c:v libvpx-vp9 -b:v 0 -crf 30 -deadline good -cpu-used 4 -row-mt 1 -pix_fmt yuv420p -g 30 `
   -c:a libopus -b:a 128k -ar 48000 $Out
if ($LASTEXITCODE -eq 0) { "wrote $Out" } else { "ffmpeg failed: $LASTEXITCODE" }




