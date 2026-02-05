@echo off
setlocal

echo [Belldandy Launcher] Initialization...

:: Check Node
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js v22+ from https://nodejs.org/
    pause
    exit /b 1
)

:: Check PNPM
call pnpm -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] pnpm not found. Enabling via corepack...
    call corepack enable
    call corepack prepare pnpm@latest --activate
)

:: Install Dependencies if needed (simple check if node_modules exists)
if not exist node_modules (
    echo [INFO] Installing dependencies...
    call corepack pnpm install
)

:: Generate Token
set "SETUP_TOKEN=setup-%RANDOM%-%RANDOM%-%RANDOM%"
set "AUTO_OPEN_BROWSER=true"

:: Force Server to use this token
set "BELLDANDY_AUTH_MODE=token"
set "BELLDANDY_AUTH_TOKEN=%SETUP_TOKEN%"

:main_loop
echo.
echo [Belldandy Launcher] Starting Gateway...
echo.

call corepack pnpm dev:gateway

if %errorlevel% equ 100 (
    echo.
    echo [Belldandy Launcher] Restarting requested...
    timeout /t 2 >nul
    goto main_loop
)

echo.
echo [Belldandy Launcher] Gateway exited (code %errorlevel%).
pause
