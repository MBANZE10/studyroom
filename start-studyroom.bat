@echo off
setlocal
cd /d "%~dp0"

where pm2 >nul 2>nul
if errorlevel 1 (
  echo Installation de PM2...
  call npm install -g pm2
)

echo Demarrage du backend StudyRoom...
call pm2 start ecosystem.config.js
call pm2 save

echo.
echo Backend StudyRoom en cours d'execution.
echo Pour voir le statut : pm2 list
pause
