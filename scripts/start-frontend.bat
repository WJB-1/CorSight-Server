@echo off
chcp 936 >nul
title CorSight Frontend - Port 5173

set "FRONTEND_DIR=%~dp0..\frontend"

echo [Frontend] Starting Vite dev server...
cd /d "%FRONTEND_DIR%"
npm run dev
