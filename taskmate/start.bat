@echo off
chcp 65001 >nul
title TaskMate · DeepSeek 代理服务

echo.
echo   ╔══════════════════════════════════════════╗
echo   ║     TaskMate · DeepSeek 本地代理启动器     ║
echo   ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ 未检测到 Node.js，请先安装 Node.js
    echo     下载地址：https://nodejs.org
    pause
    exit /b 1
)

:: 检查 .env 文件
if not exist .env (
    if exist .env.example (
        echo   ⚠️  未找到 .env 文件，正在从 .env.example 复制...
        copy .env.example .env >nul
        echo   📝 已创建 .env 文件，请编辑填入你的 DeepSeek API Key
        echo      文件位置：%~dp0.env
        echo.
        start notepad .env
        echo   按任意键继续启动（请确保已填入 Key）...
        pause >nul
    ) else (
        echo   ❌ 未找到 .env 或 .env.example 文件
        pause
        exit /b 1
    )
)

:: 安装依赖
if not exist node_modules (
    echo   📦 首次运行，正在安装依赖...
    npm install
    if %errorlevel% neq 0 (
        echo   ❌ 依赖安装失败
        pause
        exit /b 1
    )
    echo.
)

echo   🚀 正在启动代理服务...
echo.
node server.js

pause