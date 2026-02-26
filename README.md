# DopaGen AI - Full Stack

这是一个基于 React + Node.js + Supabase 的 AI 图片生成平台。

## 🚀 快速开始

### 1. 配置 Supabase

1. 登录 [Supabase](https://supabase.com) 创建新项目。
2. 进入 SQL Editor，复制并运行 `server/supabase/001_initial_schema.sql` 中的内容。
3. 创建名为 `generated-images` 的 Storage Bucket，并设置为 Public。
4. 获取项目的 URL 和 API Keys。

### 2. 配置环境变量

**前端 (`.env.local`)**
```env
VITE_SUPABASE_URL=你的项目URL
VITE_SUPABASE_ANON_KEY=你的anon key
VITE_API_BASE_URL=http://localhost:3001
```

**后端 (`server/.env`)**
```env
SUPABASE_URL=你的项目URL
SUPABASE_SERVICE_KEY=你的service_role key (注意不是 anon key)
BIZYAIR_API_KEY=你的BizyAir Key
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 3. 安装与运行

**后端**
```bash
cd server
npm install
npm run dev
```

**前端**
```bash
cd ..
npm install
npm run dev
```

访问 `http://localhost:3000` 即可开始使用。

## 🛠 技术栈

- **前端**: React, Vite, TypeScript, Tailwind CSS
- **后端**: Node.js, Express
- **数据库**: Supabase (PostgreSQL)
- **认证**: Supabase Auth
- **存储**: Supabase Storage
- **AI 服务**: BizyAir API

## 🔒 安全性说明

- 前端不再硬编码 API Key，所有请求通过后端代理。
- 数据库启用了 RLS (Row Level Security)，确保用户数据隔离。
- 后端 API 使用 JWT 验证用户身份。
