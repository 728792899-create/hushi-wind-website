# 胡氏管乐网站 - 部署文档

## 📋 目录

- [环境要求](#环境要求)
- [环境变量配置](#环境变量配置)
- [部署流程](#部署流程)
- [部署前检查清单](#部署前检查清单)
- [回滚步骤](#回滚步骤)
- [常见问题](#常见问题)

---

## 环境要求

### 服务器环境

- **Node.js**: >= 18.0.0（推荐 20.x LTS）
- **npm**: >= 9.0.0
- **内存**: >= 2GB
- **磁盘空间**: >= 5GB
- **操作系统**: Linux (Ubuntu 20.04+, CentOS 8+) 或 Docker

### 进程管理器

推荐使用以下任一方式：
- **PM2**: 适合传统服务器部署
- **Docker**: 适合容器化部署
- **systemd**: 适合系统级服务管理

---

## 环境变量配置

### 1. 创建环境变量文件

复制示例文件并填写实际值：

```bash
cp .env.production.example .env.production
```

### 2. 必需配置项

以下配置项在生产环境中**必须设置**：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NODE_ENV` | Node 环境 | `production` |
| `NUXT_PUBLIC_SITE_URL` | 网站公开访问地址 | `https://www.shangkong.xyz` |
| `NUXT_PUBLIC_API_BASE` | API 服务地址（客户端） | `https://api.shangkong.xyz` |

### 3. 可选配置项

| 变量名 | 说明 | 默认值 | 示例值 |
|--------|------|--------|--------|
| `NUXT_API_INTERNAL_BASE` | API 服务地址（服务端内部） | 使用 `NUXT_PUBLIC_API_BASE` | `http://localhost:1337` |
| `NUXT_PUBLIC_UPLOAD_BASE` | 上传文件访问地址 | - | `https://cdn.shangkong.xyz` |
| `NUXT_PUBLIC_CDN_URL` | CDN 地址 | - | `https://cdn.shangkong.xyz` |
| `NUXT_PUBLIC_BRAND_IMAGE_BASE` | 品牌图片资源路径 | `/uploads/real-assets` | `/uploads/real-assets` |
| `LOG_LEVEL` | 日志级别 (0-5) | `3` | `3` (info) |

### 4. 日志级别说明

- `0` = silent（静默，无日志）
- `1` = error（仅错误）
- `2` = warn（警告及以上）
- `3` = info（信息及以上，推荐生产环境）
- `4` = debug（调试及以上）
- `5` = trace（追踪所有）

---

## 部署流程

### 方案 A：手动部署（打包上传）

#### 1. 本地构建

```bash
# 安装依赖
npm ci

# 构建生产版本
npm run build

# 打包构建产物
tar -czf aural-website-$(date +%Y%m%d-%H%M%S).tar.gz .output package.json package-lock.json
```

#### 2. 上传到服务器

使用 SFTP/SCP 上传打包文件：

```bash
scp aural-website-*.tar.gz user@your-server:/path/to/deploy/
```

或通过阿里云 ECS Workbench 上传。

#### 3. 服务器部署

```bash
# 进入项目目录
cd /var/www/shangkong/aural-website/

# 备份当前版本
cp -r .output .output.backup.$(date +%Y%m%d-%H%M%S)

# 解压新版本
tar -xzf aural-website-*.tar.gz

# 安装生产依赖（如果 package.json 有变化）
npm ci --omit=dev

# 重启服务
pm2 restart shangkong-web
# 或 Docker: docker restart shangkong-web
```

---

### 方案 B：Git 部署

#### 1. 服务器拉取代码

```bash
cd /var/www/shangkong/aural-website/
git pull origin main
```

#### 2. 安装依赖并构建

```bash
# 安装依赖
npm ci

# 构建
npm run build
```

#### 3. 重启服务

```bash
pm2 restart shangkong-web
```

---

### 方案 C：Docker 部署

#### 1. 构建 Docker 镜像

```bash
docker build -t aural-website:latest .
```

#### 2. 运行容器

```bash
docker run -d \
  --name shangkong-web \
  -p 3000:3000 \
  --env-file .env.production \
  aural-website:latest
```

#### 3. 更新容器

```bash
docker stop shangkong-web
docker rm shangkong-web
docker run -d --name shangkong-web -p 3000:3000 --env-file .env.production aural-website:latest
```

---

## 部署前检查清单

在部署到生产环境前，**必须**完成以下检查：

### ✅ 代码检查

- [ ] 所有代码已提交到 Git
- [ ] 没有 `console.log` 调试代码
- [ ] 没有硬编码的测试数据
- [ ] 环境变量配置正确

### ✅ 构建验证

运行以下命令确保构建成功：

```bash
# 1. 验证构建产物
npm run verify:public

# 2. 启动检查（SEO、安全头、性能）
npm run launch:check

# 3. 端到端冒烟测试
npm run smoke:e2e

# 4. 性能检查
npm run perf:check

# 5. Bundle 大小检查
npm run bundle:check

# 6. 安全检查
npm run security:check

# 7. 依赖安全审计
npm run audit:prod
```

### ✅ 环境检查

- [ ] `.env.production` 文件已创建并配置
- [ ] `NUXT_PUBLIC_SITE_URL` 指向正确的域名
- [ ] `NUXT_PUBLIC_API_BASE` 可访问
- [ ] 服务器磁盘空间充足（>= 5GB）
- [ ] 服务器内存充足（>= 2GB）

### ✅ 备份检查

- [ ] 已备份当前运行的版本
- [ ] 已备份数据库（如有）
- [ ] 已记录当前 Git commit hash

---

## 回滚步骤

如果部署后发现问题，按以下步骤回滚：

### 1. 快速回滚（恢复备份）

```bash
cd /var/www/shangkong/aural-website/

# 停止当前服务
pm2 stop shangkong-web

# 删除问题版本
rm -rf .output

# 恢复备份（替换为实际备份目录名）
cp -r .output.backup.20260521-143000 .output

# 重启服务
pm2 start shangkong-web
```

### 2. Git 回滚

```bash
# 查看提交历史
git log --oneline

# 回滚到指定版本
git reset --hard <commit-hash>

# 重新构建
npm run build

# 重启服务
pm2 restart shangkong-web
```

### 3. 验证回滚

```bash
# 检查网站是否正常
curl -I https://www.shangkong.xyz

# 查看日志
pm2 logs shangkong-web
```

---

## 常见问题

### Q1: 构建失败，提示内存不足

**解决方案：**

```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" npm run build
```

### Q2: 部署后页面显示 404

**可能原因：**
- `.output` 目录未正确生成
- 服务未正确启动
- 路由配置错误

**解决方案：**

```bash
# 检查 .output 目录是否存在
ls -la .output/

# 检查服务状态
pm2 status

# 查看日志
pm2 logs shangkong-web --lines 100
```

### Q3: API 请求失败

**可能原因：**
- 环境变量配置错误
- API 服务未启动
- 网络不通

**解决方案：**

```bash
# 检查环境变量
cat .env.production

# 测试 API 连接
curl -I $NUXT_PUBLIC_API_BASE/api/config

# 检查服务端内部 API（如果配置了）
curl -I $NUXT_API_INTERNAL_BASE/api/config
```

### Q4: 静态资源加载失败

**可能原因：**
- CDN 配置错误
- CSP 策略阻止

**解决方案：**

```bash
# 检查 CSP 配置
curl -I https://www.shangkong.xyz | grep -i content-security

# 检查 CDN 地址
echo $NUXT_PUBLIC_CDN_URL
```

### Q5: PM2 进程频繁重启

**可能原因：**
- 内存泄漏
- 未捕获的异常
- 端口被占用

**解决方案：**

```bash
# 查看详细日志
pm2 logs shangkong-web --lines 200

# 检查内存使用
pm2 monit

# 检查端口占用
netstat -tulpn | grep 3000
```

---

## 监控和维护

### 日志查看

```bash
# PM2 日志
pm2 logs shangkong-web

# 系统日志（如果使用 systemd）
journalctl -u shangkong-web -f

# Docker 日志
docker logs -f shangkong-web
```

### 性能监控

```bash
# PM2 监控
pm2 monit

# 内存使用
free -h

# 磁盘使用
df -h
```

### 定期维护

- **每周**：检查日志，确保无异常错误
- **每月**：运行 `npm audit` 检查依赖安全漏洞
- **每季度**：更新依赖到最新稳定版本
- **每半年**：清理旧的备份文件

---

## 联系支持

如遇到部署问题，请提供以下信息：

1. 错误日志（`pm2 logs` 或 `docker logs`）
2. 环境变量配置（隐藏敏感信息）
3. 服务器环境信息（`node -v`, `npm -v`, `uname -a`）
4. 部署步骤和出错位置

---

**最后更新**: 2026-05-21
