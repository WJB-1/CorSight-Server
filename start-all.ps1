# CorSight 视障导航系统 - 全服务启动脚本 (PowerShell 版本)
# 作者: CorSight Team
# 功能: 一键启动所有后端和前端服务

$Host.UI.RawUI.WindowTitle = "CorSight 导航系统 - 全服务启动器"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   CorSight 视障导航系统 - 服务启动脚本" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 设置项目根目录
$ROOT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$BLIND_MAP_BACKEND = Join-Path $ROOT_DIR "Blind_map\backend"
$NAV_AGENT_BACKEND = Join-Path $ROOT_DIR "navigation_agent\backend"
$NAV_AGENT_FRONTEND = Join-Path $ROOT_DIR "navigation_agent\frontend"

# 服务配置
$services = @(
    @{
        Name = "Blind_map Backend"
        Path = $BLIND_MAP_BACKEND
        Port = 3001
        Command = "npm start"
        Color = "Green"
    },
    @{
        Name = "Navigation Agent Backend"
        Path = $NAV_AGENT_BACKEND
        Port = 3002
        Command = "npm start"
        Color = "Yellow"
    },
    @{
        Name = "Navigation Agent Frontend"
        Path = $NAV_AGENT_FRONTEND
        Port = 3000
        Command = "npm run dev"
        Color = "Magenta"
    }
)

# 启动前检查
Write-Host "[检查] 正在验证项目路径..." -ForegroundColor Gray
foreach ($svc in $services) {
    if (-not (Test-Path $svc.Path)) {
        Write-Host "[错误] 路径不存在: $($svc.Path)" -ForegroundColor Red
        exit 1
    }
}
Write-Host "[检查] 所有路径验证通过!" -ForegroundColor Green
Write-Host ""

# 启动服务
$jobList = @()
for ($i = 0; $i -lt $services.Count; $i++) {
    $svc = $services[$i]
    $step = $i + 1
    
    Write-Host "[$step/$($services.Count)] 正在启动 $($svc.Name) (端口: $($svc.Port))..." -ForegroundColor $svc.Color
    Write-Host "      路径: $($svc.Path)" -ForegroundColor Gray
    
    # 创建新的 PowerShell 窗口启动服务
    $job = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$($svc.Path)'; $svc.Command" -PassThru
    $jobList += $job
    
    # 如果不是最后一个服务，等待一段时间
    if ($i -lt $services.Count - 1) {
        Write-Host "      等待初始化 (3秒)..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
    Write-Host ""
}

# 最后等待前端启动
Write-Host "      等待前端服务完全启动 (5秒)..." -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  所有服务已启动！" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "服务列表:" -ForegroundColor White
Write-Host "  Blind_map Backend:     http://localhost:3001" -ForegroundColor Green
Write-Host "  Nav Agent Backend:     http://localhost:3002" -ForegroundColor Yellow
Write-Host "  Nav Agent Frontend:    http://localhost:3000" -ForegroundColor Magenta
Write-Host ""

# 打开浏览器
Write-Host "正在打开浏览器访问前端页面..." -ForegroundColor Cyan
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "提示:" -ForegroundColor Yellow
Write-Host "  - 关闭此窗口不会停止服务" -ForegroundColor Gray
Write-Host "  - 使用 stop-all.ps1 脚本可一键停止所有服务" -ForegroundColor Gray
Write-Host "  - 或在任务管理器中结束 Node.js 进程" -ForegroundColor Gray
Write-Host ""

Read-Host "按 Enter 键关闭此窗口"
