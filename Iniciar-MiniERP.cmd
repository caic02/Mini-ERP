@echo off
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado neste computador.
  echo Consulte as instrucoes do README para preparar o programa.
  pause
  exit /b 1
)
if not exist "node_modules\tsx" (
  echo Dependencias ausentes. Execute Preparar-MiniERP.cmd primeiro.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo Interface nao preparada. Execute Preparar-MiniERP.cmd primeiro.
  pause
  exit /b 1
)
call npm.cmd run desktop
pause
