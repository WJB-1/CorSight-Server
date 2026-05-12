@echo off
chcp 936 >nul
title CorSight - Stop All Services
echo ============================================
echo   CorSight Navigation - Stop All Services
echo ============================================
echo.

echo Stopping Node.js service processes...
echo.

echo [1/3] Checking port 3002 (Unified Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3002 ^| findstr LISTENING') do (
    echo        Found PID: %%a, killing...
    taskkill /F /PID %%a 2>nul
)

echo [2/3] Checking port 5173 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    echo        Found PID: %%a, killing...
    taskkill /F /PID %%a 2>nul
)

echo [3/3] Checking legacy ports (3000/3001)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo        Found PID on 3001: %%a, killing...
    taskkill /F /PID %%a 2>nul
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo        Found PID on 3000: %%a, killing...
    taskkill /F /PID %%a 2>nul
)

echo.
echo ============================================
echo  All services stopped!
echo ============================================
echo.
pause
