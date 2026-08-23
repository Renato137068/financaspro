@echo off
REM ============================================================
REM  FinançasPro — modo celular
REM
REM  Clique duas vezes neste arquivo.
REM  Sobe o app e abre numa janela no tamanho de um telefone
REM  (390×844), com user-agent Android — como se fosse no celular.
REM
REM  Opções:
REM    iniciar-celular.bat --dist   (build de produção)
REM ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado.
  echo   Instale em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo   Abrindo FinançasPro no formato celular...
echo.

node scripts\abrir-celular.cjs %*

if errorlevel 1 pause
