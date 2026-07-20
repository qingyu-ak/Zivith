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
