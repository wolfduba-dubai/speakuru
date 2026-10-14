@echo off
cd /d "%~dp0"
start "" chrome http://localhost:5500
python server.py
pause
