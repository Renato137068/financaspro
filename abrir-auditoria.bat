@echo off
REM Abre o relatorio de auditoria no navegador padrao (funciona offline, sem Node).
cd /d "%~dp0"
start "" "%~dp0docs\index.html"
