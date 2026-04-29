@echo off
chcp 65001 >nul
title CorSight 导航系统 - 服务停止脚本
echo ============================================
echo   CorSight 视障导航系统 - 停止所有服务
echo ============================================
echo.

echo 正在查找并停止 Node.js 服务进程...
echo.

REM 查找并结束占用 3000、3001、3002 端口的进程
echo [1/3] 检查端口 3000 (Frontend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo        发现进程 PID: %%a，正在结束...
    taskkill /F /PID %%a 2>nul
)

echo [2/3] 检查端口 3001 (Blind_map Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    echo        发现进程 PID: %%a，正在结束...
    taskkill /F /PID %%a 2>nul
)

echo [3/3] 检查端口 3002 (Nav Agent Backend)...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3002 ^| findstr LISTENING') do (
    echo        发现进程 PID: %%a，正在结束...
    taskkill /F /PID %%a 2>nul
)

echo.
echo ============================================
echo  所有服务已停止！
echo ============================================
echo.
pause
