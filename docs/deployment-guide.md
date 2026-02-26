# CI/CD 和部署指南

## 1. GitHub Actions CI/CD

### 什么是 CI/CD？

**CI (Continuous Integration) 持续集成**：
- 每次代码提交自动运行测试和构建
- 确保代码质量，及早发现问题
- 自动检查代码规范

**CD (Continuous Deployment) 持续部署**：
- 代码通过测试后自动部署到服务器
- 无需手动操作，提高发布效率
- 快速迭代，快速交付

### 工作流程示例

```
代码提交 → 运行测试 → 构建项目 → 部署到服务器
    ↑                                      ↓
    └──────────── 自动化循环 ──────────────┘
```

### 本项目中的 GitHub Actions 可以做：

1. **自动测试**
   - 运行 TypeScript 类型检查
   - 运行 ESLint 代码规范检查
   - 运行单元测试（如果有）

2. **自动构建**
   - 构建前端（Vite build）
   - 构建后端（tsc 编译）
   - 检查构建是否成功

3. **自动部署**
   - 部署前端到 Vercel/Netlify
   - 部署后端到 Railway/Render
   - 自动更新服务器

## 2. 部署平台对比

### Vercel

**最适合**：Next.js、React、Vue 等前端项目

**优点**：
- 零配置部署，Git 连接后自动部署
- 全球 CDN，访问速度快
- 预览环境（每个 PR 都有独立预览链接）
- 免费额度充足（个人项目够用）
- 内置 Serverless Functions

**缺点**：
- 后端支持有限（主要是 Serverless）
- 长时间运行的进程不适合

**适用场景**：
- 纯前端项目
- 使用 Next.js 的全栈项目
- 需要 Serverless API 的项目

### Netlify

**最适合**：静态网站、Jamstack 项目

**优点**：
- 配置简单，拖拽即可部署
- 表单处理、身份验证等内置功能
- 边缘函数（Edge Functions）
- 分支预览（类似 Vercel）

**缺点**：
- 构建时间限制较严
- Serverless 功能不如 Vercel 完善

**适用场景**：
- 静态网站
- 需要表单处理的项目
- Gatsby、Hugo 等静态生成器项目

### Railway / Render

**最适合**：全栈应用、Express 后端

**优点**：
- 支持长时间运行的服务器
- 自动部署 Docker 容器
- 内置数据库（PostgreSQL、Redis）
- 环境变量管理方便

**适用场景**：
- Express/Koa 后端服务
- 需要 WebSocket 的应用
- 需要数据库的应用

## 3. 本项目的部署策略

### 方案 A：分离部署（推荐）

**前端 → Vercel**
- 静态文件部署
- 自动 CDN 加速
- 自定义域名支持

**后端 → Railway/Render**
- Express 服务器运行
- 环境变量配置 API keys
- 持续运行服务

**优点**：
- 前后端独立扩展
- 各自优化，互不干扰
- 专业平台做专业事

### 方案 B：全栈部署到 Railway

**整体 → Railway**
- 使用 Docker 或 Procfile
- 前端构建后作为静态文件服务
- 后端 API 服务

**优点**：
- 统一部署管理
- 简化配置

**缺点**：
- 没有 Vercel 的 CDN 优化
- 预览环境功能较弱

## 4. 配置步骤

### Vercel 部署（前端）

1. 访问 https://vercel.com
2. 用 GitHub 账号登录
3. 点击 "New Project"
4. 导入 `pixox24/Dopagen-ai` 仓库
5. 配置：
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Root Directory: `./` (根目录，因为 package.json 在根目录)
6. 环境变量：
   - `VITE_API_BASE_URL` = 你的后端 API 地址
7. 点击 Deploy

### Railway 部署（后端）

1. 访问 https://railway.app
2. 用 GitHub 登录
3. 新建项目 → Deploy from GitHub repo
4. 选择仓库
5. 添加环境变量：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `SUPABASE_ANON_KEY`
   - `BIZYAIR_API_KEY`
   - `PORT` = 3001
6. 自动检测 package.json 并部署

### GitHub Actions 配置

创建 `.github/workflows/ci.yml`：
- 提交代码时自动运行类型检查
- 自动部署到 Vercel（可选）
- 自动部署后端（可选）

## 5. 建议配置

对于你的 DopaGen 项目，我建议：

1. **前端**：Vercel（快速、免费、有预览环境）
2. **后端**：Railway（支持 Express、有免费额度）
3. **CI/CD**：GitHub Actions
   - 提交 PR 时运行类型检查
   - 合并到 main 时自动部署

这样可以实现：
- 代码提交 → 自动测试 → 自动部署
- 开发环境（preview）和生产环境分开
- 团队协作更安全
