import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

// BizyAir API 端点从环境变量读取，不硬编码
const BIZYAIR_API_URL = process.env.BIZYAIR_API_URL || 'https://api.bizyair.cn/w/v1/webapp/task/openapi/create';
const SERVER_API_KEY = process.env.BIZYAIR_API_KEY || '';

// 并发控制：限制同时处理的任务数量，防止资源耗尽
const MAX_CONCURRENT_TASKS = 10;
let activeTasks = 0;

/**
 * POST /api/tasks
 * Submit generation task
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
    try {
        const { modelId, prompt, params } = req.body;

        if (!modelId || !prompt || !params) {
            res.status(400).json({ error: 'modelId, prompt and params are required' });
            return;
        }

        const { data: task, error } = await supabase
            .from('generation_tasks')
            .insert({
                user_id: req.userId,
                model_id: modelId,
                prompt,
                params,
                status: 'PENDING'
            })
            .select()
            .single();

        if (error) {
            console.error('[Tasks] Insert error:', error);
            res.status(500).json({ error: error.message });
            return;
        }

        console.log(`[Tasks] Task ${task.id} queued. Triggering worker...`);
        // 并发检查：超出限制时任务保持 PENDING 状态等待后续处理
        if (activeTasks >= MAX_CONCURRENT_TASKS) {
            console.warn(`[Tasks] Concurrent limit reached (${MAX_CONCURRENT_TASKS}), task ${task.id} will wait.`);
        } else {
            // 异步触发任务处理
            processTask(task.id).catch(err => console.error('[Worker] Trigger Error:', err));
        }

        res.status(201).json({
            taskId: task.id,
            status: 'PENDING',
            message: 'Task queued'
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[Tasks] Create error:', message);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
    try {
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

        const { data, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('user_id', req.userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json(data || []);
    } catch (_err: unknown) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data: task, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.userId)
            .single();

        if (error || !task) {
            res.status(404).json({ error: 'Task not found' });
            return;
        }

        res.json({
            id: task.id,
            status: task.status,
            resultUrl: task.result_url,
            error: task.error,
            progress: task.progress,
            createdAt: task.created_at
        });
    } catch (_err: unknown) {
        res.status(500).json({ error: 'Failed to fetch task status' });
    }
});

router.delete('/:id', authenticate, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('generation_tasks')
            .delete()
            .eq('id', id)
            .eq('user_id', req.userId);

        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }

        res.json({ message: 'Task deleted' });
    } catch (_err: unknown) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ============================================
// Worker Logic
// ============================================

async function processTask(taskId: string): Promise<void> {
    activeTasks++;
    console.log(`[Worker] Starting process for task ${taskId} (active: ${activeTasks}/${MAX_CONCURRENT_TASKS})`);

    try {
        // 1. Fetch task details
        const { data: task, error: fetchErr } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (fetchErr || !task) {
            console.error(`[Worker] Task ${taskId} not found or fetch error:`, fetchErr);
            return;
        }

        // 2. Mark as PROCESSING
        const { error: updateErr } = await supabase
            .from('generation_tasks')
            .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
            .eq('id', taskId);

        if (updateErr) {
            console.error(`[Worker] Failed to update status to PROCESSING:`, updateErr);
            // Continue anyway? No, better stop if network/db is broken.
            return;
        }
        console.log(`[Worker] Task ${taskId} marked as PROCESSING`);

        // 3. Build Payload
        const taskParams = typeof task.params === 'string' ? JSON.parse(task.params) : task.params;
        const payload = {
            web_app_id: taskParams.web_app_id,
            input_values: taskParams.input_values
        };

        console.log(`[Worker] Calling BizyAir API...`);

        // 4. Call BizyAir
        const response = await fetch(BIZYAIR_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SERVER_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Worker] BizyAir API Error (${response.status}):`, errorText);
            throw new Error(`BizyAir API Error (${response.status}): ${errorText.substring(0, 200)}`);
        }

        // BizyAir API 响应可能包含多种结构，使用宽松接口安全访问
        interface BizyAirOutput {
            data?: { images?: Array<string | { url: string }>; };
            file_url?: string;
            object_url?: string;
            error_msg?: string;
            error_type?: string;
        }
        interface BizyAirResponse {
            status?: string;
            outputs?: BizyAirOutput[];
            data?: { file_url?: string; };
        }
        const result = (await response.json()) as BizyAirResponse;
        console.log(`[Worker] BizyAir response received.`);

        // CHECK FOR EXPLICIT FAILURE STATUS
        if (result.status === 'Failed') {
            let errorMsg = 'Unknown upstream error';
            if (result.outputs && result.outputs.length > 0) {
                errorMsg = result.outputs[0].error_msg || result.outputs[0].error_type || errorMsg;
            }
            // Cleaning up the error message for display
            if (errorMsg.length > 300) errorMsg = errorMsg.substring(0, 300) + '...';
            console.error(`[Worker] Upstream Task Failed:`, errorMsg);
            throw new Error(`Upstream Error: ${errorMsg}`);
        }

        // 5. Extract Image URL
        let imageUrl: string | null = null;

        if (result.outputs && result.outputs.length > 0) {
            const output = result.outputs[0];
            if (output.data?.images?.[0]) {
                imageUrl = typeof output.data.images[0] === 'string'
                    ? output.data.images[0]
                    : output.data.images[0].url;
            } else if (output.file_url) {
                imageUrl = output.file_url;
            } else if (output.object_url) {
                imageUrl = output.object_url;
            }
        }
        if (!imageUrl && result.data?.file_url) {
            imageUrl = result.data.file_url;
        }

        if (!imageUrl) {
            console.error(`[Worker] No image URL in response:`, JSON.stringify(result));
            throw new Error('No image URL found in upstream response');
        }

        // 6. Complete Task
        await supabase
            .from('generation_tasks')
            .update({
                status: 'COMPLETED',
                result_url: imageUrl,
                result_json: result,
                completed_at: new Date().toISOString(),
                progress: 100
            })
            .eq('id', taskId);

        // Save to library
        await supabase
            .from('images')
            .insert({
                user_id: task.user_id,
                url: imageUrl,
                prompt: task.prompt,
                width: taskParams.input_values?.width || 1024,
                height: taskParams.input_values?.height || 1024,
                model_name: task.model_id,
                is_public: false,
                params: taskParams
            });

        console.log(`[Worker] Task ${taskId} COMPLETED successfully.`);
        console.log(`[Worker] Result URL: ${imageUrl}`);

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Worker] Task ${taskId} FAILED:`, message);

        await supabase
            .from('generation_tasks')
            .update({
                status: 'FAILED',
                error: message
            })
            .eq('id', taskId);
    } finally {
        // 无论成功失败都要释放并发槽位
        activeTasks = Math.max(0, activeTasks - 1);
        console.log(`[Worker] Task ${taskId} finished. Active tasks: ${activeTasks}/${MAX_CONCURRENT_TASKS}`);
    }
}

export default router;
