@echo off
chcp 65001 >nul
echo ========================================
echo  HeartSight Service Launcher
echo  %date% %time%
echo ========================================

REM === 1. Start MongoDB ===
echo [1/3] Starting MongoDB...
tasklist /FI "IMAGENAME eq mongod.exe" 2>nul | find /i "mongod.exe" >nul
if %errorlevel%==0 (
    echo MongoDB already running.
) else (
    start "MongoDB" /min "C:\Users\Supor2\mongodb-win32-x86_64-windows-6.0.20\bin\mongod.exe" --dbpath "C:\Users\Supor2\mongodb-data" --port 27017 --bind_ip 127.0.0.1 --logpath "C:\Users\Supor2\mongodb-data\mongod.log" --logappend
    timeout /t 5 /nobreak >nul
    echo MongoDB started.
)

REM === 2. Start HeartSight backend ===
echo [2/3] Starting HeartSight backend...
tasklist /FI "IMAGENAME eq node.exe" 2>nul | find /i "node.exe" >nul
if %errorlevel%==0 (
    echo Node.js already running.
) else (
    start "HeartSight" /min cmd /c "cd /d "E:\Cross-domain_authentication_verification\HeartSight\backend" && node server.js > "E:\Cross-domain_authentication_verification\HeartSight\backend\server.log" 2>&1"
    echo HeartSight started.
)

REM === 3. Start frpc ===
echo [3/3] Starting frpc...
tasklist /FI "IMAGENAME eq frpc.exe" 2>nul | find /i "frpc.exe" >nul
if %errorlevel%==0 (
    echo frpc already running.
) else (
    start "frpc" /min "E:\Cross-domain_authentication_verification\HeartSight\tools\frpc.exe" -c "E:\Cross-domain_authentication_verification\HeartSight\tools\frpc.toml"
    echo frpc started.
)

echo.
echo ========================================
echo  Services launched:
echo    MongoDB  : 127.0.0.1:27017
echo    HeartSight: http://172.23.206.119:5741
echo    frpc     : tunnel to 114.132.86.138:5000
echo ========================================