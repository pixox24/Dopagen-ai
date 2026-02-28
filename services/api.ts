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

const MAX_GENERATION_WAIT_MS = 120_000;
const GENERATION_POLL_INTERVAL_MS = 2_000;

/**
 * Submit image generation task to Supabase Edge Function.
 */
export const submitGenerationTask = async (options: GenerateOptions): Promise<SubmitTaskResponse> => {
    const { model, formState, globalWidth, globalHeight, globalAspectRatio, globalQuality } = options;
    const { schema } = model;

    if (!schema) throw new Error('Model schema is missing.');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const inputValues: Record<string, unknown> = {};

    schema.inputs.forEach(input => {
        let valueToUse: unknown;

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

        if (input.key.toLowerCase().includes('seed') && typeof valueToUse === 'number') {
            const normalizedSeed = Math.max(0, Math.min(2147483647, valueToUse));
            valueToUse = Number.isFinite(normalizedSeed)
                ? Math.floor(normalizedSeed)
                : Math.floor(Math.random() * 2147483647);
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
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const { data, error } = await supabase.functions.invoke('generate', {
            body: {
                modelId: model.name || model.id,
                prompt: formState.prompt || 'Generated Image',
                params
            },
            headers: {
                Authorization: token ? `Bearer ${token}` : ''
            }
        });

        if (error) {
            console.error('Edge Function Error:', error);
            throw new Error(error.message || 'Generation failed');
        }

        if (!data?.success) {
            throw new Error(data?.error || 'Generation failed');
        }

        return {
            taskId: data.taskId,
            imageUrl: data.imageUrl,
            status: data.status || 'PENDING'
        };
    } catch (e: any) {
        console.error('Submission Error:', e);
        const message = String(e?.message || '');
        if (message.toLowerCase().includes('timeout')) {
            throw new Error('AI service timed out. Please retry with lower resolution/quality or try again later.');
        }
        throw new Error(message || 'Cannot connect to generation service.');
    }
};

/**
 * Get task status from Supabase database.
 */
export const pollTaskStatus = async (taskId: string): Promise<TaskResponse> => {
    try {
        const { data, error } = await supabase
            .from('generation_tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (error || !data) {
            console.error('Poll Error:', error);
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
        console.error('Polling Error:', e);
        return { id: taskId, status: 'PENDING' };
    }
};

/**
 * Generate image and poll until completion.
 */
export const generateImage = async (options: GenerateOptions): Promise<string[]> => {
    const submitResponse = await submitGenerationTask(options);
    const { taskId, imageUrl } = submitResponse;

    if (imageUrl) {
        return [imageUrl];
    }

    const maxAttempts = Math.ceil(MAX_GENERATION_WAIT_MS / GENERATION_POLL_INTERVAL_MS);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));
        const task = await pollTaskStatus(taskId);

        if (task.status === 'COMPLETED' && task.resultUrl) {
            return [task.resultUrl];
        }
        if (task.status === 'FAILED') {
            throw new Error(task.error || 'Generation failed');
        }
    }

    throw new Error('Generation timed out. Please try again.');
};

export const getUserTasks = async (limit: number = 20) => {
    const { data, error } = await supabase
        .from('generation_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Get Tasks Error:', error);
        return [];
    }

    return data || [];
};

export const deleteTask = async (taskId: string) => {
    const { error } = await supabase
        .from('generation_tasks')
        .delete()
        .eq('id', taskId);

    if (error) {
        console.error('Delete Task Error:', error);
        throw new Error(error.message);
    }
};

export const getUserImages = async (limit: number = 50) => {
    const { data, error } = await supabase
        .from('images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Get Images Error:', error);
        return [];
    }

    return data || [];
};

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
        console.error('Get Public Images Error:', error);
        return [];
    }

    return data || [];
};

export const getCustomModels = async () => {
    const { data, error } = await supabase
        .from('custom_models')
        .select('*')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Get Models Error:', error);
        return [];
    }

    return data || [];
};

export const saveCustomModel = async (modelData: any) => {
    const payload = {
        ...modelData,
        api_key: null
    };

    const { data, error } = await supabase
        .from('custom_models')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('Save Model Error:', error);
        throw new Error(error.message);
    }

    return data;
};
