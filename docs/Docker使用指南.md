# Docker 使用指南

本项目已完整配置 Docker 支持，用于容器化部署。

## 📋 前置要求

- Docker 已安装（[安装指南](https://docs.docker.com/get-docker/)）
- Docker Compose 已安装（通常随 Docker Desktop 自动安装）
- macOS / Linux / Windows (WSL2)

## 🚀 快速开始

### 1. 首次部署

```bash
# 进入项目目录
cd /Users/apple/Desktop/ai-light-studio

# 复制环境配置（根据需要修改）
cp server/.env.example server/.env

# 构建并启动容器
docker-compose up -d --build

# 查看日志
docker-compose logs -f
```

### 2. 访问应用

- **前端应用**：http://localhost:3000
- **后端 API**：http://localhost:3000/api/*

### 3. 常用命令

```bash
# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务（保留数据）
docker-compose down

# 停止服务（删除数据）
docker-compose down -v

# 重新构建并启动
docker-compose up -d --build

# 进入容器 shell
docker-compose exec ai-light-studio sh

# 查看运行中的容器
docker-compose ps
```

## 📁 配置文件说明

### Dockerfile

多阶段构建，优化镜像大小：

1. **web-builder**：构建 Vue 前端（npm run build）
2. **server-deps**：安装后端依赖
3. **runtime**：最终运行镜像

特点：
- 基于 Alpine Linux（轻量级）
- Node 22 LTS
- 自动降级到 node:sqlite（如果 better-sqlite3 编译失败）
- 包含前后端完整应用

### docker-compose.yml

完整的容器编排配置：

```yaml
services:
  ai-light-studio:
    - 映射端口 3000
    - 挂载数据卷 app-data
    - 环境变量注入
    - 自动重启策略
```

### .dockerignore

优化构建上下文：
- 忽略 node_modules
- 忽略 .git
- 忽略构建输出
- 忽略测试文件

## 📊 数据持久化

数据存储在命名卷 `app-data` 中，位置：

```
app-data (Docker Volume)
├── database.db          # SQLite 数据库
├── uploads/             # 上传的源图片
└── results/             # 生成的结果图片
```

### 查看卷内容

```bash
# 查看所有卷
docker volume ls

# 检查卷信息
docker volume inspect ai-light-studio_app-data

# 备份数据
docker run --rm -v ai-light-studio_app-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/app-data.tar.gz -C /data .

# 恢复数据
docker run --rm -v ai-light-studio_app-data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar xzf /backup/app-data.tar.gz -C /data
```

## 🔧 环境变量配置

编辑 `server/.env` 配置：

```bash
# 服务配置
PORT=3000
NODE_ENV=production

# JWT 密钥（修改此值以增加安全性）
JWT_SECRET=your-secret-key-here

# AI 模式：mock | openai | zhipu
AI_MODEL=mock

# 支付模式：mock | wechatpay
PAYMENT_MODE=mock

# 其他配置...
```

## 🐛 故障排除

### 容器无法启动

```bash
# 查看详细日志
docker-compose logs ai-light-studio

# 检查端口是否被占用
lsof -i :3000

# 强制删除并重建
docker-compose down -v
docker-compose up -d --build
```

### 磁盘空间不足

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的卷
docker volume prune

# 清理所有未使用资源
docker system prune -a
```

### 权限问题

```bash
# 确保 Docker daemon 正在运行
docker ps

# macOS：重启 Docker Desktop
# Linux：添加用户到 docker 组
sudo usermod -aG docker $USER
newgrp docker
```

## 📈 生产部署建议

### 1. 使用环境变量覆盖

```bash
docker-compose up -d \
  -e AI_MODEL=openai \
  -e PAYMENT_MODE=wechatpay
```

### 2. 配置反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. 启用 HTTPS

```bash
# 使用 Let's Encrypt + Certbot
certbot certonly --standalone -d api.example.com
```

### 4. 监控和日志

```bash
# 查看容器资源使用
docker stats ai-light-studio

# 导出日志
docker-compose logs > app.log
```

## 📚 相关文档

- [Dockerfile 参考](https://docs.docker.com/engine/reference/builder/)
- [Docker Compose 参考](https://docs.docker.com/compose/compose-file/)
- [Alpine Linux 镜像](https://hub.docker.com/_/alpine)
- [Node.js Docker 最佳实践](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

---

**问题？** 查看 `docs/部署运维手册.md` 获取更多帮助。
