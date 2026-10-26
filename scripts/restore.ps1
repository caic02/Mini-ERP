param([Parameter(Mandatory=$true)][string]$Backup,[Parameter(Mandatory=$true)][string]$TargetDatabase,[string]$User='middleby_rh',[string]$PgBin='C:\Program Files\PostgreSQL\17\bin',[string]$PgPassFile="$env:APPDATA\postgresql\pgpass.conf",[int]$Port=5432)
$ErrorActionPreference='Stop'
if ($TargetDatabase -notmatch '^middleby_rh_restore_[a-zA-Z0-9_]+$') { throw 'Use um NOVO banco separado com prefixo middleby_rh_restore_.' }
if (!(Test-Path -LiteralPath $Backup)) { throw 'Backup não encontrado.' }
if (!(Test-Path -LiteralPath $PgPassFile)) { throw 'Configure pgpass.conf antes de restaurar.' }
$env:PGPASSFILE=$PgPassFile
& (Join-Path $PgBin 'createdb.exe') --host=127.0.0.1 --port=$Port --username=$User --no-password $TargetDatabase
if ($LASTEXITCODE -ne 0) { throw 'Criação falhou. O destino deve ser um banco novo e o usuário deve possuir CREATEDB.' }
& (Join-Path $PgBin 'pg_restore.exe') --host=127.0.0.1 --port=$Port --username=$User --dbname=$TargetDatabase --no-password --no-owner --no-privileges --single-transaction --exit-on-error $Backup
if ($LASTEXITCODE -ne 0) { throw 'Restauração falhou; o banco original não foi alterado.' }
Write-Host 'Restauração concluída no banco separado. Valide os dados antes de qualquer uso.'
