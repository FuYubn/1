@echo off
chcp 65001 >nul
setlocal

title DeepSeek Local API Launcher
cd /d "%~dp0"

set "MODEL=deepseek-r1:8b"
set "API_PORT=3000"

echo.
echo ============================================
echo   DeepSeek Local API Launcher
echo ============================================
echo.

where ollama >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Ollama is not installed or not in PATH.
  echo Please install Ollama first, then run this file again.
  echo https://ollama.com/download
  echo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not in PATH.
  echo Please install Node.js LTS first.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available.
  pause
  exit /b 1
)

echo [1/4] Checking Ollama service...
curl -s --max-time 2 http://127.0.0.1:11434/api/tags >nul 2>nul
if errorlevel 1 (
  echo Ollama is not running. Starting it now...
  start "Ollama Service" /min cmd /c "ollama serve"
  timeout /t 4 /nobreak >nul

  curl -s --max-time 3 http://127.0.0.1:11434/api/tags >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Ollama did not start successfully.
    echo Try running: ollama serve
    echo.
    pause
    exit /b 1
  )
) else (
  echo Ollama is already running.
)

echo.
echo [2/4] Checking model: %MODEL%
ollama list | findstr /I /C:"%MODEL%" >nul 2>nul
if errorlevel 1 (
  echo Model not found. Downloading %MODEL%...
  echo This can take a while depending on your connection.
  ollama pull %MODEL%
  if errorlevel 1 (
    echo [ERROR] Model download failed.
    pause
    exit /b 1
  )
) else (
  echo Model is ready.
)

echo.
echo [3/4] Checking Node dependencies...
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo Dependencies are already installed.
)

echo.
echo [4/4] Starting local DeepSeek API...
echo.
echo OpenAI-compatible endpoint:
echo   http://127.0.0.1:%API_PORT%/v1/chat/completions
echo.
echo Health check:
echo   http://127.0.0.1:%API_PORT%/api/deepseek/health
echo.
echo Model:
echo   %MODEL%
echo.
echo Press Ctrl+C to stop the Node API.
echo ============================================
echo.

set "DEEPSEEK_MODEL=%MODEL%"
set "OLLAMA_BASE_URL=http://127.0.0.1:11434"
set "PORT=%API_PORT%"

call npm start

echo.
echo API stopped.
pause
endlocal
