[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$DesktopRoot = Split-Path -Parent $PSScriptRoot
$RepoRoot = Split-Path -Parent (Split-Path -Parent $DesktopRoot)
$Icon = Join-Path $DesktopRoot 'assets\icon.ico'
$UnpackedExe = Join-Path $DesktopRoot 'dist\win-unpacked\Zivith.exe'
$Vbs = Join-Path $RepoRoot 'Zivith.vbs'
$ShortcutPath = Join-Path $RepoRoot 'Zivith.lnk'

if (-not (Test-Path $Icon)) {
    throw "Icon not found: $Icon"
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.WorkingDirectory = $RepoRoot
$shortcut.Description = 'Zivith'
$shortcut.IconLocation = $Icon

if (Test-Path $UnpackedExe) {
    $shortcut.TargetPath = $UnpackedExe
    $shortcut.Arguments = ''
} elseif (Test-Path $Vbs) {
    $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
    $shortcut.Arguments = "//nologo `"$Vbs`""
} else {
    throw 'Neither packed Zivith.exe nor Zivith.vbs was found.'
}

$shortcut.Save()
Write-Host "Created $ShortcutPath"
