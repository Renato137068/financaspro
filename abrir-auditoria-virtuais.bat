@echo off
REM Abre a auditoria massiva no navegador via servidor local (renderiza CSS/JS corretamente).
cd /d "%~dp0"

set "URL=http://localhost:3000/docs/auditoria-usuarios-virtuais-2026-08-27.html"
set "PORTA=3000"

REM Verifica se ja ha servidor na porta 3000
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:%PORTA%/' -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo Iniciando servidor local na porta %PORTA%...
  start "FinancasPro servidor" /MIN cmd /c "node scripts\servidor-local.cjs --porta %PORTA% --sem-abrir"
  REM Aguarda o servidor subir
  timeout /t 2 /nobreak >nul
)

start "" "%URL%"
echo.
echo Relatorio aberto em: %URL%
echo Se a pagina nao carregar, aguarde 2s e recarregue.
echo Para parar o servidor: feche a janela "FinancasPro servidor" na bandeja.
