@echo off
REM Abre o indice das auditorias no navegador padrao (funciona offline, sem Node).
REM Os atalhos moram em scripts\windows; tudo roda a partir da raiz do repo.
cd /d "%~dp0..\.."
start "" "docs\auditorias\index.html"
