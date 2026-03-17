import React, { Suspense, useState, useEffect, useRef, useMemo, memo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { ASPECT_RATIOS, QUALITY_LEVELS, RESOLUTION_MAP } from '../constants';
import Button from '../components/Button';
import { GeneratedImage, GenerationStage, GenerationTask, Model } from '../types';

const ImageZoom = React.lazy(() => import('../components/ImageZoom'));

// Default Thumbnail for Models
const DEFAULT_MODEL_THUMB = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzExMSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjIwIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==`;

const STAGE_SEQUENCE: GenerationStage[] = ['queued', 'preparing', 'generating', 'completed'];

const getAspectRatioFromDimensions = (width?: number, height?: number) => {
    if (!width || !height) {
        return '1:1';
    }

    const ratio = width / height;
    if (ratio > 1.7) return '16:9';
    if (ratio > 1.4) return '3:2';
    if (ratio > 1.1) return '4:3';
    if (ratio > 0.9) return '1:1';
    if (ratio > 0.7) return '3:4';
    if (ratio > 0.55) return '2:3';
    return '9:16';
};

const getTaskStage = (task: Pick<GenerationTask, 'status' | 'stage'>): GenerationStage => {
    if (task.status === 'completed') return 'completed';
    if (task.status === 'failed') return 'failed';
    if (task.stage) return task.stage;
    return task.status === 'queued' ? 'queued' : 'generating';
};

const getStageLabel = (stage: GenerationStage) => {
    switch (stage) {
        case 'queued':
            return 'Queued';
        case 'preparing':
            return 'Preparing';
        case 'generating':
            return 'Generating';
        case 'completed':
            return 'Complete';
        case 'failed':
            return 'Failed';
        default:
            return 'Working';
    }
};

const getFailureTitle = (task: GenerationTask) => {
    switch (task.failureCode) {
        case 'timeout':
            return 'Generation Timed Out';
        case 'invalid_input':
            return 'Settings Need Adjustment';
        case 'quota':
            return 'Service Is Busy';
        case 'network':
            return 'Connection Problem';
        case 'cancelled':
            return 'Generation Cancelled';
        case 'empty_output':
            return 'No Image Was Returned';
        default:
            return 'Generation Failed';
    }
};

const getTaskProgress = (task: Pick<GenerationTask, 'status' | 'stage' | 'progress'>) => {
    const stage = getTaskStage(task);
    const fallback = stage === 'queued'
        ? 8
        : stage === 'preparing'
            ? 38
            : stage === 'generating'
                ? 72
                : 100;

    const progress = typeof task.progress === 'number' ? task.progress : fallback;
    return Math.max(0, Math.min(100, Math.round(progress)));
};

const getTaskFeedback = (task: GenerationTask, elapsedSeconds: number) => {
    const stage = getTaskStage(task);
    const progress = getTaskProgress(task);
    const meta: string[] = [];

    if (elapsedSeconds > 0) {
        meta.push(`${elapsedSeconds}s elapsed`);
    }

    if (task.queueCount !== undefined && task.queueCount >= 0) {
        meta.push(task.queueCount === 0 ? 'Next in queue' : `${task.queueCount} task${task.queueCount === 1 ? '' : 's'} ahead`);
    }

    if (task.bizyStatus) {
        meta.push(`Provider: ${task.bizyStatus}`);
    }

    switch (stage) {
        case 'queued':
            return {
                stage,
                progress,
                title: 'Queued for generation',
                description: task.queueCount !== undefined && task.queueCount >= 0
                    ? task.queueCount === 0
                        ? 'Your task is next in line. We are waiting for compute to free up.'
                        : `There are ${task.queueCount} task${task.queueCount === 1 ? '' : 's'} ahead of yours. We will start as soon as compute is available.`
                    : 'Your task has been accepted and is waiting for compute to free up.',
                meta,
            };
        case 'preparing':
            return {
                stage,
                progress,
                title: 'Preparing model',
                description: 'We are allocating compute and warming up the model before the first pixels render.',
                meta,
            };
        case 'generating':
            return {
                stage,
                progress,
                title: 'Generating your image',
                description: elapsedSeconds > 45
                    ? 'The model is still rendering. Larger sizes and more complex prompts can take a bit longer.'
                    : 'The model is actively rendering your image now.',
                meta,
            };
        case 'completed':
            return {
                stage,
                progress,
                title: 'Generation complete',
                description: 'Your image is ready.',
                meta,
            };
        default:
            return {
                stage,
                progress,
                title: getFailureTitle(task),
                description: task.failureHint || 'Try again or adjust the settings and rerun the task.',
                meta,
            };
    }
};

const getImmediateFailurePresentation = (message: string) => {
    const normalized = message.toLowerCase();

    if (normalized.includes('timeout') || normalized.includes('timed out')) {
        return {
            error: 'The request timed out before the image service returned a result.',
            failureCode: 'timeout' as const,
            failureHint: 'Try again with 1K quality or a simpler prompt.',
            failureDetail: message,
        };
    }

    if (
        normalized.includes('429') ||
        normalized.includes('quota') ||
        normalized.includes('rate limit') ||
        normalized.includes('capacity')
    ) {
        return {
            error: 'The image service is busy or temporarily rate-limited.',
            failureCode: 'quota' as const,
            failureHint: 'Wait a moment and retry, or switch to another model.',
            failureDetail: message,
        };
    }

    if (
        normalized.includes('missing') ||
        normalized.includes('invalid') ||
        normalized.includes('400') ||
        normalized.includes('required')
    ) {
        return {
            error: 'Some settings were rejected before generation could start.',
            failureCode: 'invalid_input' as const,
            failureHint: 'Check your prompt, reference images, and parameters, then try again.',
            failureDetail: message,
        };
    }

    if (
        normalized.includes('network') ||
        normalized.includes('fetch') ||
        normalized.includes('502') ||
        normalized.includes('503') ||
        normalized.includes('504')
    ) {
        return {
            error: 'The connection to the image service failed before generation could start.',
            failureCode: 'network' as const,
            failureHint: 'Retry in a moment. If it keeps happening, switch models or lower the quality.',
            failureDetail: message,
        };
    }

    return {
        error: 'The task could not be submitted to the image service.',
        failureCode: 'provider_error' as const,
        failureHint: 'Retry the task. If the same model keeps failing, switch to another one.',
        failureDetail: message,
    };
};

const DeleteTaskButton = ({ onDelete }: { onDelete: () => void }) => {
    const [status, setStatus] = useState<'idle' | 'confirm'>('idle');
    useEffect(() => {
        if (status === 'confirm') {
            const timer = setTimeout(() => setStatus('idle'), 3000);
            return () => clearTimeout(timer);
        }
    }, [status]);
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (status === 'idle') setStatus('confirm');
        else onDelete();
    };
    return (
        <button onClick={handleClick} className={`absolute top-1 left-1 z-20 w-5 h-5 flex items-center justify-center rounded-full transition-all duration-200 ${status === 'confirm' ? 'bg-red-500 text-white scale-110' : 'bg-black/50 text-white/50 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100'}`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    );
};

// Memoized TaskItem component for better performance
interface TaskItemProps {
    task: GenerationTask;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
}

const TaskItem = memo(function TaskItem({ task, isActive, onSelect, onDelete }: TaskItemProps) {
    const handleDelete = () => onDelete(task.id);
    const [elapsedTime, setElapsedTime] = useState<number>(0);
    const taskStage = getTaskStage(task);
    const taskProgress = getTaskProgress(task);

    // Timer effect for ongoing tasks
    useEffect(() => {
        if (task.status !== 'processing' && task.status !== 'queued') {
            return;
        }

        const startTime = task.startedAt || task.createdAt;

        const updateTimer = () => {
            const now = Date.now();
            const elapsed = Math.floor((now - startTime) / 1000);
            setElapsedTime(elapsed);
        };

        // Update immediately
        updateTimer();

        // Update every second
        const intervalId = setInterval(updateTimer, 1000);

        return () => clearInterval(intervalId);
    }, [task.status, task.startedAt, task.createdAt]);

    // Display time: for completed use duration, for ongoing use elapsedTime
    const displayTime = task.status === 'completed' && task.duration
        ? task.duration
        : (task.status === 'processing' || task.status === 'queued') ? elapsedTime : null;

    return (
        <div
            onClick={() => onSelect(task.id)}
            className={`relative aspect-square rounded-lg border-2 cursor-pointer overflow-hidden transition-all group shrink-0 ${isActive ? 'border-white' : 'border-transparent hover:border-carbon-lightBorder'}`}
            style={{ height: '100px' }}
        >
            <DeleteTaskButton onDelete={handleDelete} />

            {/* Timer Badge */}
            {displayTime !== null && (
                <div className={`absolute top-1 right-1 z-20 px-1.5 py-0.5 rounded text-[9px] font-mono ${task.status === 'completed' ? 'bg-green-500/80 text-white' : 'bg-black/60 text-white/80'}`}>
                    {displayTime}s
                </div>
            )}

            {task.status !== 'completed' && (
                <div className="absolute bottom-0 left-0 right-0 z-20">
                    <div className="mx-1 mb-1 rounded bg-black/60 px-1.5 py-0.5 text-[8px] uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm">
                        {getStageLabel(taskStage)}
                    </div>
                    <div className="h-0.5 bg-white/10">
                        <div
                            className={`h-full transition-all duration-500 ${task.status === 'failed' ? 'bg-red-400' : 'bg-white'}`}
                            style={{ width: `${taskProgress}%` }}
                        />
                    </div>
                </div>
            )}

            {task.status === 'completed' && task.imageUrl ? (
                <img src={task.imageUrl} alt="Result" className="w-full h-full object-cover" />
            ) : task.status === 'failed' ? (
                <div className="w-full h-full bg-red-900/20 flex flex-col items-center justify-center p-2">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-[8px] text-red-400 mt-1">Failed</span>
                </div>
            ) : (
                <div className="w-full h-full bg-carbon-surface flex flex-col items-center justify-center p-2">
                    <div className="w-4 h-4 border-2 border-carbon-border border-t-white rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
});



const Generate: React.FC = () => {
    const { user } = useAuth();
    const {
        addUserImage,
        publishImage,
        userImages,
        availableModels,
        generationPrompt,
        setPromptForGeneration,
        tasks,
        setTasks,
        activeTaskId,
        setActiveTaskId,
        isLoadingTasks: isLoading,
        deleteTask: deleteTaskFromPolling
    } = useApp();

    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [publishingId, setPublishingId] = useState<string | null>(null);

    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    const [quality, setQuality] = useState<string>('1K');
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);

    const [formState, setFormState] = useState<Record<string, string | number | boolean | null>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeUploadKey = useRef<string | null>(null);
    const [zoomUrl, setZoomUrl] = useState<string | null>(null);
    const [activeBatchIndex, setActiveBatchIndex] = useState<number | null>(null);
    const [activeElapsedTime, setActiveElapsedTime] = useState(0);

    const activeTask = useMemo(() => tasks.find(t => t.id === activeTaskId), [tasks, activeTaskId]);



    // Close model menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (modelMenuRef.current && !modelMenuRef.current.contains(event.target as Node)) {
                setModelMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (availableModels.length > 0 && !selectedModelId) setSelectedModelId(availableModels[0].id);
    }, [availableModels, selectedModelId]);

    const [pendingFormState, setPendingFormState] = useState<Record<string, string | number | boolean | null> | null>(null);

    useEffect(() => {
        if (!activeTask || (activeTask.status !== 'processing' && activeTask.status !== 'queued')) {
            setActiveElapsedTime(0);
            return;
        }

        const startTime = activeTask.startedAt || activeTask.createdAt;
        const updateElapsedTime = () => setActiveElapsedTime(Math.floor((Date.now() - startTime) / 1000));

        updateElapsedTime();
        const intervalId = setInterval(updateElapsedTime, 1000);
        return () => clearInterval(intervalId);
    }, [activeTask]);

    useEffect(() => {
        const current = availableModels.find(m => m.id === selectedModelId);
        if (current && current.schema) {
            // If we have a pending form state from Recreate, use it instead of defaults
            if (pendingFormState) {
                setFormState(pendingFormState);
                setPendingFormState(null);
            } else {
                const initialState: Record<string, any> = {};
                current.schema.inputs.forEach(input => {
                    if (input.defaultValue !== undefined) initialState[input.key] = input.defaultValue;
                });
                setFormState(initialState);
            }
        }
    }, [selectedModelId, availableModels, pendingFormState]);

    const findModelForPreset = (modelId?: string, modelName?: string) => {
        return availableModels.find(m => m.id === modelId) ||
            availableModels.find(m => m.name === modelName) ||
            availableModels.find(m => m.id === modelName) ||
            availableModels[0];
    };

    const applyGenerationPreset = ({
        prompt,
        modelId,
        modelName,
        params,
        width,
        height,
    }: {
        prompt: string;
        modelId?: string;
        modelName?: string;
        params?: GeneratedImage['params'] | GenerationTask['params'];
        width?: number;
        height?: number;
    }) => {
        setPromptForGeneration(prompt);

        const targetModel = findModelForPreset(modelId, modelName);
        if (!targetModel) {
            return null;
        }

        setSelectedModelId(targetModel.id);

        if (params?.input_values) {
            setPendingFormState(params.input_values as Record<string, string | number | boolean | null>);
        }

        if (params?.aspect_ratio) {
            setAspectRatio(String(params.aspect_ratio));
        } else {
            setAspectRatio(getAspectRatioFromDimensions(width, height));
        }

        if (params?.quality) {
            setQuality(String(params.quality));
        }

        topRef.current?.scrollIntoView({ behavior: 'smooth' });
        return targetModel;
    };

    const handleInputChange = (key: string, value: string | number | boolean | null) => setFormState(prev => ({ ...prev, [key]: value }));

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeUploadKey.current) {
            return;
        }

        const uploadKey = activeUploadKey.current;

        void (async () => {
            try {
                setErrorMsg(null);

                const { default: imageCompression } = await import('browser-image-compression');
                const processedFile = await imageCompression(file, {
                    maxSizeMB: 1.5,
                    maxWidthOrHeight: 2048,
                    useWebWorker: true,
                    initialQuality: 0.82,
                });

                const reader = new FileReader();
                reader.onloadend = () => handleInputChange(uploadKey, reader.result as string);
                reader.readAsDataURL(processedFile);
            } catch (error) {
                console.error('[Generate] Failed to prepare input image:', error);
                setErrorMsg('Failed to prepare the reference image. Try a smaller file or switch off the VPN and retry.');
            }
        })();
    };

    const triggerUpload = (key: string) => {
        activeUploadKey.current = key;
        if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
    };

    const handleRecreate = (e: React.MouseEvent | null, img: GeneratedImage) => {
        if (e) e.stopPropagation();
        applyGenerationPreset({
            prompt: img.prompt,
            modelId: img.modelId || img.model,
            modelName: img.model,
            params: img.params,
            width: img.width,
            height: img.height,
        });
    };

    const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];
    if (!currentModel) return <div className="p-8 text-center text-carbon-muted">Loading models...</div>;

    const visibleInputs = currentModel.schema?.inputs.filter(i => i.type !== 'hidden') || [];
    const imageInputs = visibleInputs.filter(i => i.type === 'image');
    const mainPromptInput = visibleInputs.find(i => i.type === 'textarea' && (i.label === 'Prompt' || i.label === 'Text Input'));
    const negativePromptInput = visibleInputs.find(i => i.label === 'Negative Prompt');
    const otherInputs = visibleInputs.filter(i => i !== mainPromptInput && i !== negativePromptInput && i.type !== 'image');
    const promptRequired = Boolean(mainPromptInput);
    const canSubmitCurrentForm = !promptRequired || generationPrompt.trim().length > 0;

    const submitTask = async ({
        model,
        prompt,
        draftFormState,
        ratio,
        qualityValue,
    }: {
        model: Model;
        prompt: string;
        draftFormState: Record<string, string | number | boolean | null>;
        ratio: string;
        qualityValue: string;
    }) => {
        if (!user) {
            alert('Please log in.');
            return;
        }
        const promptVal = prompt.trim();
        const modelVisibleInputs = model.schema?.inputs.filter(input => input.type !== 'hidden') || [];
        const modelImageInputs = modelVisibleInputs.filter(input => input.type === 'image');
        const modelPromptInput = modelVisibleInputs.find(input => input.type === 'textarea' && (input.label === 'Prompt' || input.label === 'Text Input'));

        if (!promptVal && modelPromptInput) {
            setErrorMsg('Please enter a prompt before starting generation.');
            return;
        }

        if (modelImageInputs.length > 0) {
            const missing = modelImageInputs.some(input => !draftFormState[input.key]);
            if (missing) {
                setErrorMsg('Please upload all required reference images.');
                return;
            }
        }

        setErrorMsg(null);

        const dimensions = RESOLUTION_MAP[ratio]?.[qualityValue] || { w: 1024, h: 1024 };
        const finalFormState = { ...draftFormState };
        if (modelPromptInput) finalFormState[modelPromptInput.key] = promptVal;

        // 1. 立即创建待处理任务并添加到 state，让加载动画立即显示
        const pendingTaskId = `pending_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        const now = Date.now();
        const pendingTask: GenerationTask = {
            id: pendingTaskId,
            status: 'queued',
            stage: 'queued',
            progress: 5,
            bizyStatus: 'Submitting',
            prompt: promptVal,
            modelName: model.name,
            modelId: model.id,
            params: {
                web_app_id: model.schema?.model_id,
                input_values: finalFormState,
                aspect_ratio: ratio,
                quality: qualityValue
            },
            createdAt: now,
            startedAt: now,
            width: dimensions.w,
            height: dimensions.h
        };
        setTasks(prev => [pendingTask, ...prev]);
        setActiveTaskId(pendingTaskId);

        try {
            const { submitGenerationTask } = await import('../services/api');
            const submitResponse = await submitGenerationTask({
                model,
                formState: finalFormState,
                globalWidth: dimensions.w,
                globalHeight: dimensions.h,
                globalAspectRatio: ratio,
                globalQuality: qualityValue
            });

            const { taskId: backendTaskId, imageUrl, status, requestId, submittedParams } = submitResponse;
            const nextStatus = status === 'COMPLETED' ? 'completed' : (status === 'PROCESSING' || status === 'PENDING' ? 'processing' : 'queued');
            const nextStage = status === 'COMPLETED' ? 'completed' : nextStatus === 'processing' ? 'preparing' : 'queued';
            const nextProgress = status === 'COMPLETED' ? 100 : nextStatus === 'processing' ? 24 : 8;
            const completedAt = status === 'COMPLETED' && imageUrl ? Date.now() : undefined;
            const duration = completedAt ? Math.floor((completedAt - pendingTask.startedAt!) / 1000) : undefined;

            // 3. 用真实的 task ID 更新任务
            setTasks(prev => prev.map(t =>
                t.id === pendingTaskId
                    ? {
                        ...t,
                        id: backendTaskId,
                        requestId,
                        params: submittedParams ? {
                            ...t.params,
                            ...submittedParams
                        } : t.params,
                        status: nextStatus,
                        stage: nextStage,
                        progress: nextProgress,
                        bizyStatus: status === 'COMPLETED' ? 'Success' : nextStatus === 'processing' ? 'Preparing' : 'Queued',
                        queueCount: undefined,
                        imageUrl: imageUrl || t.imageUrl,
                        images: imageUrl ? [imageUrl] : t.images,
                        error: undefined,
                        failureCode: undefined,
                        failureHint: undefined,
                        failureDetail: undefined,
                        completedAt,
                        duration
                    }
                    : t
            ));
            setActiveTaskId(backendTaskId);

            // 4. 如果已经生成完成，立即添加到画廊
            if (status === 'COMPLETED' && imageUrl) {
                addUserImage({
                    id: `img_${backendTaskId}`,
                    url: imageUrl,
                    images: [imageUrl],
                    prompt: promptVal,
                    width: dimensions.w,
                    height: dimensions.h,
                    createdAt: Date.now(),
                    isPublic: false,
                    userId: user?.id || 'anon',
                    model: model.name,
                    modelId: model.id,
                    params: {
                        web_app_id: model.schema?.model_id,
                        aspect_ratio: ratio,
                        quality: qualityValue,
                        input_values: finalFormState
                    },
                    duration: duration || 0
                });
            }

        } catch (err: unknown) {
            // 忽略正常的请求中止
            if (err instanceof Error && err.name === 'AbortError') return;

            const message = err instanceof Error ? err.message : 'Generation failed';
            const failure = getImmediateFailurePresentation(message);
            const completedAt = Date.now();
            console.error(message);
            // 失败时移除待处理任务
            setTasks(prev => prev.map(task =>
                task.id === pendingTaskId
                    ? {
                        ...task,
                        status: 'failed',
                        stage: 'failed',
                        progress: 100,
                        bizyStatus: 'Submission Failed',
                        completedAt,
                        duration: task.startedAt ? Math.max(0, Math.floor((completedAt - task.startedAt) / 1000)) : 0,
                        error: failure.error,
                        failureCode: failure.failureCode,
                        failureHint: failure.failureHint,
                        failureDetail: failure.failureDetail,
                    }
                    : task
            ));
            setActiveTaskId(pendingTaskId);
            setErrorMsg(failure.error);
        }
    };

    const handleGenerate = async () => {
        await submitTask({
            model: currentModel,
            prompt: generationPrompt,
            draftFormState: formState,
            ratio: aspectRatio,
            qualityValue: quality,
        });
    };

    const handleRetryTask = async (task: GenerationTask) => {
        const targetModel = findModelForPreset(task.modelId, task.modelName);
        if (!targetModel) {
            setErrorMsg('The original model is no longer available. Please choose another model.');
            return;
        }

        const retryRatio = task.params?.aspect_ratio ? String(task.params.aspect_ratio) : getAspectRatioFromDimensions(task.width, task.height);
        const retryQuality = task.params?.quality ? String(task.params.quality) : quality;
        const retryFormState = (task.params?.input_values as Record<string, string | number | boolean | null>) || {};

        applyGenerationPreset({
            prompt: task.prompt,
            modelId: task.modelId,
            modelName: task.modelName,
            params: task.params,
            width: task.width,
            height: task.height,
        });

        await submitTask({
            model: targetModel,
            prompt: task.prompt,
            draftFormState: retryFormState,
            ratio: retryRatio,
            qualityValue: retryQuality,
        });
    };

    const handleEditFailedTask = (task: GenerationTask) => {
        applyGenerationPreset({
            prompt: task.prompt,
            modelId: task.modelId,
            modelName: task.modelName,
            params: task.params,
            width: task.width,
            height: task.height,
        });
    };

    // Canvas View Logic
    const displayedImageUrl = activeTask?.images && activeTask.images.length > 0 ? (activeBatchIndex !== null ? activeTask.images[activeBatchIndex] : activeTask.imageUrl) : activeTask?.imageUrl;
    const isBatchView = activeTask?.status === 'completed' && activeTask.images && activeTask.images.length > 1 && activeBatchIndex === null;
    const taskAspectRatio = activeTask && activeTask.height > 0 ? activeTask.width / activeTask.height : 1;
    const isActiveTaskRunning = activeTask?.status === 'processing' || activeTask?.status === 'queued';
    const activeTaskFeedback = activeTask ? getTaskFeedback(activeTask, activeElapsedTime) : null;
    const activeStageIndex = activeTaskFeedback ? STAGE_SEQUENCE.indexOf(activeTaskFeedback.stage === 'failed' ? 'generating' : activeTaskFeedback.stage) : -1;

    // --- RENDER ---
    return (
        <div className="space-y-8 animate-fade-in" ref={topRef}>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4">
                    <div className="carbon-card p-6 flex flex-col">
                        {/* 参数设置区域 - 无滚动条，全部展示 */}
                        <div className="space-y-5">

                            {/* Model Selector */}
                            <div className="flex items-center justify-between z-20">
                                <h2 className="text-xs font-semibold text-carbon-text uppercase tracking-wider">Model</h2>
                                <div className="relative w-2/3" ref={modelMenuRef}>
                                    <button onClick={() => setModelMenuOpen(!modelMenuOpen)} disabled={isLoading} className={`w-full flex items-center justify-between gap-3 px-3 py-2 bg-carbon-surface border border-carbon-border rounded-lg text-xs font-medium text-carbon-text hover:bg-white/5 hover:border-white/20 transition-all duration-200 group ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <img src={currentModel.thumbnail || DEFAULT_MODEL_THUMB} alt="icon" className="w-5 h-5 rounded object-cover border border-carbon-border bg-black" />
                                            <span className="truncate">{currentModel.name}</span>
                                        </div>
                                        <svg className={`w-3 h-3 text-carbon-muted transition-transform duration-200 ${modelMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </button>

                                    <div className={`absolute right-0 top-full mt-2 w-72 bg-[#111] border border-carbon-border rounded-lg shadow-2xl z-40 overflow-hidden ring-1 ring-white/10 max-h-80 overflow-y-auto transform transition-all duration-200 origin-top-right ${modelMenuOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'}`}>
                                        <div className="p-1.5 space-y-1">
                                            {availableModels.map(m => (
                                                <button key={m.id} onClick={() => { setSelectedModelId(m.id); setModelMenuOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-md flex items-center gap-3 transition-colors ${selectedModelId === m.id ? 'bg-white/10 text-white' : 'text-carbon-text hover:bg-white/5'}`}>
                                                    <img src={m.thumbnail || DEFAULT_MODEL_THUMB} alt={m.name} className="w-8 h-8 rounded object-cover border border-carbon-border bg-black" />
                                                    <div className="flex flex-col overflow-hidden">
                                                        <span className="text-xs font-medium truncate">{m.name}</span>
                                                        <span className="text-[9px] text-carbon-muted truncate">{m.description}</span>
                                                    </div>
                                                    {selectedModelId === m.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]"></div>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Inputs */}
                            {imageInputs.length > 0 && (
                                <div className="space-y-3">
                                    <label className="block text-[10px] font-medium uppercase text-carbon-muted tracking-wide">Input Images <span className="text-red-400">*</span></label>
                                    <div className="flex gap-2 flex-wrap">
                                        {imageInputs.map((input) => (
                                            <div key={input.key} className="relative flex flex-col items-center gap-1">
                                                {!formState[input.key] ? (
                                                    <div onClick={() => !isLoading && triggerUpload(input.key)} className={`w-24 h-24 border border-dashed border-carbon-border rounded-lg bg-carbon-surface/50 hover:bg-carbon-surface cursor-pointer flex flex-col items-center justify-center gap-2 group ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                                        <div className="p-1.5 rounded-full bg-carbon-card border border-carbon-border group-hover:border-white/20"><svg className="w-3 h-3 text-carbon-muted group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
                                                        <span className="text-[9px] text-carbon-muted">{input.label}</span>
                                                    </div>
                                                ) : (
                                                    <div className={`relative w-24 h-24 group rounded-lg overflow-hidden border border-carbon-border bg-black/40 ${isLoading ? 'opacity-50' : ''}`}>
                                                        <img src={formState[input.key]} alt="Input" className="w-full h-full object-contain bg-black/50" />
                                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer" onClick={() => !isLoading && handleInputChange(input.key, null)}>
                                                            <div className="p-1.5 bg-red-500/80 text-white rounded-full"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {mainPromptInput && (
                                <div>
                                    <label className="block text-[10px] font-medium uppercase text-carbon-muted mb-2 tracking-wide">Prompt</label>
                                    <textarea className="w-full h-28 p-3 pb-8 rounded-lg carbon-input text-xs resize-none font-normal leading-relaxed placeholder-carbon-muted/50 focus:ring-1 focus:ring-white/10" placeholder="Describe your imagination..." value={generationPrompt} onChange={(e) => setPromptForGeneration(e.target.value)} disabled={isLoading}></textarea>
                                </div>
                            )}

                            {negativePromptInput && (
                                <div>
                                    <label className="block text-[10px] font-medium uppercase text-carbon-muted mb-2 tracking-wide">Negative</label>
                                    <textarea className="w-full h-16 p-3 rounded-lg carbon-input text-xs resize-none placeholder-carbon-muted/50 focus:ring-1 focus:ring-red-500/20 border-carbon-border focus:border-red-500/20" placeholder="Avoid..." value={formState[negativePromptInput.key] || ''} onChange={(e) => handleInputChange(negativePromptInput.key, e.target.value)} disabled={isLoading}></textarea>
                                </div>
                            )}

                            {/* Params & Settings */}
                            {otherInputs.length > 0 && (
                                <div className={`space-y-4 pt-2 border-t border-carbon-border/50 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    {otherInputs.map(input => (
                                        <div key={input.key} className="space-y-1.5">
                                            <label className="flex items-center justify-between text-[10px] font-medium text-carbon-text">
                                                <span>{input.label}</span>
                                                {input.type === 'slider' && <span className="text-carbon-muted font-mono">{formState[input.key]?.toFixed(2)}</span>}
                                            </label>
                                            {input.type === 'slider' && <input type="range" min={input.min} max={input.max} step={input.step} value={formState[input.key] ?? input.defaultValue ?? 0} onChange={(e) => handleInputChange(input.key, Number(e.target.value))} className="w-full h-1 bg-carbon-border rounded-lg appearance-none cursor-pointer accent-white" />}
                                            {input.type === 'select' && input.options && <div className="grid grid-cols-4 gap-1 p-1 bg-carbon-surface rounded border border-carbon-border">{input.options.map((opt: string | number) => <button key={opt} onClick={() => handleInputChange(input.key, isNaN(Number(opt)) ? String(opt) : Number(opt))} className={`text-[10px] font-bold py-1.5 rounded transition-colors ${String(formState[input.key]) === String(opt) ? 'bg-carbon-card text-white shadow border border-white/20' : 'text-carbon-muted hover:text-white'}`}>{opt}</button>)}</div>}
                                            {input.type === 'boolean' && <div onClick={() => handleInputChange(input.key, !formState[input.key])} className={`w-full p-2 rounded border cursor-pointer flex items-center justify-between ${formState[input.key] ? 'bg-carbon-surface border-white/20' : 'bg-transparent border-carbon-border'}`}><span className="text-[10px] text-carbon-muted">{formState[input.key] ? 'On' : 'Off'}</span><div className={`w-8 h-4 rounded-full relative ${formState[input.key] ? 'bg-white' : 'bg-carbon-border'}`}><div className={`absolute top-0.5 w-3 h-3 rounded-full bg-black transition-transform ${formState[input.key] ? 'left-4.5' : 'left-0.5'}`}></div></div></div>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className={`space-y-4 pt-2 border-t border-carbon-border/50 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                {/* Ratio & Quality Selectors */}
                                <div>
                                    <label className="block text-[10px] font-medium uppercase text-carbon-muted mb-2 tracking-wide">Ratio</label>
                                    <div className="grid grid-cols-5 gap-1">
                                        {ASPECT_RATIOS.map((r) => <button key={r} onClick={() => setAspectRatio(r)} className={`py-1.5 text-[9px] font-medium rounded border ${aspectRatio === r ? 'bg-carbon-text text-carbon-base border-carbon-text' : 'bg-transparent border-carbon-border text-carbon-muted'}`}>{r}</button>)}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-medium uppercase text-carbon-muted mb-2 tracking-wide">Quality</label>
                                    <div className="flex p-1 bg-carbon-surface rounded-md border border-carbon-border gap-1">
                                        {QUALITY_LEVELS.map((q) => <button key={q.value} onClick={() => setQuality(q.value)} className={`flex-1 py-1 text-[10px] font-bold uppercase rounded ${quality === q.value ? 'bg-carbon-card border border-white/20 text-white' : 'text-carbon-muted'}`}>{q.value}</button>)}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <Button onClick={handleGenerate} disabled={!canSubmitCurrentForm || isLoading} isLoading={isLoading} className="w-full py-3">
                                    {isLoading ? 'Queued' : 'Generate'}
                                </Button>
                            </div>
                            {errorMsg && <div className="p-3 bg-red-900/10 border border-red-900/20 rounded-md"><p className="text-red-400 text-xs">{errorMsg}</p></div>}
                        </div>
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="lg:col-span-8 h-[700px]">
                    <div className="h-full carbon-card flex overflow-hidden relative bg-[#050505] shadow-2xl">
                        <div className="flex-1 flex flex-col relative bg-[#050505]">
                            <div className={`flex-grow flex items-center justify-center relative overflow-hidden px-4 pt-4 pb-16 ${isActiveTaskRunning ? 'bg-black' : "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiMyMjIiLz48L3N2Zz4=')]"}`}>
                                {!activeTask ? (
                                    <div className="text-center text-carbon-muted/20">
                                        <div className="text-4xl mb-2 font-light text-carbon-border">+</div>
                                        <p className="text-xs font-medium uppercase tracking-wider text-carbon-muted/40">Select or Start a Task</p>
                                    </div>
                                ) : isActiveTaskRunning && activeTaskFeedback ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/95 p-6">
                                        <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0b0b]/95 p-6 md:p-8">
                                            <div className="mb-6 flex items-start justify-between gap-4">
                                                <div className="space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-3 w-3 animate-pulse rounded-full bg-white"></div>
                                                        <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-carbon-muted">Live Status</p>
                                                    </div>
                                                    <div>
                                                        <h3 className="text-2xl font-semibold text-white">{activeTaskFeedback.title}</h3>
                                                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-carbon-muted">{activeTaskFeedback.description}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-3xl font-semibold text-white">{activeTaskFeedback.progress}%</div>
                                                    <div className="text-[10px] uppercase tracking-[0.25em] text-carbon-muted">estimated</div>
                                                </div>
                                            </div>

                                            <div className="mb-6">
                                                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-white via-white to-[#6ee7ff] transition-all duration-500"
                                                        style={{ width: `${activeTaskFeedback.progress}%` }}
                                                    />
                                                </div>
                                                <p className="mt-2 text-[11px] leading-relaxed text-carbon-muted">
                                                    Live stage updates refresh every few seconds. The percentage is an estimate based on provider state, not an exact internal progress value.
                                                </p>
                                            </div>

                                            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                {(activeTaskFeedback.meta.length > 0 ? activeTaskFeedback.meta : ['Task accepted', 'Waiting for next provider update', 'You can keep editing other settings while this runs']).map((item) => (
                                                    <div key={item} className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80">
                                                        {item}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {STAGE_SEQUENCE.map((stage, index) => {
                                                    const isCompletedStage = activeStageIndex > index;
                                                    const isCurrentStage = activeTaskFeedback.stage === stage;
                                                    return (
                                                        <div
                                                            key={stage}
                                                            className={`rounded-xl border px-3 py-3 text-center text-[11px] font-medium uppercase tracking-[0.22em] transition-colors ${isCompletedStage || isCurrentStage ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-carbon-muted'}`}
                                                        >
                                                            {getStageLabel(stage)}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : activeTask.status === 'failed' ? (
                                    <div className="w-full max-w-2xl p-6 md:p-8">
                                        <div className="rounded-2xl border border-red-500/20 bg-[#0d0909]/95 p-6 md:p-8">
                                            <div className="mb-4 inline-flex rounded-full bg-red-500/10 p-4 text-red-500">
                                                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <div className="mb-5 space-y-2">
                                                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-red-300/70">Task Feedback</p>
                                                <h3 className="text-2xl font-semibold text-white">{getFailureTitle(activeTask)}</h3>
                                                <p className="text-base leading-relaxed text-red-50/90">{activeTask.error || 'The task stopped before a result was returned.'}</p>
                                                {activeTask.failureHint && (
                                                    <p className="text-sm leading-relaxed text-carbon-muted">{activeTask.failureHint}</p>
                                                )}
                                            </div>
                                            {activeTask.failureDetail && activeTask.failureDetail !== activeTask.error && (
                                                <div className="mb-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
                                                    <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-carbon-muted">Technical Detail</p>
                                                    <p className="text-sm text-white/75">{activeTask.failureDetail}</p>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-3">
                                                <Button onClick={() => void handleRetryTask(activeTask)} variant="primary" size="sm">
                                                    Retry Now
                                                </Button>
                                                <Button onClick={() => handleEditFailedTask(activeTask)} variant="secondary" size="sm">
                                                    Review Settings
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : isBatchView ? (
                                    <div className="grid grid-cols-2 gap-3 w-full h-full p-4 overflow-y-auto custom-scrollbar content-start">
                                        {activeTask.images!.map((url, idx) => (
                                            <div key={idx} style={{ aspectRatio: `${taskAspectRatio}` }} className="relative group cursor-pointer border border-transparent hover:border-white/50 rounded-lg overflow-hidden transition-all bg-carbon-surface" onClick={() => setActiveBatchIndex(idx)}>
                                                <img src={url} alt={`Batch ${idx}`} className="w-full h-full object-cover" />
                                                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 px-2 py-1 rounded text-xs text-white">#{idx + 1}</div>
                                            </div>
                                        ))}
                                    </div>
                                ) : displayedImageUrl ? (
                                    <>
                                        {activeBatchIndex !== null && <button onClick={() => setActiveBatchIndex(null)} className="absolute top-4 left-4 z-20 px-3 py-1.5 bg-black/80 backdrop-blur rounded text-white text-xs border border-white/10 hover:bg-white hover:text-black transition-colors flex items-center gap-1">Grid View</button>}
                                        <img src={displayedImageUrl} alt="Output" className="max-h-full max-w-full object-contain cursor-zoom-in relative z-10 shadow-2xl" onClick={() => setZoomUrl(displayedImageUrl)} />
                                    </>
                                ) : null}
                            </div>

                            {/* 工具栏: 图片超清 / 下载 / Publish */}
                            {displayedImageUrl && activeTask?.status === 'completed' && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-full">
                                    {/* 图片超清（占位） */}
                                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-carbon-muted hover:text-white rounded-full hover:bg-white/10 transition-colors" onClick={() => alert('图片超清功能即将上线')}>
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        图片超清
                                    </button>
                                    <div className="w-px h-4 bg-white/10"></div>
                                    {/* 下载 */}
                                    <button className="p-2 text-carbon-muted hover:text-white rounded-full hover:bg-white/10 transition-colors" title="下载图片" onClick={async () => { try { const res = await fetch(displayedImageUrl); const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `dopagen-${activeTask.id}-${Date.now()}.png`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); } catch { window.open(displayedImageUrl, '_blank'); } }}>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    </button>
                                    {/* Publish */}
                                    {(() => {
                                        // 通过当前显示图片的 URL 从 userImages 中查找对应记录
                                        const matchedImg = userImages.find(img => img.url === displayedImageUrl);
                                        const isPublished = matchedImg?.isPublic === true;
                                        const isPublishing = publishingId === matchedImg?.id;

                                        const handlePublish = async () => {
                                            if (!matchedImg || isPublished || isPublishing) return;
                                            setPublishingId(matchedImg.id);
                                            try {
                                                await publishImage(matchedImg.id);
                                            } finally {
                                                setPublishingId(null);
                                            }
                                        };

                                        return (
                                            <button
                                                onClick={handlePublish}
                                                disabled={isPublishing || !matchedImg}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors ${isPublished
                                                    ? 'text-green-400 bg-green-400/10 cursor-default'
                                                    : isPublishing
                                                        ? 'text-blue-400 bg-blue-400/10 cursor-wait'
                                                        : 'text-carbon-muted hover:text-white hover:bg-white/10'
                                                    }`}
                                                title={isPublished ? 'Published' : isPublishing ? 'Uploading...' : 'Publish to Gallery'}
                                            >
                                                {isPublishing ? (
                                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                    </svg>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                )}
                                                {isPublished ? 'Published' : isPublishing ? 'Uploading' : '发布'}
                                            </button>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Sidebar Queue */}
                        <div className="w-[120px] flex-shrink-0 border-l border-carbon-border bg-[#080808] flex flex-col">
                            <div className="p-3 border-b border-carbon-border bg-[#0a0a0a]">
                                <h3 className="text-[10px] font-bold text-carbon-muted uppercase tracking-wider text-center">Queue ({tasks.length})</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
                                {tasks.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-carbon-muted/30 gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-carbon-border"></div>
                                        <span className="text-[9px]">Empty</span>
                                    </div>
                                ) : (
                                    tasks.map((task) => (
                                        <TaskItem
                                            key={task.id}
                                            task={task}
                                            isActive={activeTaskId === task.id}
                                            onSelect={setActiveTaskId}
                                            onDelete={(id) => deleteTaskFromPolling(id)}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {zoomUrl && (
                <Suspense fallback={null}>
                    <ImageZoom url={zoomUrl} isOpen={!!zoomUrl} onClose={() => setZoomUrl(null)} />
                </Suspense>
            )}
        </div>
    );
};

export default Generate;
