@echo off
chcp 936 >nul
title CorSight Navigation Launcher
echo ============================================
echo   CorSight Navigation System - Launcher
echo ============================================
echo.

set "ROOT_DIR=%~dp0"

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
echo   Choose startup mode
echo ============================================
echo.
echo   [1] Local only (default)
echo   [2] With ngrok (内网穿透)
echo.
set /p "MODE=Enter 1 or 2 (default 1): "
if "%MODE%"=="2" goto with_ngrok
goto done

:with_ngrok
echo.
echo [3/3] Starting ngrok tunnel (Frontend :5173)...
start "CorSight ngrok" cmd /k ""%USERPROFILE%\ngrok.exe" http 5173 --log=stdout"
echo.
echo ============================================
echo   ngrok starting...
echo   Check the new "CorSight ngrok" window
echo   for the public URL (e.g. https://xxx.ngrok-free.app)
echo ============================================
echo   NOTE: Free ngrok URL changes on each restart!
goto done

:done
echo.
echo ============================================
echo   All services started!
echo ============================================
echo.
echo Service List:
echo   - Unified Backend: http://localhost:5741
echo   - Frontend Dev:    http://localhost:5173
echo.
echo API Endpoints:
echo   - Health Check:    http://localhost:5741/health
echo   - Preview API:     http://localhost:5741/api/navigation/preview
echo   - Nearby Points:   http://localhost:5741/api/navigation/nearby
echo   - Upload:          http://localhost:5741/api/upload/sampling_point
echo   - Test Route:      http://localhost:5741/api/navigation/preview/test
echo.
echo Tips:
echo   - Close this window will NOT stop services
echo   - Run scripts\stop-all.bat to stop all services
echo   - Or close individual service windows manually
echo.
pause
