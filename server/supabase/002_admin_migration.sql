-- ============================================
-- DopaGen AI - Admin 后台改造迁移
-- 运行方式：在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 1. custom_models 表：允许 user_id 为空（管理员创建的全局模型不绑定用户）
ALTER TABLE public.custom_models ALTER COLUMN user_id DROP NOT NULL;

-- 2. 添加 RLS 策略：允许所有人查看未隐藏的全局模型（user_id IS NULL）
CREATE POLICY "Anyone can view global models" ON public.custom_models
  FOR SELECT USING (user_id IS NULL AND is_hidden = false);

-- 3. web_app_id 类型改为 TEXT（兼容字符串格式的 ID）
ALTER TABLE public.custom_models ALTER COLUMN web_app_id TYPE TEXT USING web_app_id::TEXT;
