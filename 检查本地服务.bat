@echo off
chcp 65001 >nul
echo 检查 API...
curl http://127.0.0.1:1337/health
echo.
echo 检查前台...
curl -I http://127.0.0.1:3000
echo.
echo 检查后台...
curl -I http://127.0.0.1:5175
echo.
pause
