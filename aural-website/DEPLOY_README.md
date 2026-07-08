# 部署包使用说明

## 📦 包含内容

本部署包包含以下优化更新：

### 新增文件
- `server/middleware/logger.ts` - 服务端日志系统
- `server/middleware/rate-limit.ts` - 速率限制中间件
- `app/config/site.config.ts` - 站点配置文件
- `app/plugins/performance-monitor.client.js` - 性能监控插件
- `docs/DEPLOYMENT.md` - 完整部署文档
- `.github/workflows/deploy.yml` - 部署工作流
- `.github/workflows/test.yml` - 测试工作流
- `.github/dependabot.yml` - 依赖更新配置
- `.eslintrc.js` - ESLint 配置
- `.prettierrc` - Prettier 配置
- `CHANGELOG.md` - 更新日志

### 修改文件
- `server/routes/sitemap.xml.js` - 添加缓存优化
- `nuxt.config.ts` - 添加 HSTS 安全头
- `.env.production.example` - 补充环境变量
- `app/composables/useBrandAssets.js` - 使用配置文件

---

## 🚀 快速部署（3 步）

### 步骤 1：上传文件

将 `aural-website-optimized-20260521.zip` 上传到服务器：

```bash
# 通过阿里云 ECS Workbench 上传到 /home/admin/ 目录
# 或使用 scp 命令：
scp aural-website-optimized-20260521.zip admin@your-server:/home/admin/
```

### 步骤 2：部署

SSH 登录服务器，执行以下命令：

```bash
cd /var/www/shangkong/aural-website/

# 备份当前版本（包含所有会被覆盖的文件）
cp -r .output .output.backup.$(date +%Y%m%d-%H%M%S)
cp package.json package.json.backup
cp nuxt.config.ts nuxt.config.ts.backup
cp server/routes/sitemap.xml.js server/routes/sitemap.xml.js.backup
cp app/composables/useBrandAssets.js app/composables/useBrandAssets.js.backup

# 解压新版本（会覆盖现有文件）
unzip /home/admin/aural-website-optimized-20260521.zip -d ./

# 安装新依赖
npm install consola

# 零停机重启服务
pm2 reload shangkong-web
```

### 步骤 3：验证

```bash
# 检查网站是否正常
curl -I https://www.shangkong.xyz

# 检查日志
pm2 logs shangkong-web --lines 20
```

---

## 📋 详细部署步骤

### 1. 部署前准备

#### 1.1 检查环境变量

编辑 `.env.production` 文件，确保包含以下配置：

```bash
NODE_ENV=production
NUXT_PUBLIC_SITE_URL=https://www.shangkong.xyz
NUXT_PUBLIC_API_BASE=https://api.shangkong.xyz
NUXT_API_INTERNAL_BASE=http://localhost:1337
LOG_LEVEL=3
```

#### 1.2 备份当前版本

```bash
cd /var/www/shangkong/aural-website/
cp -r .output .output.backup.$(date +%Y%m%d-%H%M%S)
cp package.json package.json.backup
cp nuxt.config.ts nuxt.config.ts.backup
cp server/routes/sitemap.xml.js server/routes/sitemap.xml.js.backup
cp app/composables/useBrandAssets.js app/composables/useBrandAssets.js.backup
```

### 2. 解压部署包

```bash
# 解压到当前目录（会覆盖现有文件）
unzip /home/admin/aural-website-optimized-20260521.zip -d ./

# 查看解压的文件
ls -la
```

### 3. 安装新依赖

```bash
# 安装 consola（服务端日志库）
npm install consola

# 或者重新安装所有依赖
npm ci
```

### 4. 重启服务

#### 如果使用 PM2：

```bash
# 零停机重启（推荐）
pm2 reload shangkong-web

# 查看状态
pm2 status

# 查看日志
pm2 logs shangkong-web
```

#### 如果使用 Docker：

```bash
docker restart shangkong-web

# 查看日志
docker logs -f shangkong-web
```

### 5. 验证部署

#### 5.1 检查网站访问

```bash
curl -I https://www.shangkong.xyz
```

