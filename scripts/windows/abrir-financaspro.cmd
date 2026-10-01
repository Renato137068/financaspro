@echo off
REM Os atalhos moram em scripts\windows; tudo roda a partir da raiz do repo.
cd /d "%~dp0..\.."
start "FinançasPro Servidor" cmd /k "scripts\windows\serve.cmd"
ping 127.0.0.1 -n 3 > nul
start "" "http://localhost:4000"
