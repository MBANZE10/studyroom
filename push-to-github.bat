@echo off
setlocal
cd /d "%~dp0"

git status

git add .

git commit -m "StudyRoom update"

git push origin main

echo.
echo Push termine avec succes.
pause
