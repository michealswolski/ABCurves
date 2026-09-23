# ABCurves GUI Launcher
# Run from the repo root: .\gui\start.ps1

Write-Host ""
Write-Host "  ██████╗ ██████╗  ██████╗██╗   ██╗██████╗ ██╗   ██╗███████╗███████╗" -ForegroundColor Cyan
Write-Host "  ██╔══██╗██╔══██╗██╔════╝██║   ██║██╔══██╗██║   ██║██╔════╝██╔════╝" -ForegroundColor Cyan
Write-Host "  ███████║██████╔╝██║     ██║   ██║██████╔╝██║   ██║█████╗  ███████╗" -ForegroundColor Cyan
Write-Host "  ██╔══██║██╔══██╗██║     ██║   ██║██╔══██╗╚██╗ ██╔╝██╔══╝  ╚════██║" -ForegroundColor Cyan
Write-Host "  ██║  ██║██████╔╝╚██████╗╚██████╔╝██║  ██║ ╚████╔╝ ███████╗███████║" -ForegroundColor Cyan
Write-Host "  ╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═════╝ ╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚══════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Mouse Movement Generation GUI" -ForegroundColor DarkCyan
Write-Host ""

$RepoRoot = Split-Path -Parent $PSScriptRoot

# --- Backend ---
Write-Host "[1/2] Starting Flask backend..." -ForegroundColor Yellow
$backendProc = Start-Process -FilePath "python" `
    -ArgumentList "-m", "flask", "--app", "gui/backend/app.py", "run", "--port", "5000" `
    -WorkingDirectory $RepoRoot `
    -PassThru -NoNewWindow
Write-Host "      Backend PID: $($backendProc.Id)  (http://localhost:5000)" -ForegroundColor Green

Start-Sleep -Seconds 2

# --- Frontend ---
Write-Host "[2/2] Starting React dev server..." -ForegroundColor Yellow
$frontendDir = Join-Path $RepoRoot "gui\frontend"

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "      Installing npm dependencies (first run)..." -ForegroundColor DarkYellow
    npm install --prefix $frontendDir
}

Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $frontendDir `
    -NoNewWindow

Write-Host ""
Write-Host "  GUI ready at http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray
Write-Host ""

# Keep window open and wait
try {
    Wait-Process -Id $backendProc.Id
} catch {
    Write-Host "Shutting down..." -ForegroundColor DarkGray
}
