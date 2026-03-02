import { GenerateOptions } from '../types';
import { supabase } from '../lib/supabase';

export interface TaskResponse {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    resultUrl?: string;
    error?: string;
    progress?: number;
}

export interface SubmitTaskResponse {
    taskId: string;
    imageUrl?: string;
    status?: string;
}

/**
 * 向 Supabase Edge Function 提交图像生成任务
 */
export const submitGenerationTask = async (options: GenerateOptions): Promise<SubmitTaskResponse> => {
    const { model, formState, globalWidth, globalHeight, globalAspectRatio, globalQuality } = options;
    const { schema } = model;

    if (!schema) throw new Error("Model schema is missing.");

    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // 构建输入参数
    const inputValues: Record<string, string | number | boolean> = {};

    schema.inputs.forEach(input => {
        let valueToUse: string | number | boolean | undefined = undefined;

        if (input.generate === 'random_int') {
            valueToUse = Math.floor(Math.random() * 2147483647);
        } else if (input.mapping) {
            if (input.mapping === 'width') valueToUse = globalWidth;
            else if (input.mapping === 'height') valueToUse = globalHeight;
            else if (input.mapping === 'aspect_ratio') valueToUse = globalAspectRatio;
            else if (input.mapping === 'quality') valueToUse = globalQuality;
        } else {
            const userValue = formState[input.key];
            if (userValue !== undefined && userValue !== null && userValue !== '') {
                valueToUse = userValue;
            } else if (input.defaultValue !== undefined) {
                valueToUse = input.defaultValue;
            }
        }

        // 限制 seed 为正 32 位整数范围
        if (input.key.toLowerCase().includes('seed') && typeof valueToUse === 'number') {
            if (valueToUse > 2147483647) valueToUse = Math.floor(Math.random() * 2147483647);
            if (valueToUse < 0) valueToUse = 0;
        }

        if (valueToUse !== undefined) {
            inputValues[input.key] = valueToUse;
        }
    });

    const params = {
        web_app_id: schema.model_id,
        input_values: inputValues
    };

    try {
        // 调用 Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('generate', {
            body: {
                modelId: model.name || model.id,
                prompt: formState['prompt'] || 'Generated Image',
                params: params,
                userId: user.id
            }
        });

        if (error) {
            console.error("Edge Function Error:", error);
            throw new Error(error.message || "Generation failed");
        }

        if (!data?.success) {
            throw new Error(data?.error || "Generation failed");
        }

        return {
            taskId: data.taskId,
            imageUrl: data.imageUrl,
            status: data.status || 'PENDING'
        };
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Cannot connect to generation service.';
        console.error("Submission Error:", message);
        throw new Error(message);
    }
};

/**
 * 查询任务状态 - 调用 check-task Edge Function（使用 Service Role，绕过 RLS）
 */
export const pollTaskStatus = async (taskId: string): Promise<TaskResponse> => {
    try {
        const { data, error } = await supabase.functions.invoke('check-task', {
            body: { taskId }
        });

        if (error) {
            // 忽略 AbortError，这是 React 组件正常重渲染导致的
            if (error.message?.includes('abort') || error.name === 'AbortError') {
                return { id: taskId, status: 'PENDING' };
            }
            console.error("Poll Error:", error);
            return { id: taskId, status: 'PENDING' };
        }

        if (!data) {
            return { id: taskId, status: 'PENDING' };
        }

        return {
            id: taskId,
            status: data.status || 'PENDING',
            resultUrl: data.resultUrl,
            error: data.error,
            progress: data.progress
        };
    } catch (e: unknown) {
        if (e instanceof Error && e.name === 'AbortError') {
            return { id: taskId, status: 'PENDING' };
        }
        console.error("Polling Error:", e);
        return { id: taskId, status: 'PENDING' };
    }
};

/**
 * 生成图像并轮询结果（带超时保护）
 */
export const generateImage = async (options: GenerateOptions): Promise<string[]> => {
    const submitResponse = await submitGenerationTask(options);
    const { taskId, imageUrl } = submitResponse;

    // 如果已经返回了 imageUrl，直接返回
    if (imageUrl) {
        return [imageUrl];
    }

    // 轮询等待结果（带超时保护）
    const MAX_POLL_ATTEMPTS = 60; // 最多轮询 60 次
    const POLL_INTERVAL_MS = 2000; // 每 2 秒
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
        attempts++;
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        const task = await pollTaskStatus(taskId);

        if (task.status === 'COMPLETED' && task.resultUrl) {
            return [task.resultUrl];
        }
        if (task.status === 'FAILED') {
            throw new Error(task.error || "Generation Failed");
        }
    }

    throw new Error(`Generation timeout after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
};

/**
 * 获取用户的生成任务列表
 * 通过 RLS 自动过滤当前用户的数据
 */
export const getUserTasks = async (limit: number = 20): Promise<TaskResponse[]> => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { data, error } = await supabase
        .from('generation_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (error) {
        console.error("Get Tasks Error:", error);
        return [];
    }

    return data || [];
};

/**
 * 删除任务
 * RLS 应确保只能删除自己的任务
 */
export const deleteTask = async (taskId: string): Promise<void> => {
    const { error } = await supabase
        .from('generation_tasks')
        .delete()
        .eq('id', taskId);

    if (error) {
        console.error("Delete Task Error:", error);
        throw new Error(error.message);
    }
};

/**
 * 获取用户的图片列表
 */
export const getUserImages = async (limit: number = 50): Promise<GenerateOptions[]> => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { data, error } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (error) {
        console.error("Get Images Error:", error);
        return [];
    }

    return data || [];
};

/**
 * 获取公开图片（用于 Explore 页面）
 */
export const getPublicImages = async (limit: number = 50) => {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const { data, error } = await supabase
        .from('images')
        .select(`
            *,
            user:profiles(username, avatar_url)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(safeLimit);

    if (error) {
        console.error("Get Public Images Error:", error);
        return [];
    }

    return data || [];
};

/**
 * 获取自定义模型列表
 */
export const getCustomModels = async () => {
    const { data, error } = await supabase
        .from('custom_models')
        .select('*')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Get Models Error:", error);
        return [];
    }

    return data || [];
};

/**
 * 保存自定义模型
 */
export const saveCustomModel = async (modelData: Record<string, unknown>) => {
    const { data, error } = await supabase
        .from('custom_models')
        .insert(modelData)
        .select()
        .single();

    if (error) {
        console.error("Save Model Error:", error);
        throw new Error(error.message);
    }

    return data;
};
