@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_CMD=python"
if exist "%~dp0.venv\Scripts\python.exe" set "PYTHON_CMD=%~dp0.venv\Scripts\python.exe"
"%PYTHON_CMD%" "%~dp0cli.py" %*
