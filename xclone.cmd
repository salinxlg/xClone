@echo off
setlocal
chcp 65001 >nul
node "%~dp0bin\xclone.js" %*
exit /b %errorlevel%
