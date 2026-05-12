@echo off
chcp 936 >nul
title CorSight Backend - Port 3002

set "BACKEND_DIR=%~dp0..\backend"

echo [Backend] Starting CorSight unified backend...
cd /d "%BACKEND_DIR%"
node server.js
