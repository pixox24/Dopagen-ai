import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../supabase';
import { getSettings, updateSettings } from '../settings';

const router = Router();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dopagen-admin-secret-change-in-production';

// ============================================
// Admin JWT 中间件
// ============================================
export const authenticateAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing admin authorization' });
        return;
    }
    try {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { role: string; username: string };
        if (decoded.role !== 'admin') {
            res.status(403).json({ error: 'Invalid admin token' });
            return;
        }
        (req as any).adminUsername = decoded.username;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired admin token' });
    }
};

// ============================================
// 认证路由
// ============================================

/** POST /api/admin/login */
router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Credentials required' });
        return;
    }
    if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        res.status(401).json({ error: 'Invalid admin credentials' });
        return;
    }
    const token = jwt.sign({ role: 'admin', username }, ADMIN_JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, username, expiresIn: '8h' });
});

/** GET /api/admin/verify */
router.get('/verify', authenticateAdmin, (req: Request, res: Response) => {
    res.json({ valid: true, username: (req as any).adminUsername });
});

// ============================================
// 全站统计
// ============================================

/** GET /api/admin/stats */
router.get('/stats', authenticateAdmin, async (_req: Request, res: Response) => {
    try {
        const [users, images, tasks, models] = await Promise.all([
            supabase.from('profiles').select('id', { count: 'exact', head: true }),
            supabase.from('images').select('id', { count: 'exact', head: true }),
            supabase.from('generation_tasks').select('id', { count: 'exact', head: true }),
            supabase.from('custom_models').select('id', { count: 'exact', head: true }),
        ]);
        res.json({
            totalUsers: users.count ?? 0,
            totalImages: images.count ?? 0,
            totalTasks: tasks.count ?? 0,
            totalModels: models.count ?? 0,
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// ============================================
// 模型管理（全站，不限 user_id）
// ============================================

/** GET /api/admin/models — 获取全站所有模型 */
router.get('/models', authenticateAdmin, async (_req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('custom_models')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.json(data || []);
    } catch {
        res.status(500).json({ error: 'Failed to fetch models' });
    }
});

/** POST /api/admin/models — 创建全局模型（user_id = null → 管理员模型） */
router.post('/models', authenticateAdmin, async (req: Request, res: Response) => {
    try {
        const { name, version, description, web_app_id, schema, input_map, thumbnail_url, api_key } = req.body;
        if (!name) { res.status(400).json({ error: 'Model name is required' }); return; }

        const { data, error } = await supabase
            .from('custom_models')
            .insert({
                name,
                version: version || '1.0',
                description: description || '',
                web_app_id: web_app_id || null,
                schema: schema || null,
                input_map: input_map || null,
                thumbnail_url: thumbnail_url || null,
                api_key: api_key || null,
                is_hidden: false,
                // user_id 不设置 → 标识为管理员全局模型
            })
            .select()
            .single();

        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(201).json(data);
    } catch {
        res.status(500).json({ error: 'Failed to create model' });
    }
});

/** PATCH /api/admin/models/:id — 更新模型 */
router.patch('/models/:id', authenticateAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const allowedFields = ['name', 'version', 'description', 'web_app_id', 'schema', 'input_map', 'thumbnail_url', 'is_hidden', 'api_key'];
        const updates: Record<string, any> = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase.from('custom_models').update(updates).eq('id', id).select().single();
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.json(data);
    } catch {
        res.status(500).json({ error: 'Failed to update model' });
    }
});

/** DELETE /api/admin/models/:id — 删除模型 */
router.delete('/models/:id', authenticateAdmin, async (req: Request, res: Response) => {
    try {
        const { error } = await supabase.from('custom_models').delete().eq('id', req.params.id);
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.json({ message: 'Model deleted' });
    } catch {
        res.status(500).json({ error: 'Failed to delete model' });
    }
});

/** PATCH /api/admin/models/:id/toggle — 切换可见性 */
router.patch('/models/:id/toggle', authenticateAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { data: existing } = await supabase.from('custom_models').select('is_hidden').eq('id', id).single();
        if (!existing) { res.status(404).json({ error: 'Model not found' }); return; }

        const { data, error } = await supabase
            .from('custom_models')
            .update({ is_hidden: !existing.is_hidden, updated_at: new Date().toISOString() })
            .eq('id', id).select().single();
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.json(data);
    } catch {
        res.status(500).json({ error: 'Failed to toggle model' });
    }
});

// ============================================
// 全局设置
// ============================================

/** GET /api/admin/settings */
router.get('/settings', authenticateAdmin, (_req: Request, res: Response) => {
    res.json(getSettings());
});

/** PATCH /api/admin/settings */
router.patch('/settings', authenticateAdmin, (req: Request, res: Response) => {
    const { bizyairApiKey, loadingMessages } = req.body;
    const updates: Partial<{ bizyairApiKey: string; loadingMessages: string[] }> = {};
    if (bizyairApiKey !== undefined) updates.bizyairApiKey = bizyairApiKey;
    if (loadingMessages !== undefined) updates.loadingMessages = loadingMessages;
    res.json(updateSettings(updates));
});

export default router;
