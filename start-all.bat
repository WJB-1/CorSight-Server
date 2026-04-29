@echo off
chcp 65001 >nul
title CorSight 导航系统 - 全服务启动器
echo ============================================
echo   CorSight 视障导航系统 - 服务启动脚本
echo ============================================
echo.

REM 设置项目根目录
set "ROOT_DIR=%~dp0"
set "BLIND_MAP_BACKEND=%ROOT_DIR%Blind_map\backend"
set "NAV_AGENT_BACKEND=%ROOT_DIR%navigation_agent\backend"
set "NAV_AGENT_FRONTEND=%ROOT_DIR%navigation_agent\frontend"

echo [1/4] 正在启动 Blind_map 后端服务 (端口: 3001)...
echo     路径: %BLIND_MAP_BACKEND%
cd /d "%BLIND_MAP_BACKEND%"
start "Blind_map Backend - Port 3001" cmd /k "npm start"

echo.
echo [2/4] 正在启动 Navigation Agent 后端服务 (端口: 3002)...
echo     路径: %NAV_AGENT_BACKEND%
cd /d "%NAV_AGENT_BACKEND%"
start "Navigation Agent Backend - Port 3002" cmd /k "npm start"

echo.
echo [3/4] 等待后端服务初始化 (5秒)...
timeout /t 5 /nobreak >nul

echo.
echo [4/4] 正在启动 Navigation Agent 前端服务 (端口: 3000)...
echo     路径: %NAV_AGENT_FRONTEND%
cd /d "%NAV_AGENT_FRONTEND%"
start "Navigation Agent Frontend - Port 3000" cmd /k "npm run dev"

echo.
echo ============================================
echo  所有服务已启动！
echo ============================================
echo.
echo 服务列表:
echo   - Blind_map Backend:     http://localhost:3001
echo   - Nav Agent Backend:     http://localhost:3002
echo   - Nav Agent Frontend:    http://localhost:3000
echo.
echo 正在打开浏览器访问前端页面...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo 提示: 关闭此窗口不会停止服务，
echo       请单独关闭各个服务的命令行窗口。
echo.
pause
