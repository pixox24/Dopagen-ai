import { GenerateOptions } from '../types';

export interface TaskResponse {
    id: string;
    status: 'QUEUED' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    resultUrl?: string;
    images?: string[];
    error?: string;
    progress?: number;
    bizyStatus?: string;
    queueCount?: number;
    requestId?: string;
}

export interface SubmitTaskResponse {
    taskId: string;
    requestId?: string;
    imageUrl?: string;
    status?: string;
    submittedParams?: {
        web_app_id: string | number;
        input_values: Record<string, string | number | boolean>;
    };
}

interface PollTaskDetails {
    modelId?: string;
    prompt?: string;
    params?: unknown;
    userId?: string | null;
}

export const submitGenerationTask = async (
    options: GenerateOptions & { prompt?: string; taskId?: string }
): Promise<SubmitTaskResponse> => {
    const { model, formState, globalWidth, globalHeight, globalAspectRatio, globalQuality } = options;
    const { schema } = model;

    if (!schema) {
        throw new Error('Model schema is missing.');
    }

    const inputValues: Record<string, string | number | boolean> = {};

    schema.inputs.forEach((input) => {
        let valueToUse: string | number | boolean | undefined;

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

    const prompt =
        typeof options.prompt === 'string' && options.prompt.trim()
            ? options.prompt.trim()
            : typeof formState.prompt === 'string' && formState.prompt.trim()
                ? formState.prompt.trim()
                : 'Generated Image';

    const taskId = options.taskId || (
        typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    );

    const basePath = (import.meta.env.VITE_BASE_PATH || '').replace(/\/$/, '');
    const apiUrl = basePath ? `${basePath}/api/generate` : '/api/generate';

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            taskId,
            modelId: model.id,
            prompt,
            params,
        }),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'Network request failed');
        throw new Error(`${response.status} ${errText}`);
    }

    const data = await response.json();
    if (!data?.requestId) {
        throw new Error('Server did not return a BizyAir requestId');
    }

    return {
        taskId,
        requestId: data.requestId,
        imageUrl: data.imageUrl,
        status: data.status || 'QUEUED',
        submittedParams: params,
    };
};

export const pollTaskStatus = async (
    requestId: string,
    taskDetails?: PollTaskDetails,
    taskId?: string
): Promise<TaskResponse> => {
    const basePath = (import.meta.env.VITE_BASE_PATH || '').replace(/\/$/, '');
    const apiUrl = basePath ? `${basePath}/api/status` : '/api/status';

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requestId,
            taskId,
            taskDetails: taskDetails || null
        })
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'Network request failed');
        throw new Error(`${response.status} ${errText}`);
    }

    const data = await response.json();
    return {
        id: taskId || '',
        requestId: data.requestId,
        status: data.status,
        resultUrl: data.resultUrl,
        images: data.images,
        error: data.error,
        progress: data.progress,
        bizyStatus: data.bizyStatus,
        queueCount: data.queueCount
    };
};
