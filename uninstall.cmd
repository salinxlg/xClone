@echo off
setlocal
title Desinstalador de xClone

echo.
echo Desinstalando xClone...
call npm uninstall -g @dexly/xclone --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo desinstalar xClone.
  pause
  exit /b 1
)

echo.
echo [OK] xClone fue desinstalado.
echo.
pause
exit /b 0
