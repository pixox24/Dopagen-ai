# ✅ Supabase 部署检查清单

## 1. 创建 Supabase 项目
- [ ] 访问 https://supabase.com 登录
- [ ] 创建新项目
- [ ] 选择地区（推荐 Singapore 或 Tokyo）
- [ ] 保存项目 URL 和 API Keys

## 2. 执行数据库迁移
- [ ] 打开 SQL Editor
- [ ] 复制 `server/supabase/001_initial_schema.sql`
- [ ] 执行 SQL
- [ ] 验证表已创建（profiles, images, tasks, models）

## 3. 配置环境变量

### Vercel（前端）
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

### Railway（后端）
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=sb_secret_xxx
SUPABASE_ANON_KEY=sb_publishable_xxx
```

## 4. 配置认证
- [ ] 在 Auth → URL Configuration 添加 Site URL
- [ ] 添加 Redirect URLs（包括 Vercel 域名和 localhost）

## 5. 配置 CORS（后端）
编辑 `server/src/index.ts`：
```typescript
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-vercel-app.vercel.app'  // 添加你的域名
  ],
  credentials: true
}));
```

## 6. 部署后端到 Railway
- [ ] 登录 railway.app
- [ ] 导入 GitHub 仓库
- [ ] 添加 Supabase 环境变量
- [ ] 点击 Deploy
- [ ] 记录 Railway URL

## 7. 部署前端到 Vercel
- [ ] 登录 vercel.com
- [ ] 导入 GitHub 仓库
- [ ] 添加环境变量：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_BASE_URL` = Railway URL + "/api"
- [ ] 点击 Deploy

## 8. 测试
- [ ] 注册新用户
- [ ] 登录系统
- [ ] 生成一张图片
- [ ] 查看数据库记录是否正确
- [ ] 检查 Queue 功能正常

## 9. 优化（可选）
- [ ] 启用 PgBouncer 连接池
- [ ] 配置 Supabase Storage（图片存储）
- [ ] 设置自定义域名

## 🔧 快速命令参考

```bash
# 提交部署配置
git add .
git commit -m "Configure Supabase deployment"
git push origin main

# 检查数据库连接（后端）
curl https://your-railway-url/health

# 查看 Supabase 表
docker exec -it postgres psql -U postgres -d postgres
\dt
```

## 📞 故障排查

### 连接失败
检查环境变量是否正确，特别是 `SUPABASE_URL` 和 `SUPABASE_SERVICE_KEY`

### 认证失败
检查 CORS 配置和 Redirect URLs

### 数据库错误
检查 SQL 是否执行成功，表是否存在

## 💡 提示

- Supabase 免费额度：500MB 数据库 + 1GB 存储 + 无限请求
- 免费项目 7 天无活动会暂停，手动唤醒即可
- `service_role` key 绝对不要暴露到前端！
