# DopaGen AI 项目重构与修复详细说明文档

本文档详细记录了项目从本地开发环境迁移至 Vercel 生产环境过程中所涉及的所有架构重构、Bug 修复及数据库优化。

---

## 1. 架构重构：Admin 后端去服务器化 (Serverless)

**变更原因**：原有的 Admin 后端是一个独立的 Express 服务器（位于 `server/` 文件夹），由于该服务器未被部署到公网，导致 Vercel 上的前端无法访问 `localhost:3001`。

**解决方案**：
- **移除独立后端依赖**：彻底停用 Express 服务器，所有 Admin 管理操作改为前端直连 Supabase。
- **重写 API 服务层**：修改 `services/adminApi.ts`，将所有 `/api/admin/*` 的 fetch 请求改为直接调用 Supabase 客户端。
- **配置管理中心化**：新建 Supabase 表 `site_settings`，用于存储原来存在本地 `settings.json` 中的 API Key 和加载文案。
- **免 JWT 验证**：管理员登录改为在前端对比环境变量（Vercel 配置），无感迁移，无需维护复杂的后端 Token 刷新机制。

---

## 2. 任务持久化与全局轮询逻辑

**变更原因**：用户点击生成图片后，如果切换到其他页面（如 Explore），任务轮询会被中断，导致返回 Generate 页面时进度丢失或重复提交。

**解决方案**：
- **状态全局化**：将 `tasks`、`activeTaskId` 和轮询逻辑从 `Generate.tsx` 页面提升到全局 `AppContext.tsx`。
- **后台持续轮询**：任务在 `AppContext` 中运行，只要网页不关闭，无论用户切换到哪个路由，轮询都会在后台持续执行直至完成。
- **自动归档**：任务完成后，图片会自动插入 Supabase 的 `images` 表并同步更新到用户的个人画廊，无需手动刷新。

---

## 3. 数据库查询优化与 500 错误修复

**变更原因**：Supabase 默认开启了 RLS（行级安全），导致联表查询（Join）作者信息时，如果当前用户无权查看他人 Profile，查询会直接报 500 错误。

**解决方案**：
- **移除复杂的 JOIN**：在 `AppContext.tsx` 中移除 `profiles` 表的关联查询，改用单表查询提升请求成功率和速度。
- **物理外键关联**：在数据库层面显式建立了 `images(user_id) -> profiles(id)` 的外键约束。
- **RLS 策略更新**：
  - 允许所有人（匿名/已登录）查询 `profiles` 表的 `username` 和 `avatar_url`（公开基本资料）。
  - 允许用户查询自己的 `generation_tasks`。
  - 允许公共读取 `site_settings` 和 `custom_models`。

---

## 4. Edge Function 重大漏洞修复

**故障表现**：Edge Function 部署后返回 500 错误，且提示无法连接数据或环境变量为空。

**解决方案**：
- **环境变量回退机制**：修复了 `check-task` 和 `generate` 函数中 Service Role Key 的命名不匹配问题，支持多种命名变体（`SUPABASE_SERVICE_ROLE_KEY`, `SERVICE_KEY` 等）。
- **取消轮询 Abort 拦截**：针对 React 18 的 `AbortController` 导致请求被中止的问题，在 `api.ts` 中改用原生 `fetch` 直接调用 Function URL，确保轮询请求的稳定性。
- **异步等待优化**：使用 `EdgeRuntime.waitUntil` 确保 Edge Function 在返回 202 状态码后仍能在后台完成 BizyAir 的调用。

---

## 5. 环境变量与部署配置

**前端环境变量 (.env / Vercel)**：
- 移除了 `VITE_API_URL`（不再依赖本地服务器）。
- 新增 `VITE_ADMIN_USERNAME` 和 `VITE_ADMIN_PASSWORD` 供在线管理后台登录。
- 统一使用 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

**后端数据库脚本 (SQL)**：
- 新建 `site_settings` 表。
- 重新授权 `anon` 和 `authenticated` 角色对公开表的 `SELECT` 权限。

---

## 6. 其他 UI/UX 优化

- **防重复 Key 警告**：在合并本地模型和云端模型时，使用 `Map` 数据结构进行 ID 去重，消除了 React 控制台的 `Two children with the same key` 警告。
- **静默异常处理**：过滤了开发模式下由于 React 组件双重挂载产生的 `AbortError` 报错信息，使控制台更加整洁。

---

**文档说明完成**。所有更改已同步推送至 GitHub 仓库。
