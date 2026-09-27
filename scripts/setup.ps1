[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$RootDirectory = Split-Path -Parent $PSScriptRoot
Set-Location $RootDirectory

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

Assert-Command 'node'
Assert-Command 'corepack'
Assert-Command 'docker'

$NodeVersion = (& node --version).TrimStart('v')
$NodeMajor = [int]($NodeVersion.Split('.')[0])
if ($NodeMajor -ne 22) {
    throw "Node.js 22 is required; found v$NodeVersion."
}

& docker compose version *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose v2 is required (docker compose).'
}

if (-not (Test-Path '.env')) {
    Copy-Item '.env.example' '.env'
    Write-Host 'Created .env from .env.example. Replace the local JWT secret before sharing the environment.'
}

& corepack enable
if ($LASTEXITCODE -ne 0) { throw 'Failed to enable Corepack.' }

& corepack install
if ($LASTEXITCODE -ne 0) { throw 'Failed to activate the package manager.' }

& pnpm install
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }

# ADR-0017 V1: 语音模型尽力而为下载(≈190MB, sha256 校验);失败不阻塞 setup,
# 语音输入保持禁用(可稍后重跑 `node scripts/voice-model.mjs`)。
& node scripts/voice-model.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Voice model download failed; voice input stays disabled (rerun: node scripts/voice-model.mjs).'
}

& docker compose up -d --wait postgres redis minio
if ($LASTEXITCODE -ne 0) { throw 'Infrastructure services failed to start.' }

& docker compose run --rm minio-init
if ($LASTEXITCODE -ne 0) { throw 'MinIO bucket initialization failed.' }

if (Test-Path 'packages/database/package.json') {
    & pnpm db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed.' }

    & pnpm db:seed
    if ($LASTEXITCODE -ne 0) { throw 'Database seed failed.' }
}
else {
    Write-Host 'Skipping migrations and seed: packages/database has not been created yet.'
}

Write-Host 'Zivith development infrastructure is ready.'
Write-Host "Run 'pnpm dev' to start workspace applications."
