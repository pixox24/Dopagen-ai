
import { GenerateOptions } from '../types';
import { supabase } from '../lib/supabase';

// Points to our local Node.js server
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export interface TaskResponse {
    id: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    resultUrl?: string;
    error?: string;
    progress?: number;
}

const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
        'Content-Type': 'application/json',
        'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
    };
};

export const submitGenerationTask = async (options: GenerateOptions, userId?: string): Promise<string> => {
    const { model, formState, globalWidth, globalHeight, globalAspectRatio, globalQuality } = options;
    const { schema } = model;

    if (!schema) throw new Error("Model schema is missing.");

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
                // Keep FULL Base64 with prefix for max compatibility
                valueToUse = userValue;
            } else if (input.defaultValue !== undefined) {
                valueToUse = input.defaultValue;
            }
        }

        // Limit seed to positive 32-bit int if it's a seed field
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
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                modelId: model.name || model.id,
                prompt: formState['prompt'] || 'Generated Image',
                params: params
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Server Error (${res.status}): ${errText}`);
        }

        const data = await res.json();
        return data.taskId;
    } catch (e: any) {
        console.error("Submission Error:", e);
        throw new Error(e.message || "Cannot connect to backend server.");
    }
};

export const pollTaskStatus = async (taskId: string): Promise<TaskResponse> => {
    try {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
            headers
        });

        if (!res.ok) throw new Error("Failed to fetch task status");
        return await res.json();
    } catch (e) {
        console.error("Polling Error:", e);
        return { id: taskId, status: 'PENDING' };
    }
};

export const generateImage = async (options: GenerateOptions): Promise<string[]> => {
    const taskId = await submitGenerationTask(options);
    while (true) {
        await new Promise(r => setTimeout(r, 2000));
        const task = await pollTaskStatus(taskId);
        if (task.status === 'COMPLETED' && task.resultUrl) return [task.resultUrl];
        if (task.status === 'FAILED') throw new Error(task.error || "Generation Failed");
    }
};
