@echo off
setlocal
chcp 65001 >nul
title XClone 7.1.0 - Instalador

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] Node.js no está instalado o no está en PATH.
  echo Instala Node.js 18 o superior y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

node "%~dp0bin\install.js"
set "XCLONE_RESULT=%errorlevel%"
echo.
pause
exit /b %XCLONE_RESULT%
