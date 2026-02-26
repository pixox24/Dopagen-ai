# 🚀 Supabase 部署指南

## 概述

DopaGen AI 使用 Supabase 作为全托管后端服务，提供：
- **PostgreSQL 数据库** - 数据存储
- **身份认证** - 用户注册/登录
- **实时订阅** - 数据变更监听
- **存储** - 图片文件存储（可选）

## 部署策略

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Vercel        │      │   Railway       │      │   Supabase      │
│  (前端)         │ ──── │  (后端 API)     │ ──── │  (数据库)       │
└─────────────────┘      └─────────────────┘      └─────────────────┘
       │                         │                         │
       └─────────────────────────┴─────────────────────────┘
                        您的 DopaGen AI 应用
```

## 第一步：创建 Supabase 项目

### 1. 注册/登录 Supabase

1. 访问 https://supabase.com
2. 点击 "Start your project"
3. 用 GitHub 账号登录

### 2. 创建新项目

1. 点击 "New Project"
2. 选择 Organization（或创建新的）
3. 填写项目信息：
   - **Name**: `dopagen-ai`
   - **Database Password**: 生成强密码并保存！
   - **Region**: 选择离你最近的（如 Singapore）
4. 点击 "Create new project"
5. 等待项目创建（约 1-2 分钟）

### 3. 获取 API 凭证

创建完成后，进入 **Project Settings** → **API**：

记录以下信息：
```
Project URL: https://kgnejgcwdfyhtebyrbip.supabase.co
Project API keys:
  - anon public: sb_publishable_xxxxxxxxxx...
  - service_role secret: sb_secret_xxxxxxxxxx...
```

⚠️ **重要**：`service_role` key 是超级管理员密钥，**绝对不要暴露到前端**！

## 第二步：执行数据库迁移

### 方式 1：使用 Supabase SQL Editor（推荐）

1. 在 Supabase Dashboard 中，点击左侧 **SQL Editor**
2. 点击 **New query**
3. 复制 `server/supabase/001_initial_schema.sql` 的全部内容
4. 粘贴到 SQL Editor
5. 点击 **Run** 执行

### 方式 2：使用 Supabase CLI

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref kgnejgcwdfyhtebyrbip

# 执行迁移
supabase db push
```

### 验证数据库创建成功

执行以下 SQL 查询检查：

```sql
-- 检查表是否创建
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 应该显示: profiles, images, generation_tasks, custom_models, system_settings
```

## 第三步：配置存储 Bucket（可选）

如果你想用 Supabase Storage 存储生成的图片：

1. 在 Supabase Dashboard 中，点击 **Storage**
2. 点击 **New bucket**
3. 填写：
   - **Name**: `generated-images`
   - **Public bucket**: ✅ 勾选（允许公开访问）
4. 点击 **Create bucket**
5. 点击 **Policies** → **New policy**
6. 添加策略：
   ```sql
   -- 允许所有用户查看图片
   CREATE POLICY "Public Access"
   ON storage.objects FOR SELECT
   USING (bucket_id = 'generated-images');
   
   -- 允许认证用户上传图片
   CREATE POLICY "Authenticated users can upload"
   ON storage.objects FOR INSERT
   WITH CHECK (bucket_id = 'generated-images' AND auth.role() = 'authenticated');
   ```

## 第四步：配置环境变量

### 前端环境变量（Vercel）

在 Vercel Dashboard → Project Settings → Environment Variables 添加：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_your_anon_key
```

### 后端环境变量（Railway）

在 Railway Dashboard → Variables 添加：

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_your_service_key
SUPABASE_ANON_KEY=sb_publishable_your_anon_key
```

⚠️ **安全提示**：
- 前端只能用 `anon` key
- 后端用 `service_role` key 进行管理员操作
- 不要把 `service_role` key 提交到 GitHub

## 第五步：配置 CORS（重要）

在 Supabase Dashboard → Authentication → URL Configuration：

### Site URL
```
https://your-vercel-app.vercel.app
```

### Redirect URLs
```
https://your-vercel-app.vercel.app/auth/callback
https://your-vercel-app.vercel.app/login
http://localhost:3000/*  # 本地开发
```

## 第六步：测试部署

### 1. 测试用户注册

在你的 Vercel 应用中：
1. 访问登录页面
2. 点击注册新账号
3. 使用邮箱注册
4. 检查邮箱验证邮件
5. 验证后检查数据库是否创建了 profile

