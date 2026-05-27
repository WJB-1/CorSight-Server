@echo off
chcp 936 >nul
title CorSight Backend

set "BACKEND_DIR=%~dp0..\backend"

echo [Backend] Starting CorSight unified backend...
cd /d "%BACKEND_DIR%"
node server.js
