@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. E necessario Node.js 22 ou superior com npm.
  echo Use uma instalacao permitida pela empresa e tente novamente.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 (
  echo Atualize o Node.js para a versao 22 ou superior.
  pause
  exit /b 1
)
echo Preparando o Mini ERP. Esta etapa precisa de acesso a internet.
echo Feche outras janelas deste programa antes de continuar.
call npm.cmd ci
if errorlevel 1 goto failure
call npm.cmd run db:generate
if errorlevel 1 goto failure
call npm.cmd run build
if errorlevel 1 goto failure
echo.
echo Preparacao concluida. Abra Iniciar-MiniERP.cmd para usar o sistema.
echo O arquivo de dados deve ser selecionado na tela inicial.
pause
exit /b 0
:failure
echo.
echo Nao foi possivel concluir. Confira a mensagem acima.
echo Se o acesso a internet ou a execucao estiver bloqueado, consulte o suporte da empresa.
pause
exit /b 1
