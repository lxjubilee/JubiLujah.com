Add-Type -AssemblyName System.Drawing
$src = 'W:\JubileePraise.com\app\web\public\images\JubileeLogo.png'
$dst = 'W:\JubileePraise.com\wpf\CoverArtStudio\app.ico'
$sizes = @(16,24,32,48,64,128,256)
$srcImg = [System.Drawing.Image]::FromFile($src)
$pngs = @()
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($srcImg, (New-Object System.Drawing.Rectangle(0,0,$s,$s)))
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $pngs += ,@($s, $ms.ToArray())
  $ms.Dispose()
}
$srcImg.Dispose()

$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$pngs.Count)
$offset = 6 + (16 * $pngs.Count)
foreach ($p in $pngs) {
  $s = $p[0]; $bytes = $p[1]
  $dim = if ($s -ge 256) { 0 } else { $s }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$bytes.Length); $bw.Write([uint32]$offset)
  $offset += $bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p[1]) }
$bw.Flush()
[System.IO.File]::WriteAllBytes($dst, $out.ToArray())
$bw.Dispose(); $out.Dispose()
Write-Output "wrote $dst ($((Get-Item $dst).Length) bytes, $($pngs.Count) sizes)"
