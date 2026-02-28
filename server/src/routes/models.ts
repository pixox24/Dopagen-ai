import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { authenticate } from '../middleware/auth';

const router = Router();
const MODEL_NAME_MAX = 100;

/**
 * GET /api/models/custom
 * 获取用户自定义模型列表
 */
router.get('/custom', authenticate, async (req: Request, res: Response) => {
    try {
        const { data, error } = await supabase
            .from('custom_models')
            .select('id, user_id, name, version, description, web_app_id, schema, input_map, thumbnail_url, is_hidden, created_at, updated_at')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false });

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch custom models' });
    }
});

/**
 * POST /api/models/custom
 * 创建自定义模型
 */
router.post('/custom', authenticate, async (req: Request, res: Response) => {
    try {
        const { name, version, description, web_app_id, schema, input_map, thumbnail_url } = req.body;

        if (!name) {
            res.status(400).json({ error: 'Model name is required' });
            return;
        }
        if (typeof name !== 'string' || name.length > MODEL_NAME_MAX) {
            res.status(400).json({ error: `Model name must be a string up to ${MODEL_NAME_MAX} chars` });
            return;
        }

        const { data, error } = await supabase
            .from('custom_models')
            .insert({
                user_id: req.userId,
                name,
                version: version || '1.0',
                description: description || '',
                web_app_id: web_app_id || null,
                schema: schema || null,
                input_map: input_map || null,
                thumbnail_url: thumbnail_url || null,
                is_hidden: false
            })
            .select('id, user_id, name, version, description, web_app_id, schema, input_map, thumbnail_url, is_hidden, created_at, updated_at')
            .single();

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create model' });
    }
});

/**
 * PATCH /api/models/custom/:id
 * 更新自定义模型
 */
router.patch('/custom/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 验证所有权
        const { data: existing } = await supabase
            .from('custom_models')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existing || existing.user_id !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        const allowedFields = ['name', 'version', 'description', 'web_app_id', 'schema', 'input_map', 'thumbnail_url', 'is_hidden'];
        const updates: Record<string, any> = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from('custom_models')
            .update(updates)
            .eq('id', id)
            .select('id, user_id, name, version, description, web_app_id, schema, input_map, thumbnail_url, is_hidden, created_at, updated_at')
            .single();

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update model' });
    }
});

/**
 * DELETE /api/models/custom/:id
 * 删除自定义模型
 */
router.delete('/custom/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('custom_models')
            .delete()
            .eq('id', id)
            .eq('user_id', req.userId);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({ message: 'Model deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete model' });
    }
});

/**
 * PATCH /api/models/custom/:id/toggle-visibility
 * 切换模型可见性
 */
router.patch('/custom/:id/toggle-visibility', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data: existing } = await supabase
            .from('custom_models')
            .select('is_hidden, user_id')
            .eq('id', id)
            .single();

        if (!existing || existing.user_id !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        const { data, error } = await supabase
            .from('custom_models')
            .update({ is_hidden: !existing.is_hidden, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select('id, user_id, name, version, description, web_app_id, schema, input_map, thumbnail_url, is_hidden, created_at, updated_at')
            .single();

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to toggle model visibility' });
    }
});

export default router;
