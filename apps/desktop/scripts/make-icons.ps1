[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$Assets = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
$Source = Join-Path $Assets 'logo.jpg'
if (-not (Test-Path $Source)) { throw "Missing $Source" }

function Convert-DarkToWhiteAlpha {
    param([System.Drawing.Bitmap]$SourceBitmap)
    $dest = New-Object System.Drawing.Bitmap $SourceBitmap.Width, $SourceBitmap.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $SourceBitmap.Height; $y++) {
        for ($x = 0; $x -lt $SourceBitmap.Width; $x++) {
            $pixel = $SourceBitmap.GetPixel($x, $y)
            $luma = [int]((0.299 * $pixel.R) + (0.587 * $pixel.G) + (0.114 * $pixel.B))
            if ($luma -lt 32) {
                $dest.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
                continue
            }
            $alpha = [Math]::Min(255, [int][Math]::Round((($luma - 32) * 255) / 200.0))
            if ($luma -ge 210) { $alpha = 255 }
            $dest.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, 255, 255, 255))
        }
    }
    return $dest
}

function New-RoundedRectPath {
    param([int]$Size, [int]$Radius)
    $diameter = [Math]::Max(2, $Radius * 2)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($Size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($Size - $diameter, $Size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $Size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-AppIcon {
    param([System.Drawing.Bitmap]$Mark, [int]$Size)
    $icon = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($icon)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $radius = [Math]::Max(4, [int][Math]::Round($Size * 0.22))
    $path = New-RoundedRectPath -Size $Size -Radius $radius
    $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 0, 0, 0))
    $graphics.FillPath($fill, $path)
    $fill.Dispose()
    $graphics.SetClip($path)
    $pad = [int][Math]::Round($Size * 0.14)
    $graphics.DrawImage($Mark, (New-Object System.Drawing.Rectangle $pad, $pad, ($Size - 2 * $pad), ($Size - 2 * $pad)))
    $path.Dispose()
    $graphics.Dispose()
    return $icon
}

$jpeg = [System.Drawing.Image]::FromFile($Source)
$bitmap = New-Object System.Drawing.Bitmap $jpeg
$jpeg.Dispose()
$logo = Convert-DarkToWhiteAlpha -SourceBitmap $bitmap
$bitmap.Dispose()
$logoPath = Join-Path $Assets 'logo.png'
$logo.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)

$markSize = $logo.Height
$mark = $logo.Clone((New-Object System.Drawing.Rectangle 0, 0, $markSize, $markSize), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$mark.Save((Join-Path $Assets 'mark.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon256 = New-AppIcon -Mark $mark -Size 256
$icon32 = New-AppIcon -Mark $mark -Size 32
$icon256.Save((Join-Path $Assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Save((Join-Path $Assets 'icon-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon32.Save((Join-Path $Assets 'icon-32.png'), [System.Drawing.Imaging.ImageFormat]::Png)

$logo.Dispose()
$mark.Dispose()
$icon256.Dispose()
$icon32.Dispose()

$node = @'
const fs = require("node:fs");
const path = require("node:path");
const dir = process.argv[2];
const images = [
  { size: 32, data: fs.readFileSync(path.join(dir, "icon-32.png")) },
  { size: 256, data: fs.readFileSync(path.join(dir, "icon-256.png")) },
];
const headerSize = 6 + 16 * images.length;
let offset = headerSize;
const entries = images.map((image) => {
  const entry = { ...image, offset };
  offset += image.data.length;
  return entry;
});
const buf = Buffer.alloc(offset);
buf.writeUInt16LE(0, 0);
buf.writeUInt16LE(1, 2);
buf.writeUInt16LE(images.length, 4);
let cursor = 6;
for (const entry of entries) {
  buf.writeUInt8(entry.size >= 256 ? 0 : entry.size, cursor);
  buf.writeUInt8(entry.size >= 256 ? 0 : entry.size, cursor + 1);
  buf.writeUInt8(0, cursor + 2);
  buf.writeUInt8(0, cursor + 3);
  buf.writeUInt16LE(1, cursor + 4);
  buf.writeUInt16LE(32, cursor + 6);
  buf.writeUInt32LE(entry.data.length, cursor + 8);
  buf.writeUInt32LE(entry.offset, cursor + 12);
  entry.data.copy(buf, entry.offset);
  cursor += 16;
}
fs.writeFileSync(path.join(dir, "icon.ico"), buf);
'@
$temp = Join-Path $env:TEMP 'zivith-make-ico.js'
Set-Content -Path $temp -Value $node -Encoding UTF8
& node $temp $Assets
Remove-Item $temp
Remove-Item (Join-Path $Assets 'icon-32.png')
Remove-Item (Join-Path $Assets 'icon-256.png')
Write-Host "Wrote $logoPath and rounded icon.ico"
