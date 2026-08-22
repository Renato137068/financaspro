@echo off
REM ============================================================
REM  FinancasPro - servidor local para teste
REM
REM  Clique duas vezes neste arquivo. Ele sobe um servidor em
REM  http://localhost:3000 e abre o navegador.
REM
REM  Nao precisa de banco de dados nem de "npm install": os dados
REM  ficam no localStorage do proprio navegador.
REM
REM  Para testar a build de producao: iniciar.bat --dist
REM  (rode "npm run build" antes)
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

node scripts\servidor-local.cjs %*

REM Se o servidor cair sozinho, a janela nao fecha antes de voce ler o erro.
if errorlevel 1 pause