### 2. 检查数据库

在 Supabase Dashboard → Table Editor → profiles：
- 应该看到新用户的 profile 记录
- 验证 `handle_new_user` trigger 正常工作

### 3. 测试生成图片

1. 登录账号
2. 选择模型并生成图片
3. 检查 `generation_tasks` 表是否有记录
4. 生成成功后检查 `images` 表

## 第七步：生产环境优化

### 1. 启用 RLS（Row Level Security）

你的 schema 已经启用了 RLS。验证一下：

```sql
-- 检查 RLS 状态
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname IN ('profiles', 'images', 'generation_tasks', 'custom_models');
-- 应该都显示为 true
```

### 2. 配置备份

Supabase 自动每天备份，但你可以：

1. 设置 Point-in-Time Recovery（PITR）- 付费功能
2. 定期手动导出数据：
   ```bash
   pg_dump -h db.xxxxx.supabase.co -U postgres -d postgres > backup.sql
   ```

### 3. 监控数据库

在 Supabase Dashboard → Database → Logs：
- 查看慢查询
- 监控连接数
- 检查错误日志

### 4. 配置连接池（推荐）

对于生产环境，使用连接池：

1. 在 Supabase Dashboard → Database → Connection pooling
2. 启用 PgBouncer
3. 更新后端连接字符串：
   ```
   postgresql://postgres:[password]@db.xxxxx.supabase.co:6543/postgres?pgbouncer=true
   ```

## 常见问题

### Q1: 连接超时或失败？

**检查**：
- 环境变量是否正确设置
- Supabase 项目是否暂停（免费项目 7 天无活动会暂停）
- 网络是否允许连接 Supabase

**解决**：
```typescript
// 在 supabase 客户端配置中添加超时
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    },
    db: {
        schema: 'public'
    },
    global: {
        headers: {
            'X-Client-Info': 'dopagen-ai'
        }
    }
});
```

### Q2: 认证失败？

**检查**：
- `anon` key 和 `service_role` key 是否混淆
- CORS 配置是否正确
- Redirect URLs 是否包含你的域名

### Q3: 图片存储失败？

如果使用 Supabase Storage：
- 检查 bucket 权限（public）
- 检查 RLS policies
- 检查文件大小限制（默认 50MB）

### Q4: 免费额度够用吗？

Supabase 免费计划：
- **数据库**: 500MB 存储 + 无限请求
- **认证**: 无限用户
- **存储**: 1GB
- **Edge Functions**: 500K 调用/月

**个人项目完全够用！**

## 本地开发配置

### 1. 创建本地环境文件

**前端**（`.env` 在根目录）：
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_your_anon_key
```

**后端**（`server/.env`）：
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_your_service_key
SUPABASE_ANON_KEY=sb_publishable_your_anon_key
PORT=3001
BIZYAIR_API_KEY=your_bizyair_key
```

### 2. 启动开发服务器

```bash
# 启动后端
cd server
npm run dev

# 启动前端（新终端）
npm run dev
```

## 数据迁移（生产环境更新）

当你需要更新数据库 schema：

1. 在本地开发环境测试 SQL
2. 在 Supabase Dashboard → SQL Editor 执行
3. 或者创建迁移文件：

```sql
-- server/supabase/002_add_new_feature.sql
-- 添加新列示例
ALTER TABLE public.images ADD COLUMN metadata JSONB DEFAULT '{}';
```

## 性能优化建议

1. **添加索引**（已包含在 schema 中）
2. **使用连接池**（生产环境）
3. **限制查询结果**
   ```typescript
   const { data } = await supabase
     .from('images')
     .select('*')
     .limit(100)  // 限制返回数量
     .order('created_at', { ascending: false });
   ```
4. **使用实时订阅**（而非轮询）
   ```typescript
   const subscription = supabase
     .from('generation_tasks')
     .on('UPDATE', callback)
     .subscribe();
   ```

## 总结

你的应用架构现在是：

| 层级 | 技术 | 部署平台 |
|------|------|----------|
| 前端 | React + Vite | Vercel |
| 后端 | Express | Railway |
| 数据库 | PostgreSQL | Supabase |
| 认证 | Supabase Auth | Supabase |

这种架构的优势：
- ✅ 全托管，无需维护服务器
- ✅ 自动扩展
- ✅ 开发成本低
- ✅ 个人项目免费

---

**祝你部署顺利！有问题随时问我！** 🚀
