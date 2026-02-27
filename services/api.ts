import { GenerateOptions } from '../types';
import { supabase } from '../lib/supabase';

// Supabase Edge Function URL
// In production: https://your-project.supabase.co/functions/v1/generate
// In development: http://localhost:54321/functions/v1/generate
const EDGE_FUNCTION_URL = import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_URL || 
  `${import.meta.env.VITE_SUPABASE_URL?.replace('/rest/v1', '')}/functions/v1`;

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
 * Submit image generation task to Supabase Edge Function
 * This replaces the old Express backend API call
 */
export const submitGenerationTask = async (options: GenerateOptions): Promise<SubmitTaskResponse> => {
    const { model, formState, globalWidth, globalHeight, globalAspectRatio, globalQuality } = options;
    const { schema } = model;

    if (!schema) throw new Error("Model schema is missing.");

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    // Build input values
    const inputValues: Record<string, any> = {};

    schema.inputs.forEach(input => {
        let valueToUse: any = undefined;

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

        // Limit seed to positive 32-bit int
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
        // Call Supabase Edge Function
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
    } catch (e: any) {
        console.error("Submission Error:", e);
        throw new Error(e.message || "Cannot connect to generation service.");
    }
};

/**
 * Get task status from Supabase database
 * Direct query instead of API call
 */
export const pollTaskStatus = async (taskId: string): Promise<TaskResponse> => {
    try {
        const { data, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (error || !data) {
            console.error("Poll Error:", error);
            return { id: taskId, status: 'PENDING' };
        }

        return {
            id: data.id,
            status: data.status,
            resultUrl: data.result_url,
            error: data.error,
            progress: data.progress
        };
    } catch (e) {
        console.error("Polling Error:", e);
        return { id: taskId, status: 'PENDING' };
    }
};

/**
 * Generate image with polling
 */
export const generateImage = async (options: GenerateOptions): Promise<string[]> => {
    const submitResponse = await submitGenerationTask(options);
    const { taskId, imageUrl } = submitResponse;
    
    // 如果已经返回了 imageUrl，直接返回
    if (imageUrl) {
        return [imageUrl];
    }
    
    // 否则轮询等待结果
    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const task = await pollTaskStatus(taskId);
        
        if (task.status === 'COMPLETED' && task.resultUrl) {
            return [task.resultUrl];
        }
        if (task.status === 'FAILED') {
            throw new Error(task.error || "Generation Failed");
        }
    }
};

/**
 * Get user's generation tasks
 * Direct Supabase query
 */
export const getUserTasks = async (limit: number = 20) => {
    const { data, error } = await supabase
        .from('generation_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Get Tasks Error:", error);
        return [];
    }

    return data || [];
};

/**
 * Delete a task
 * Direct Supabase query
 */
export const deleteTask = async (taskId: string) => {
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
 * Get user's images
 * Direct Supabase query
 */
export const getUserImages = async (limit: number = 50) => {
    const { data, error } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Get Images Error:", error);
        return [];
    }

    return data || [];
};

/**
 * Get public images (for Explore page)
 * Direct Supabase query
 */
export const getPublicImages = async (limit: number = 50) => {
    const { data, error } = await supabase
        .from('images')
        .select(`
            *,
            user:profiles(username, avatar_url)
        `)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Get Public Images Error:", error);
        return [];
    }

    return data || [];
};

/**
 * Get custom models
 * Direct Supabase query
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
 * Save custom model
 * Direct Supabase query
 */
export const saveCustomModel = async (modelData: any) => {
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