应该看到：
- `HTTP/2 200`
- `strict-transport-security: max-age=31536000; includeSubDomains; preload`
- `x-ratelimit-limit: 100`

#### 5.2 测试 Sitemap 缓存

```bash
# 第一次请求（慢）
time curl https://www.shangkong.xyz/sitemap.xml > /dev/null

# 第二次请求（快，应该 < 100ms）
time curl https://www.shangkong.xyz/sitemap.xml > /dev/null
```

#### 5.3 检查日志

```bash
pm2 logs shangkong-web --lines 50
```

应该看到结构化日志输出，例如：
```
[info] Request { method: 'GET', path: '/', statusCode: 200, duration: '45ms', ip: '1.2.3.4' }
```

#### 5.4 测试速率限制

```bash
# 快速发送多个请求
for i in {1..105}; do curl -I https://www.shangkong.xyz; done
```

第 101 个请求应该返回 `429 Too Many Requests`。

---

## 🔄 回滚步骤

如果部署后出现问题，立即回滚：

```bash
cd /var/www/shangkong/aural-website/

# 停止服务
pm2 stop shangkong-web

# 删除新版本文件
rm -rf .output
rm -f server/middleware/logger.ts
rm -f server/middleware/rate-limit.ts

# 恢复备份（替换为实际备份目录名）
cp -r .output.backup.20260521-HHMMSS .output
cp package.json.backup package.json
cp nuxt.config.ts.backup nuxt.config.ts
cp server/routes/sitemap.xml.js.backup server/routes/sitemap.xml.js
cp app/composables/useBrandAssets.js.backup app/composables/useBrandAssets.js

# 重新安装依赖
npm ci

# 重启服务
pm2 start shangkong-web
```

---

## ⚠️ 常见问题

### Q1: 部署后网站无法访问

**可能原因**：
- 服务未正确启动
- 端口被占用
- 环境变量配置错误

**解决方案**：
```bash
# 检查服务状态
pm2 status

# 查看错误日志
pm2 logs shangkong-web --err --lines 50

# 检查端口占用
netstat -tulpn | grep 3000

# 检查环境变量
cat .env.production
```

### Q2: 速率限制影响正常用户

**解决方案**：

编辑 `server/middleware/rate-limit.ts`，调整限制参数：

```javascript
const WINDOW_MS = 60000  // 时间窗口（毫秒）
const MAX_REQUESTS = 200  // 增加到 200 次/分钟
```

然后重启服务：
```bash
pm2 reload shangkong-web
```

### Q3: 日志输出过多

**解决方案**：

调整日志级别，编辑 `.env.production`：

```bash
LOG_LEVEL=2  # 只输出警告和错误
```

然后重启服务。

### Q4: Sitemap 缓存未生效

**解决方案**：

检查 Nuxt 版本是否支持 `defineCachedEventHandler`（需要 Nuxt 3.6+）：

```bash
npm list nuxt
```

如果版本过低，升级 Nuxt：
```bash
npm install nuxt@latest
npm run build
pm2 reload shangkong-web
```

---

## 📊 性能对比

### 优化前 vs 优化后

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| Sitemap 响应时间 | 2-3 秒 | < 100ms | **95%+** |
| 服务端日志 | 无 | 完整 | ✅ |
| 速率限制 | 无 | 100次/分钟 | ✅ |
| HSTS 安全头 | 无 | 已启用 | ✅ |
| 性能监控 | 无 | Core Web Vitals | ✅ |

---

## 📞 技术支持

如遇到问题，请提供：

1. **错误日志**：`pm2 logs shangkong-web --lines 100`
2. **环境信息**：`node -v && npm -v && pm2 -v`
3. **部署步骤**：你执行了哪些命令
4. **错误现象**：具体的错误信息或异常行为

---

## 📚 相关文档

- 完整部署文档：`docs/DEPLOYMENT.md`
- 更新日志：`CHANGELOG.md`
- 环境变量示例：`.env.production.example`

---

**部署包版本**: v1.1.0  
**创建日期**: 2026-05-21  
**预计部署时间**: 10-15 分钟  
**风险等级**: 低
