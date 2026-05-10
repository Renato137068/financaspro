@echo off
cd /d "%~dp0"
start "FinancasPro Servidor" cmd /k "serve.cmd"
ping 127.0.0.1 -n 3 > nul
start "" "http://localhost:4000"
