# Builds the Playback Joe 1920x1080 alignment grid with ffmpeg.
# 16 x 9 squares of 120 px in the app green, centre cross, centre circle touching top and bottom, corner circles,
# white 2 px border, column numbers / row letters, and the Playback Joe logo with format info.
param([string]$Work, [string]$Logo, [string]$Out)
$ff = 'C:\Program Files\Shutter Encoder\Library\ffmpeg.exe'
Set-Location $Work
Copy-Item 'C:\Windows\Fonts\arialbd.ttf' "$Work\arialbd.ttf" -Force
Copy-Item 'C:\Windows\Fonts\arial.ttf' "$Work\arial.ttf" -Force
Copy-Item $Logo "$Work\logo.png" -Force

$f = New-Object System.Collections.Generic.List[string]
# Circles (white, ~2 px): big centre circle r=539, small centre r=60, and quarter circles from each corner r=540
$ring = { param($cx, $cy, $r) "lt(abs(hypot(X-$cx,Y-$cy)-$r),1.2)" }
$circles = @((& $ring 960 540 539), (& $ring 960 540 60), (& $ring 0 0 540), (& $ring 1920 0 540), (& $ring 0 1080 540), (& $ring 1920 1080 540)) -join '+'
$f.Add("color=c=black:s=1920x1080:d=1,format=rgb24,geq=r='if($circles,235,0)':g='if($circles,235,0)':b='if($circles,235,0)'[c]")
# Grid lines: thin dark green every 120 px, app-green (#28a745) centre cross, white border
$f.Add("[c]drawgrid=w=120:h=120:t=1:c=0x1a6b2c,drawbox=x=958:y=0:w=4:h=1080:c=0x28a745:t=fill,drawbox=x=0:y=538:w=1920:h=4:c=0x28a745:t=fill,drawbox=x=0:y=0:w=1920:h=1080:c=0xffffff:t=2[g]")

# Labels: column numbers top and bottom (-8..-1, 1..8), row letters left and right (D..A, centre, a..d)
$cols = @(-8..-1) + @(1..8)
$labels = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt 16; $i++) {
    $x = 60 + 120 * $i; $t = "$($cols[$i])"
    Set-Content -Path "$Work\col$i.txt" -Value $t -NoNewline -Encoding ascii
    $labels.Add("drawtext=fontfile=arial.ttf:textfile=col$i.txt:fontsize=26:fontcolor=white:x=$x-tw/2:y=14")
    $labels.Add("drawtext=fontfile=arial.ttf:textfile=col$i.txt:fontsize=26:fontcolor=white:x=$x-tw/2:y=1080-14-th")
}
$rows = 'D','C','B','A','','a','b','c','d'
for ($j = 0; $j -lt 9; $j++) {
    if ($rows[$j] -eq '') { continue }
    $y = 60 + 120 * $j
    Set-Content -Path "$Work\row$j.txt" -Value $rows[$j] -NoNewline -Encoding ascii
    $labels.Add("drawtext=fontfile=arial.ttf:textfile=row$j.txt:fontsize=26:fontcolor=white:x=24:y=$y-th/2")
    $labels.Add("drawtext=fontfile=arial.ttf:textfile=row$j.txt:fontsize=26:fontcolor=white:x=1920-24-tw:y=$y-th/2")
}
# Info lines under the logo
Set-Content -Path "$Work\info1.txt" -Value '1920 x 1080 PX' -NoNewline -Encoding ascii
Set-Content -Path "$Work\info2.txt" -Value '16:9  /  1.78:1' -NoNewline -Encoding ascii
Set-Content -Path "$Work\info3.txt" -Value '16 x 9 SQUARES OF 120 PX' -NoNewline -Encoding ascii
$labels.Add("drawtext=fontfile=arialbd.ttf:textfile=info1.txt:fontsize=50:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=12:x=(w-tw)/2:y=690")
$labels.Add("drawtext=fontfile=arialbd.ttf:textfile=info2.txt:fontsize=40:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=10:x=(w-tw)/2:y=772")
$labels.Add("drawtext=fontfile=arialbd.ttf:textfile=info3.txt:fontsize=32:fontcolor=0xcccccc:box=1:boxcolor=black@0.75:boxborderw=10:x=(w-tw)/2:y=842")
$f.Add("[g]" + ($labels -join ',') + "[t]")
# Logo, 1000 px wide, centred in the upper half
$f.Add("movie=logo.png,scale=1000:-1[l]")
$f.Add("[t][l]overlay=x=(W-w)/2:y=180:format=auto,format=rgb24[out]")
Set-Content -Path "$Work\grid-filter.txt" -Value ($f -join ";`n") -Encoding ascii

& $ff -hide_banner -loglevel error -y -filter_complex_script grid-filter.txt -map '[out]' -frames:v 1 $Out
if ($LASTEXITCODE -eq 0) { "wrote $Out" } else { "ffmpeg failed: $LASTEXITCODE" }


