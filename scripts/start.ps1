$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (!(Test-Path -LiteralPath '.env')) { throw 'Copie .env.example para .env e configure o banco antes de iniciar.' }
if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 LTS e reabra o terminal.' }
if (!(Test-Path -LiteralPath 'dist/index.html')) { throw 'Execute npm run build antes de iniciar.' }
Write-Host 'Acesse http://127.0.0.1:3001 (APP_ORIGIN deve corresponder a esse endereço).'
npm.cmd start
exit $LASTEXITCODE
