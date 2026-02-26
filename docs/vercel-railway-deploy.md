# 🚀 部署教程：Vercel + Railway

## 概述

我们将把你的 DopaGen 项目部署到两个平台：
- **前端（Vercel）**：快速、免费的 CDN 加速
- **后端（Railway）**：稳定的 Express 服务器

---

## 📦 第一步：准备环境变量

### 收集你的配置信息

你需要以下信息：

**Supabase 配置**（从 `server/.env` 文件）：
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_ANON_KEY=your-anon-key
```

**BizyAir API Key**（从 `server/.env` 文件）：
```
BIZYAIR_API_KEY=your-api-key
```

---

## 🌐 第二步：部署后端到 Railway

### 1. 注册 Railway

1. 访问 https://railway.app
2. 点击 "Login" 用 GitHub 账号登录
3. 授权 Railway 访问你的 GitHub

### 2. 创建新项目

1. 点击 "New Project"
2. 选择 "Deploy from GitHub repo"
3. 搜索并选择 `pixox24/Dopagen-ai`
4. 点击 "Add Variables"

### 3. 配置环境变量

添加以下变量：

```env
SUPABASE_URL=https://kgnejgcwdfyhtebyrbip.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_OpRWpEhHxUo0pYCTJ7gR7g_Uv87e-B1
SUPABASE_ANON_KEY=sb_publishable_pnFeM6HEn6cQFgv49FUMNw_eG0hxA_B
BIZYAIR_API_KEY=sk-wxgquflwltzsufpzmycmbykrzitvxgfuxtzbvglveffiizff
PORT=3001
FRONTEND_URL=https://your-vercel-app.vercel.app
```

⚠️ **注意**：请使用你自己的实际值，上面的只是示例！

### 4. 配置启动命令

Railway 会自动检测 package.json，但需要确保启动命令正确。

在项目根目录创建 `railway.json`：

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "cd server && npm install && npm run build"
  },
  "deploy": {
    "startCommand": "cd server && npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### 5. 部署

1. 点击 "Deploy"
2. 等待部署完成（约 2-3 分钟）
3. 部署成功后，你会得到一个 URL：
   `https://dopagen-ai-production.up.railway.app`

**记下这个 URL，下一步要用！**

---

## ⚡ 第三步：部署前端到 Vercel

### 1. 注册 Vercel

1. 访问 https://vercel.com
2. 点击 "Sign Up" 用 GitHub 登录
3. 授权 Vercel 访问你的仓库

### 2. 导入项目

1. 点击 "Add New Project"
2. 选择 `pixox24/Dopagen-ai`
3. 点击 "Import"

### 3. 配置构建设置

| 配置项 | 值 |
|--------|-----|
| Framework Preset | Vite |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

### 4. 配置环境变量

点击 "Environment Variables"，添加：

```env
VITE_API_BASE_URL=https://your-railway-app.up.railway.app/api
```

**把上面的 URL 换成你 Railway 应用的实际地址！**

### 5. 部署

1. 点击 "Deploy"
2. 等待构建完成（约 1-2 分钟）
3. 部署成功后，你会得到：
   `https://dopagen-ai.vercel.app`

---

## 🔧 第四步：更新 Railway 的 CORS 配置

为了让前端能访问后端，需要更新后端的 CORS 配置。

编辑 `server/src/index.ts`，找到 CORS 配置：

```typescript
// 更新为允许 Vercel 域名
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://your-vercel-app.vercel.app',  // 添加这行
    'https://dopagen-ai.vercel.app'        // 生产环境
  ],
  credentials: true
}));
```

提交并推送代码：

```bash
git add .
git commit -m "Update CORS for production"
git push origin main
```

Railway 会自动重新部署！

---

## 🔐 第五步：配置 GitHub Secrets（可选）

如果你想使用 GitHub Actions 自动部署：

### 1. 获取 Vercel Token

1. 访问 https://vercel.com/account/tokens
2. 点击 "Create Token"
3. 复制 Token

### 2. 获取 Vercel 项目信息

在你的项目目录运行：

```bash
npx vercel link
```

然后查看配置：

```bash
cat .vercel/project.json
```

你会看到：
```json
{
  "orgId": "your-org-id",
  "projectId": "your-project-id"
}
```

### 3. 添加到 GitHub Secrets

1. 打开你的 GitHub 仓库
2. 点击 Settings → Secrets and variables → Actions
3. 点击 "New repository secret"
4. 添加以下 secrets：

| Secret 名称 | 值 |
|-------------|-----|
| `VERCEL_TOKEN` | 你从 Vercel 获取的 Token |
| `VERCEL_ORG_ID` | 你的 orgId |
| `VERCEL_PROJECT_ID` | 你的 projectId |

### 4. 启用自动部署

现在每次推送到 main 分支，GitHub Actions 会自动：
1. 运行类型检查
2. 构建项目
3. 部署到 Vercel

---

## 📝 第六步：更新 README

在 README.md 添加部署状态徽章：

```markdown
## 🚀 部署状态

[![Vercel](https://img.shields.io/badge/Vercel-Live-black?logo=vercel)](https://your-vercel-url.vercel.app)
[![CI/CD](https://github.com/pixox24/Dopagen-ai/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/pixox24/Dopagen-ai/actions)
```

---

## 🎯 完成！

现在你的应用已经部署完成：

- **前端**: `https://dopagen-ai.vercel.app`
- **后端**: `https://dopagen-ai-production.up.railway.app`

每次你推送代码到 GitHub：
1. Railway 会自动更新后端
2. GitHub Actions 会自动部署前端到 Vercel

---

## 💡 常见问题

### Q1: 部署后 API 调用失败？

检查以下几点：
1. `VITE_API_BASE_URL` 是否正确设置
2. Railway 的 CORS 是否配置了 Vercel 域名
3. 浏览器控制台是否有 CORS 错误

### Q2: 环境变量不生效？

- Vercel：在 Dashboard → Settings → Environment Variables 检查
- Railway：在 Variables 页面检查
- 修改后需要重新部署

### Q3: 如何自定义域名？

**Vercel**：
1. Dashboard → Domains
2. 添加你的域名
3. 按提示配置 DNS

**Railway**：
1. Dashboard → Settings
2. 点击 "Generate Domain"
3. 或使用自定义域名

### Q4: 免费额度够用吗？

**Vercel**：
- 带宽：100GB/月
- 构建：6000 分钟/月
- 个人项目完全够用

**Railway**：
- $5/月的免费额度
- 足够运行一个小型应用
- 超过后会暂停，不会扣费

---

## 🔄 更新部署

### 更新前端代码

```bash
# 修改代码后
git add .
git commit -m "Update frontend"
git push origin main

# Vercel 会自动部署
```

### 更新后端代码

```bash
# 修改 server/ 目录下的代码
git add .
git commit -m "Update backend"
git push origin main

# Railway 会自动重新部署
```

---

## 📚 相关链接

- [Vercel 文档](https://vercel.com/docs)
- [Railway 文档](https://docs.railway.app)
- [GitHub Actions 文档](https://docs.github.com/actions)

---

**恭喜！你的 DopaGen AI 现在已经成功部署！🎉**
