import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { authenticate, optionalAuth } from '../middleware/auth';

const router = Router();
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const toBoundedInt = (value: unknown, fallback: number, min: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const int = Math.trunc(parsed);
    if (int < min) return min;
    if (int > max) return max;
    return int;
};

/**
 * GET /api/images
 * 获取当前用户的图片列表
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const page = toBoundedInt(req.query.page, DEFAULT_PAGE, 1, 100000);
        const limit = toBoundedInt(req.query.limit, 50, 1, MAX_LIMIT);
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('images')
            .select('*', { count: 'exact' })
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({
            images: data || [],
            total: count || 0,
            page,
            limit
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

/**
 * GET /api/images/public
 * 获取公开图片（所有人可访问）
 */
router.get('/public', optionalAuth, async (req: Request, res: Response) => {
    try {
        const page = toBoundedInt(req.query.page, DEFAULT_PAGE, 1, 100000);
        const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
            .from('images')
            .select(`
        *,
        profiles:user_id (username, avatar_url)
      `, { count: 'exact' })
            .eq('is_public', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({
            images: data || [],
            total: count || 0,
            page,
            limit
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch public images' });
    }
});

/**
 * GET /api/images/:id
 * 获取单张图片详情
 */
router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from('images')
            .select(`
        *,
        profiles:user_id (username, avatar_url)
      `)
            .eq('id', id)
            .single();

        if (error || !data) {
            res.status(404).json({ error: 'Image not found' });
            return;
        }

        // 检查访问权限：公开图片或本人图片
        if (!data.is_public && data.user_id !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch image' });
    }
});

/**
 * POST /api/images
 * 创建图片记录
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { url, prompt, negative_prompt, width, height, model_name, is_public, params } = req.body;

        if (!url || !prompt) {
            res.status(400).json({ error: 'URL and prompt are required' });
            return;
        }

        const { data, error } = await supabase
            .from('images')
            .insert({
                user_id: req.userId,
                url,
                prompt,
                negative_prompt: negative_prompt || null,
                width: width || 1024,
                height: height || 1024,
                model_name: model_name || 'unknown',
                is_public: is_public || false,
                params: params || null
            })
            .select()
            .single();

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.status(201).json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create image record' });
    }
});

/**
 * PATCH /api/images/:id
 * 更新图片（如设为公开/私有）
 */
router.patch('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const allowedFields = ['is_public', 'prompt'];
        const updates: Record<string, any> = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }

        // 验证所有权
        const { data: existing } = await supabase
            .from('images')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existing || existing.user_id !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        const { data, error } = await supabase
            .from('images')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to update image' });
    }
});

/**
 * DELETE /api/images/:id
 * 删除图片
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 验证所有权
        const { data: existing } = await supabase
            .from('images')
            .select('user_id, url')
            .eq('id', id)
            .single();

        if (!existing || existing.user_id !== req.userId) {
            res.status(403).json({ error: 'Access denied' });
            return;
        }

        const { error } = await supabase
            .from('images')
            .delete()
            .eq('id', id);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({ message: 'Image deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete image' });
    }
});

/**
 * POST /api/images/batch-delete
 * 批量删除图片
 */
router.post('/batch-delete', authenticate, async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            res.status(400).json({ error: 'ids array is required' });
            return;
        }
        if (ids.length > MAX_LIMIT) {
            res.status(400).json({ error: `ids array is too large (max ${MAX_LIMIT})` });
            return;
        }

        const { error } = await supabase
            .from('images')
            .delete()
            .in('id', ids)
            .eq('user_id', req.userId);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({ message: `Deleted ${ids.length} images` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to batch delete images' });
    }
});

export default router;
