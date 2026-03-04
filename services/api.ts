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
 * 查询任务状态：直接从本地 Supabase 客户端直查 generation_tasks 表
 * 我们已经抛弃了落后的 check-task Edge Function 轮询
 * 这样能在完全杜绝 CORS 报错的同时，大幅节省 Edge Function 的计费调用时长
 */
export const pollTaskStatus = async (taskId: string): Promise<TaskResponse> => {
    try {
        const { data, error } = await supabase
            .from('generation_tasks')
            .select('status, result_url, error, progress')
            .eq('id', taskId)
            .single();

        if (error || !data) {
            // Task might not be immediately visible due to eventual consistency, just wait
            return { id: taskId, status: 'PENDING' };
        }

        return {
            id: taskId,
            status: data.status as TaskResponse['status'] || 'PENDING',
            resultUrl: data.result_url,
            error: data.error,
            progress: data.progress
        };
    } catch (e: unknown) {
        console.error("Polling Error:", e);
        return { id: taskId, status: 'PENDING' };
    }
};

