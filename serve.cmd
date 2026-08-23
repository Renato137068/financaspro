@echo off
setlocal
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo Iniciando FinançasPro...
echo.
echo Aplicativo, login e cadastro:
echo http://localhost:4000
echo.
start "" "http://localhost:4000"
"C:\Program Files\nodejs\node.exe" "backend\server.js"
