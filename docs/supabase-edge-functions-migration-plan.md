# Supabase Edge Functions 迁移方案

## 🎯 迁移策略概览

### 架构对比

**原有架构 (Express + Railway)**
```
前端 (Vercel) → Express 后端 (Railway) → Supabase 数据库
                     ↓
               BizyAir API (AI 生成)
```

**新架构 (纯 Supabase)**
```
前端 (Vercel) → Supabase Edge Functions → Supabase 数据库
                     ↓
               BizyAir API (AI 生成)
                     ↓
               Database Webhook (状态更新)
```

### 技术挑战与解决方案

| 挑战 | Express 方案 | Edge Functions 方案 |
|------|-------------|-------------------|
| **长时间任务** | Express 后台异步处理 | Database Webhook + Edge Function 链式调用 |
| **API Key 安全** | 存储在服务端环境变量 | 存储在 Supabase Secrets |
| **文件大小限制** | 50MB (Express) | 50MB (Edge Function 内存限制) |
| **超时限制** | 无限制 | 400s (足够 AI 生成) |
| **并发处理** | Node.js 异步 | Deno 异步 |

## 📁 Edge Functions 目录结构

```
supabase/
├── functions/
│   ├── _shared/
│   │   ├── supabase.ts          # Supabase 客户端
│   │   ├── cors.ts              # CORS 处理
│   │   └── types.ts             # 类型定义
│   ├── auth/
│   │   └── index.ts             # 认证相关
│   ├── tasks/
│   │   └── index.ts             # 任务管理
│   ├── images/
│   │   └── index.ts             # 图片管理
│   ├── models/
│   │   └── index.ts             # 模型管理
│   └── webhook/
│       └── process-task.ts      # 后台任务处理
├── config.toml                  # Supabase CLI 配置
└── migrations/                  # 数据库迁移（已有）
```

## 🔐 认证流程

### 用户注册/登录
```
用户输入 → 前端直接调用 Supabase Auth API → 获取 session
```

**无需 Edge Function！** Supabase Auth 已经提供了完整的 REST API。

前端直接使用：
```typescript
const { data, error } = await supabase.auth.signUp({
  email, password
})
```

## 🎨 任务生成流程（关键）

### 方案 A：同步处理（简单，但有超时风险）
```
1. 前端调用 Edge Function → tasks/create
2. Edge Function 直接调用 BizyAir API
3. 等待结果（最多 400s）
4. 返回结果给前端
```

### 方案 B：异步处理（推荐，更稳健）
```
1. 前端调用 Edge Function → tasks/create
2. Edge Function 创建任务记录（status: PENDING）
3. 返回 taskId 给前端
4. Database Webhook 触发 → functions-webhook
5. Webhook 调用 BizyAir API
6. 完成后更新数据库（status: COMPLETED）
7. 前端使用 Supabase Realtime 监听状态变化
```

## 📝 功能映射表

| 原 Express 路由 | Edge Function 路径 | 说明 |
|----------------|-------------------|------|
| `POST /api/auth/signup` | 直接使用 Supabase Auth | 无需 Edge Function |
| `POST /api/auth/login` | 直接使用 Supabase Auth | 无需 Edge Function |
| `GET /api/auth/me` | `GET /functions/v1/auth/me` | 获取用户信息 |
| `GET /api/tasks` | `GET /functions/v1/tasks` | 获取任务列表 |
| `POST /api/tasks` | `POST /functions/v1/tasks` | 创建任务 |
| `GET /api/tasks/:id` | `GET /functions/v1/tasks?id=xxx` | 获取任务详情 |
| `DELETE /api/tasks/:id` | `DELETE /functions/v1/tasks?id=xxx` | 删除任务 |
| `GET /api/images` | 直接使用 Supabase Client | 查询 images 表 |
| `GET /api/models` | `GET /functions/v1/models` | 获取模型列表 |
| `POST /api/models` | `POST /functions/v1/models` | 创建模型 |

## 🚀 实施步骤

### 步骤 1：安装 Supabase CLI

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 初始化项目
supabase init
```

### 步骤 2：创建 Edge Functions

```bash
# 创建函数
supabase functions new auth
supabase functions new tasks
supabase functions new images
supabase functions new models
supabase functions new webhook
```

### 步骤 3：配置 Secrets

```bash
# 设置环境变量
supabase secrets set BIZYAIR_API_KEY=your_key
supabase secrets set SUPABASE_URL=your_url
supabase secrets set SUPABASE_SERVICE_KEY=your_key
```

### 步骤 4：部署

```bash
# 部署所有函数
supabase functions deploy

# 或者单独部署
supabase functions deploy tasks
```

## ⚠️ 限制与注意事项

1. **超时限制**：400s（足够 AI 生成，但不要太大的图）
2. **内存限制**：50MB（不能处理超大文件）
3. **并发限制**：根据 Supabase 套餐
4. **冷启动**：首次调用可能有延迟

## 💡 优化建议

1. **使用 Realtime**：前端监听任务状态，而不是轮询
2. **分批处理**：如果一次生成多张图，分批调用
3. **错误重试**：Edge Function 自动重试失败请求
4. **日志监控**：在 Supabase Dashboard 查看函数日志

## 🔄 迁移时间估算

| 任务 | 预计时间 | 复杂度 |
|------|---------|--------|
| 设置环境 | 30 分钟 | ⭐ |
| 迁移任务功能 | 2-3 小时 | ⭐⭐⭐ |
| 迁移图片功能 | 1 小时 | ⭐⭐ |
| 迁移模型功能 | 1 小时 | ⭐⭐ |
| 前端适配 | 1-2 小时 | ⭐⭐ |
| 测试部署 | 1 小时 | ⭐⭐ |

**总计：6-8 小时**

---

**你确定要 proceed 吗？这是一个较大的改动，需要一定时间完成。或者我们可以：**
- **Plan A**: 继续迁移到 Edge Functions（完全无服务器）
- **Plan B**: 简化方案，前端直接调用 BizyAir API（快速，但暴露 API key）
- **Plan C**: 使用 Supabase + 简化版后端（混合方案）

**请告诉我你的选择！**
