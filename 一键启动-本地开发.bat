@echo off
chcp 65001 >nul
title 胡氏管乐网站 - 本地三端启动
cd /d %~dp0

echo [1/3] 启动 API 后端 http://127.0.0.1:1337
start "胡氏管乐-API后端" cmd /k "cd /d %~dp0aural-api && set NODE_ENV=development&& set DATABASE_URL=file:./dev.db&& set PORT=1337&& set ADMIN_USERNAME=demo_admin&& set ADMIN_PASSWORD=DemoPass_2026!&& set ADMIN_TOKEN_SECRET=hushi-demo-local-token-secret-2026-change-me&& npm start"

echo [2/3] 启动前台官网 http://127.0.0.1:3000
start "胡氏管乐-前台官网" cmd /k "cd /d %~dp0aural-website && set NUXT_PUBLIC_API_BASE=http://127.0.0.1:1337&& set NUXT_API_INTERNAL_BASE=http://127.0.0.1:1337&& set NUXT_PUBLIC_SITE_URL=http://127.0.0.1:3000&& set NUXT_PUBLIC_BRAND_IMAGE_BASE=http://127.0.0.1:1337/uploads/real-assets&& npm run dev -- --host 127.0.0.1 --port 3000"

echo [3/3] 启动后台管理 http://127.0.0.1:5175
start "胡氏管乐-后台管理" cmd /k "cd /d %~dp0aural-admin && set VITE_API_BASE=http://127.0.0.1:1337&& set VITE_SITE_URL=http://127.0.0.1:3000&& npm run dev -- --host 127.0.0.1 --port 5175"

echo.
echo 请等待 20-60 秒后打开：
echo 前台官网：http://127.0.0.1:3000
echo 后台管理：http://127.0.0.1:5175
echo API健康检查：http://127.0.0.1:1337/health
echo 后台测试账号：admin
echo 后台测试密码：123456
echo.
pause
