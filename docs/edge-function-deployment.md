# 🚀 Supabase Edge Functions 部署指南（混合方案）

## 架构概览

```
Vercel (前端 React)
    ↓
Supabase Edge Function (/functions/v1/generate) - AI 生成
    ↓
Supabase Database + Auth - 数据存储
```

**优势**：
- ✅ 无需 Railway，纯 Supabase 方案
- ✅ BizyAir API Key 安全存储在 Supabase Secrets
- ✅ 前端直接调用 Supabase Client 查询数据
- ✅ 仅需部署 1 个 Edge Function

---

## 📋 部署步骤

### 步骤 1：安装 Supabase CLI

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录 Supabase
supabase login

# 链接到你的项目
supabase link --project-ref kgnejgcwdfyhtebyrbip
```

### 步骤 2：配置 Secrets

设置环境变量（Supabase 中使用 Secrets）：

```bash
# 设置 BizyAir API Key
supabase secrets set BIZYAIR_API_KEY=sk-wxgquflwltzsufpzmycmbykrzitvxgfuxtzbvglveffiizff

# 验证设置
supabase secrets list
```

⚠️ **注意**：不需要设置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`，Supabase 会自动注入。

### 步骤 3：部署 Edge Function

```bash
# 部署 generate 函数
supabase functions deploy generate

# 查看部署状态
supabase functions list
```

### 步骤 4：配置 Vercel 环境变量

在 Vercel Dashboard → Settings → Environment Variables 添加：

```env
VITE_SUPABASE_URL=https://kgnejgcwdfyhtebyrbip.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxx
```

**不需要** `VITE_API_BASE_URL` 了！前端直接调用 Supabase。

### 步骤 5：更新 Supabase Auth CORS

在 Supabase Dashboard → Authentication → URL Configuration：

**Site URL**:
```
https://dopagen-ai.vercel.app
```

**Redirect URLs**:
```
https://dopagen-ai.vercel.app/auth/callback
https://dopagen-ai.vercel.app/login
http://localhost:3000/*
```

### 步骤 6：重新部署前端

```bash
# 推送代码到 GitHub
git add .
git commit -m "Migrate to Supabase Edge Functions"
git push origin main

# Vercel 会自动重新部署
```

---

## 🧪 本地开发

### 启动 Supabase 本地环境

```bash
# 在项目根目录
supabase start

# 这将启动：
# - PostgreSQL 数据库: localhost:54322
# - Supabase Studio: http://localhost:54323
# - Edge Functions: http://localhost:54321/functions/v1
```

### 本地开发环境变量

创建 `.env` 文件：

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 测试 Edge Function 本地运行

```bash
# 使用 Supabase CLI 测试
supabase functions serve generate

# 或者使用 curl
curl -X POST http://localhost:54321/functions/v1/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "test-model",
    "prompt": "test prompt",
    "params": {"web_app_id": 123, "input_values": {}},
    "userId": "user-uuid"
  }'
```

---

## 📁 文件结构说明

```
supabase/
├── functions/
│   └── generate/
│       └── index.ts          # Edge Function 代码
└── config.toml               # Supabase CLI 配置

services/
└── api.ts                    # 更新后的前端 API 服务
```

### Edge Function 做了什么？

1. 接收前端发来的生成请求
2. 验证用户身份（JWT Token）
3. 调用 BizyAir API（使用安全的 Server-side API Key）
4. 将结果保存到 Supabase 数据库
5. 返回生成的图片 URL

### 前端直接查询 Supabase

- **获取任务列表**：直接查询 `generation_tasks` 表
- **获取图片列表**：直接查询 `images` 表
- **获取用户信息**：使用 `supabase.auth.getUser()`

---

## 🔍 调试和监控

### 查看 Edge Function 日志

```bash
# 实时查看日志
supabase functions logs generate --tail

# 查看历史日志
supabase functions logs generate
```

### 在 Supabase Dashboard 查看

1. **Edge Functions**：https://app.supabase.com/project/_/functions
   - 查看调用次数、执行时间、错误率

2. **Database**：https://app.supabase.com/project/_/editor
   - 查看生成的任务和图片

3. **Logs**：https://app.supabase.com/project/_/logs
   - 查看 Edge Function 详细日志

---

## ⚠️ 常见问题和解决

### Q1: Edge Function 部署失败？

**检查**：
- Supabase CLI 是否登录：`supabase status`
- 项目是否正确链接：`supabase link --project-ref kgnejgcwdfyhtebyrbip`

**解决**：
```bash
# 重新链接项目
supabase unlink
supabase link --project-ref kgnejgcwdfyhtebyrbip
supabase functions deploy generate
```

### Q2: 调用 Edge Function 返回 401？

**原因**：用户未登录或 JWT Token 过期

**解决**：
```typescript
// 确保用户已登录
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  // 跳转到登录页
}
```

### Q3: BizyAir API 调用失败？

**检查**：
1. Secret 是否正确设置：`supabase secrets list`
2. Edge Function 日志：`supabase functions logs generate --tail`

### Q4: CORS 错误？

Edge Function 代码中已经处理了 CORS，但如果还有问题：

在 Supabase Dashboard → Database → Extensions：
- 确保 `pg_net` 扩展已启用

---

## 🔐 安全注意事项

1. **API Keys**
   - ✅ BizyAir API Key 存储在 Supabase Secrets（安全）
   - ✅ 前端不接触任何敏感 API Key
   - ✅ 每次调用都验证用户身份

2. **数据库 RLS**
   - 已启用 Row Level Security
   - 用户只能访问自己的数据

3. **Rate Limiting**
   - Supabase Edge Functions 有调用频率限制
   - 免费版：每个函数 500 次/分钟

---

## 💰 费用估算

**Supabase 免费套餐**：
- Edge Function 调用：500K/月（足够）
- 数据库：500MB 存储 + 无限请求
- Auth：无限用户

**个人项目完全免费！**

---

## 🎉 完成！

部署完成后，你的应用架构是：

| 组件 | 技术 | 平台 |
|------|------|------|
| 前端 | React + Vite | Vercel |
| AI 生成 | Edge Function | Supabase |
| 数据存储 | PostgreSQL | Supabase |
| 认证 | Supabase Auth | Supabase |

**无需任何其他后端服务！** 🚀

---

## 📞 需要帮助？

- Supabase 文档：https://supabase.com/docs
- Edge Functions 文档：https://supabase.com/docs/guides/functions
- 社区 Discord：https://discord.supabase.com
