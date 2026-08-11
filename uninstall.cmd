@echo off
setlocal
title Desinstalador de XClone

echo.
echo Desinstalando XClone...
call npm uninstall -g @dexly/xclone --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo desinstalar XClone.
  pause
  exit /b 1
)

echo.
echo [OK] XClone fue desinstalado.
echo.
pause
exit /b 0
