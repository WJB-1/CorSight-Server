@echo off
chcp 65001 >nul
title CorSight Navigation Launcher
echo ============================================
echo   CorSight Navigation System - Launcher
echo ============================================
echo.

set "ROOT_DIR=%~dp0"
set "FRPC_PATH=D:\frps\frp_0.69.0_windows_amd64\frpc.exe"
set "FRPC_CONFIG=D:\frps\frp_0.69.0_windows_amd64\frpc.toml"

echo [Check] Checking backend dependencies...
if not exist "%ROOT_DIR%backend\node_modules" (
echo [Warn] Backend node_modules not found. Running npm install...
cd /d "%ROOT_DIR%backend"
call npm install
if errorlevel 1 (
echo [Error] Backend npm install failed!
pause
exit /b 1
)
)

echo [Check] Checking frontend dependencies...
if not exist "%ROOT_DIR%frontend\node_modules" (
echo [Warn] Frontend node_modules not found. Running npm install...
cd /d "%ROOT_DIR%frontend"
call npm install
if errorlevel 1 (
echo [Error] Frontend npm install failed!
pause
exit /b 1
)
)

echo [Check] All dependencies ready!
echo.

echo [FRP] Checking frpc status...
set "FRP_RUNNING=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5741 ^| findstr LISTENING') do set "FRP_RUNNING=1"

if "%FRP_RUNNING%"=="1" (
echo [FRP] frpc is already running.
goto frp_done
)

echo [FRP] frpc not running. Starting frpc...
start "CorSight FRP" cmd /k "\"%FRPC_PATH%\" -c \"%FRPC_CONFIG%\""
timeout /t 3 /nobreak >nul

:frp_done
echo.

echo [1/2] Starting Unified Backend...
start "CorSight Backend" cmd /k "%~dp0scripts\start-backend.bat"

echo.
echo [2/2] Waiting for backend initialization (5s)...
timeout /t 5 /nobreak >nul

echo.
echo Starting Frontend Dev Server...
start "CorSight Frontend" cmd /k "%~dp0scripts\start-frontend.bat"

echo.
echo ============================================
echo   All services started successfully!
echo ============================================
pause