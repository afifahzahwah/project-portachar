@echo off
setlocal
cd /d "%~dp0"
set PORT=8080

echo ========================================================
echo   PortaChar Portable Water Filtration Dashboard Launcher
echo ========================================================
echo.

:: 0. Start ngrok tunnel on port 8080 (if not already running)
tasklist /fi "imagename eq ngrok.exe" 2>nul | find /i "ngrok.exe" >nul
if %errorlevel% equ 0 (
    echo [OK] ngrok tunnel is already active in background.
) else (
    where ngrok >nul 2>nul
    if %errorlevel% equ 0 (
        echo [OK] ngrok detected. Starting public tunnel on port %PORT%...
        start "ngrok - PortaChar Tunnel" ngrok http %PORT%
    ) else (
        echo [NOTICE] ngrok not found in PATH. Skipping public tunnel.
    )
)
echo.

:: 1. Check for Node.js
set "NODE_BIN="
where node >nul 2>nul && set "NODE_BIN=node"
if not defined NODE_BIN if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_BIN if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles(x86)%\nodejs\node.exe"

if defined NODE_BIN (
    echo [OK] Node.js detected (%NODE_BIN%). Launching server.js...
    start "" http://localhost:%PORT%/login.html
    "%NODE_BIN%" server.js
    if %errorlevel% neq 0 pause
    goto :eof
)

:: 2. Fallback to Windows PowerShell HttpListener (built-in Windows .NET)
echo [NOTICE] Node.js not detected in PATH.
echo [OK] Falling back to Windows PowerShell HttpListener...
start "" http://localhost:%PORT%/login.html
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$listener = New-Object System.Net.HttpListener; $listener.Prefixes.Add('http://localhost:%PORT%/'); $listener.Start(); Write-Host 'Running on http://localhost:%PORT%'; while ($listener.IsListening) { $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response; $path = '.' + $req.RawUrl.Split('?')[0]; if ($path -eq './') { $path = './login.html' }; if (Test-Path $path) { $bytes = [System.IO.File]::ReadAllBytes($path); $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length) } else { $res.StatusCode = 404 }; $res.OutputStream.Close() }"

endlocal
