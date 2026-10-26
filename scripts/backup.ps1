param([Parameter(Mandatory=$true)][string]$Destination,[string]$Database='middleby_rh',[string]$User='middleby_rh',[string]$PgBin='C:\Program Files\PostgreSQL\17\bin',[string]$PgPassFile="$env:APPDATA\postgresql\pgpass.conf",[int]$Port=5432)
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath $PgPassFile)) { throw 'Configure pgpass.conf conforme README; nenhuma senha será aceita por argumento.' }
if (!(Test-Path -LiteralPath (Join-Path $PgBin 'pg_dump.exe'))) { throw 'Ajuste PgBin para a instalação do PostgreSQL.' }
$env:PGPASSFILE=$PgPassFile
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$backupPath=Join-Path (Resolve-Path -LiteralPath $Destination).Path ("rh-"+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.dump')
& (Join-Path $PgBin 'pg_dump.exe') --host=127.0.0.1 --port=$Port --username=$User --dbname=$Database --format=custom --no-password --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup falhou. Não utilize o arquivo incompleto.' }
Write-Host "Backup concluído: $backupPath"
