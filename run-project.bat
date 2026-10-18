@echo off

:: =========================================================
:: I-GAZE - STARTUP SCRIPT
:: =========================================================

:: Force this BAT to run from the project folder
cd /d "%~dp0"

:: Uses whichever Node.js is on PATH (install Node 20+ from nodejs.org).

:: Keep the CMD window open permanently
if /I not "%~1"=="RUNNING" (
    start "I-Gaze" cmd /k ""%~f0" RUNNING"
    exit /b
)

title I-Gaze

echo.
echo ==========================================
echo               I-GAZE
echo ==========================================
echo.
echo Project:
echo %CD%
echo.

:: =========================================================
:: 1. NODE.JS
:: =========================================================

echo [1/6] Checking Node.js...
echo.

call node --version

if errorlevel 1 (
    echo.
    echo ERROR: Node.js could not be started.
    echo.
    pause
    goto END
)

echo.
echo [OK] Node.js working.
echo.

:: =========================================================
:: 2. NPM
:: =========================================================

echo [2/6] Checking npm...
echo.

call npm.cmd --version

if errorlevel 1 (
    echo.
    echo ERROR: npm could not be started.
    echo.
    pause
    goto END
)

echo.
echo [OK] npm working.
echo.

:: =========================================================
:: 3. PACKAGE.JSON
:: =========================================================

echo [3/6] Checking package.json...
echo.

if not exist "package.json" (
    echo ERROR: package.json NOT FOUND.
    echo.
    echo Current folder:
    echo %CD%
    echo.
    pause
    goto END
)

echo [OK] package.json found.
echo.

:: =========================================================
:: 4. DEPENDENCIES
:: =========================================================

echo [4/6] Checking project dependencies...
echo.

if exist "node_modules\.bin\vite.cmd" (
    echo [OK] node_modules exists.
) else (
    echo [INFO] node_modules not found.
    echo.
    echo Installing dependencies...
    echo.

    call npm.cmd install

    if errorlevel 1 (
        echo.
        echo ==========================================
        echo ERROR: npm install FAILED
        echo ==========================================
        echo.
        pause
        goto END
    )

    echo.
    echo [OK] Dependencies installed.
)

echo.

:: =========================================================
:: 5. VITE
:: =========================================================

echo [5/6] Checking Vite...
echo.

if not exist "node_modules\.bin\vite.cmd" (
    echo [INFO] Vite not found.
    echo Installing project dependencies...
    echo.

    call npm.cmd install

    if errorlevel 1 (
        echo.
        echo ERROR: Dependency installation failed.
        echo.
        pause
        goto END
    )
)

if not exist "node_modules\.bin\vite.cmd" (
    echo.
    echo ERROR: Vite is still missing.
    echo.
    pause
    goto END
)

echo [OK] Vite found.
echo.

:: =========================================================
:: 6. START PROJECT
:: =========================================================

echo [6/6] Starting Vite...
echo.

echo ==========================================
echo          STARTING PROJECT
echo ==========================================
echo.
echo Local URL:
echo http://localhost:5173
echo.
echo Do NOT close this window.
echo.

call npm.cmd run dev -- --port 5173 --open

echo.
echo ==========================================
echo          VITE SERVER STOPPED
echo ==========================================
echo.
pause

:END
echo.
echo ==========================================
echo          BAT FILE FINISHED
echo ==========================================
echo.
pause