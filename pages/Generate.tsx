import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
// Import new async methods
import { submitGenerationTask, pollTaskStatus, TaskResponse, SubmitTaskResponse } from '../services/api';
import { ASPECT_RATIOS, QUALITY_LEVELS, RESOLUTION_MAP } from '../constants';
import Button from '../components/Button';
import { DottedSurface } from '../components/ui/dotted-surface';
import ImageZoom from '../components/ImageZoom';
import ImageDetailModal from '../components/ImageDetailModal';
import { GeneratedImage, GenerationTask } from '../types';

// Default Thumbnail for Models
const DEFAULT_MODEL_THUMB = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzExMSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjIwIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==`;

const DeleteTaskButton = ({ onDelete }: { onDelete: () => void }) => {
    // ... (Keep existing implementation)
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

// Memoized FeedItem component for better performance
interface FeedItemProps {
    img: GeneratedImage;
    onClick: (img: GeneratedImage) => void;
    onRecreate: (e: React.MouseEvent | null, img: GeneratedImage) => void;
}

const FeedItem = memo(function FeedItem({ img, onClick, onRecreate }: FeedItemProps) {
    // Memoize derived values to avoid recalculation on every render
    const { username, avatarUrl } = useMemo(() => ({
        username: img.user?.username || img.userId.split('-')[0] || 'Anon',
        avatarUrl: img.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${img.userId}`
    }), [img.user, img.userId]);

    const handleRecreate = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRecreate(e, img);
    };

    return (
        <div 
            className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-pointer bg-carbon-card border border-carbon-border hover:border-white/20 transition-all duration-300" 
            onClick={() => onClick(img)}
        >
            <img 
                src={img.url} 
                alt={img.prompt} 
                className="w-full h-auto block transition-transform duration-700 group-hover:scale-105" 
                loading="lazy" 
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black via-black/80 to-transparent flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <img src={avatarUrl} alt={username} className="w-5 h-5 rounded-full border border-white/10 bg-black" />
                        <span className="text-[10px] font-medium text-white shadow-black drop-shadow">{username}</span>
                    </div>
                    <Button onClick={handleRecreate} size="sm" variant="primary" className="!py-1 !px-2.5 !text-[9px] !h-6">
                        Recreate
                    </Button>
                </div>
            </div>
        </div>
    );
});

const Generate: React.FC = () => {
    const { user } = useAuth();
    const { addUserImage, publicImages, availableModels, globalApiKey, generationPrompt, setPromptForGeneration } = useApp();

    // Tasks now hold the Backend ID
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    const [quality, setQuality] = useState<string>('1K');
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [modelMenuOpen, setModelMenuOpen] = useState(false);
    const modelMenuRef = useRef<HTMLDivElement>(null);
    const topRef = useRef<HTMLDivElement>(null);

    const [formState, setFormState] = useState<Record<string, any>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const activeUploadKey = useRef<string | null>(null);
    const [zoomUrl, setZoomUrl] = useState<string | null>(null);
    const [selectedFeedImage, setSelectedFeedImage] = useState<GeneratedImage | null>(null);
    const [activeBatchIndex, setActiveBatchIndex] = useState<number | null>(null);

    // --- POLLING LOGIC ---
    useEffect(() => {
        // Find tasks that are actively running
        const runningTasks = tasks.filter(t => t.status === 'processing' || t.status === 'queued');
        if (runningTasks.length === 0) return;

        const intervalId = setInterval(async () => {
            for (const task of runningTasks) {
                // Skip tasks that haven't received a real backend ID yet
                if (task.id.startsWith('pending_')) continue;

                try {
                    const statusData = await pollTaskStatus(task.id);

                    if (statusData.status === 'COMPLETED' && statusData.resultUrl) {
                        // Success!
                        const completedAt = Date.now();
                        const duration = task.startedAt ? Math.floor((completedAt - task.startedAt) / 1000) : 0;
                        setTasks(prev => prev.map(t =>
                            t.id === task.id ? { 
                                ...t, 
                                status: 'completed', 
                                imageUrl: statusData.resultUrl, 
                                images: [statusData.resultUrl!],
                                completedAt,
                                duration
                            } : t
                        ));

                        // Add to gallery
                        addUserImage({
                            id: 'img_' + Date.now(),
                            url: statusData.resultUrl,
                            images: [statusData.resultUrl],
                            prompt: task.prompt,
                            width: task.width,
                            height: task.height,
                            createdAt: Date.now(),
                            isPublic: false,
                            userId: user?.id || 'anon',
                            model: task.modelName,
                            modelId: task.modelId,
                            duration: duration
                        });
                    } else if (statusData.status === 'FAILED') {
                        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'failed', error: statusData.error } : t));
                    }
                    // If PENDING/PROCESSING, do nothing, just wait for next poll
                } catch (e) {
                    console.error("Polling error", e);
                }
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(intervalId);
    }, [tasks, addUserImage, user]);

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

    const [pendingFormState, setPendingFormState] = useState<any>(null);

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

    const handleInputChange = (key: string, value: any) => setFormState(prev => ({ ...prev, [key]: value }));

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && activeUploadKey.current) {
            const reader = new FileReader();
            reader.onloadend = () => handleInputChange(activeUploadKey.current!, reader.result as string);
            reader.readAsDataURL(file);
        }
    };

    const triggerUpload = (key: string) => {
        activeUploadKey.current = key;
        if (fileInputRef.current) { fileInputRef.current.value = ''; fileInputRef.current.click(); }
    };

    const handleRecreate = (e: React.MouseEvent | null, img: GeneratedImage) => {
        if (e) e.stopPropagation();

        // 1. Restore Prompt
        setPromptForGeneration(img.prompt);

        // 2. Find Model - try modelId first, then model name, fallback to current
        let targetModel = availableModels.find(m => m.id === img.modelId) ||
                         availableModels.find(m => m.name === img.model) ||
                         availableModels.find(m => m.id === img.model);

        if (!targetModel && availableModels.length > 0) {
            // Fallback to first available model if original not found
            targetModel = availableModels[0];
            console.warn(`Original model "${img.model}" not found, using fallback: ${targetModel.name}`);
        }

        if (targetModel) {
            setSelectedModelId(targetModel.id);

            // 3. Prepare Form State for callback in useEffect
            if (img.params?.input_values) {
                setPendingFormState(img.params.input_values);
            }

            // 4. Restore Global Settings
            if (img.params?.aspect_ratio) {
                setAspectRatio(img.params.aspect_ratio);
            }
            if (img.params?.quality) {
                setQuality(img.params.quality);
            }

            // 5. Restore resolution from width/height if params not available
            if (!img.params?.aspect_ratio && img.width && img.height) {
                const ratio = img.width / img.height;
                if (ratio > 1.7) setAspectRatio('16:9');
                else if (ratio > 1.4) setAspectRatio('3:2');
                else if (ratio > 1.1) setAspectRatio('4:3');
                else if (ratio > 0.9) setAspectRatio('1:1');
                else if (ratio > 0.7) setAspectRatio('3:4');
                else if (ratio > 0.55) setAspectRatio('2:3');
                else setAspectRatio('9:16');
            }
        }

        topRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const currentModel = availableModels.find(m => m.id === selectedModelId) || availableModels[0];
    if (!currentModel) return <div className="p-8 text-center text-carbon-muted">Loading models...</div>;

    const visibleInputs = currentModel.schema?.inputs.filter(i => i.type !== 'hidden') || [];
    const imageInputs = visibleInputs.filter(i => i.type === 'image');
    const mainPromptInput = visibleInputs.find(i => i.type === 'textarea' && (i.label === 'Prompt' || i.label === 'Text Input'));
    const negativePromptInput = visibleInputs.find(i => i.label === 'Negative Prompt');
    const otherInputs = visibleInputs.filter(i => i !== mainPromptInput && i !== negativePromptInput && i.type !== 'image');

    const handleGenerate = async () => {
        if (!user) { alert("Please log in."); return; }
        const promptVal = generationPrompt.trim();
        if (!promptVal && mainPromptInput) return;

        if (imageInputs.length > 0) {
            const missing = imageInputs.some(i => !formState[i.key]);
            if (missing) { setErrorMsg("Please upload all required reference images."); return; }
        }

        setErrorMsg(null);

        const dimensions = RESOLUTION_MAP[aspectRatio]?.[quality] || { w: 1024, h: 1024 };
        const finalFormState = { ...formState };
        if (mainPromptInput) finalFormState[mainPromptInput.key] = promptVal;

        // 1. 立即创建待处理任务并添加到 state，让加载动画立即显示
        const pendingTaskId = 'pending_' + Date.now();
        const now = Date.now();
        const pendingTask: GenerationTask = {
            id: pendingTaskId,
            status: 'queued',
            prompt: promptVal,
            modelName: currentModel.name,
            modelId: currentModel.id,
            createdAt: now,
            startedAt: now, // Start timing immediately
            width: dimensions.w,
            height: dimensions.h
        };
        setTasks(prev => [pendingTask, ...prev]);
        setActiveTaskId(pendingTaskId);

        try {
            // 2. Submit Task to Backend
            const submitResponse = await submitGenerationTask({
                model: currentModel,
                formState: finalFormState,
                globalWidth: dimensions.w,
                globalHeight: dimensions.h,
                globalAspectRatio: aspectRatio,
                globalQuality: quality,
                globalApiKey: globalApiKey
            });

            const { taskId: backendTaskId, imageUrl, status } = submitResponse;

            // 3. 用真实的 task ID 更新任务
            setTasks(prev => prev.map(t =>
                t.id === pendingTaskId
                    ? { 
                        ...t, 
                        id: backendTaskId,
                        status: status === 'COMPLETED' ? 'completed' : t.status,
                        imageUrl: imageUrl || t.imageUrl,
                        images: imageUrl ? [imageUrl] : t.images
                    }
                    : t
            ));
            setActiveTaskId(backendTaskId);

            // 4. 如果已经生成完成，立即添加到画廊
            if (status === 'COMPLETED' && imageUrl) {
                const completedAt = Date.now();
                const duration = Math.floor((completedAt - pendingTask.startedAt!) / 1000);
                
                // Update task with completion time
                setTasks(prev => prev.map(t =>
                    t.id === backendTaskId
                        ? { ...t, completedAt, duration }
                        : t
                ));
                
                addUserImage({
                    id: 'img_' + Date.now(),
                    url: imageUrl,
                    images: [imageUrl],
                    prompt: promptVal,
                    width: dimensions.w,
                    height: dimensions.h,
                    createdAt: Date.now(),
                    isPublic: false,
                    userId: user?.id || 'anon',
                    model: currentModel.name,
                    modelId: currentModel.id,
                    params: {
                        aspect_ratio: aspectRatio,
                        quality: quality,
                        input_values: finalFormState
                    },
                    duration: duration
                });
            }

        } catch (err: any) {
            console.error(err);
            // 失败时移除待处理任务
            setTasks(prev => prev.filter(t => t.id !== pendingTaskId));
            if (activeTaskId === pendingTaskId) setActiveTaskId(null);
            setErrorMsg(err.message);
        }
    };

    // Canvas View Logic
    const activeTask = tasks.find(t => t.id === activeTaskId);
    const isLoading = activeTask?.status === 'processing' || activeTask?.status === 'queued';
    const displayedImageUrl = activeTask?.images && activeTask.images.length > 0 ? (activeBatchIndex !== null ? activeTask.images[activeBatchIndex] : activeTask.imageUrl) : activeTask?.imageUrl;
    const isBatchView = activeTask?.status === 'completed' && activeTask.images && activeTask.images.length > 1 && activeBatchIndex === null;
    const taskAspectRatio = activeTask && activeTask.height > 0 ? activeTask.width / activeTask.height : 1;

    // --- RENDER ---
    return (
        <div className="space-y-8 animate-fade-in" ref={topRef}>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />

            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4 h-[700px]">
                    <div className="carbon-card p-6 flex flex-col h-full overflow-hidden">
                        {/* Scrollable Content Area */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6">

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
                                <div className={`grid gap-2 ${imageInputs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                    {imageInputs.map((input) => (
                                        <div key={input.key} className="relative flex flex-col items-center gap-1">
                                            {!formState[input.key] ? (
                                                <div onClick={() => !isLoading && triggerUpload(input.key)} className={`w-full aspect-square border border-dashed border-carbon-border rounded-lg bg-carbon-surface/50 hover:bg-carbon-surface cursor-pointer flex flex-col items-center justify-center gap-2 group min-h-[60px] ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    <div className="p-1.5 rounded-full bg-carbon-card border border-carbon-border group-hover:border-white/20"><svg className="w-3 h-3 text-carbon-muted group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
                                                    <span className="text-[9px] text-carbon-muted">{input.label}</span>
                                                </div>
                                            ) : (
                                                <div className={`relative w-full aspect-square group rounded-lg overflow-hidden border border-carbon-border bg-black/40 ${isLoading ? 'opacity-50' : ''}`}>
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
                            <div className={`space-y-4 pt-2 border-t border-carbon-border/50 max-h-60 overflow-y-auto custom-scrollbar pr-1 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                                {otherInputs.map(input => (
                                    <div key={input.key} className="space-y-1.5">
                                        <label className="flex items-center justify-between text-[10px] font-medium text-carbon-text">
                                            <span>{input.label}</span>
                                            {input.type === 'slider' && <span className="text-carbon-muted font-mono">{formState[input.key]?.toFixed(2)}</span>}
                                        </label>
                                        {input.type === 'slider' && <input type="range" min={input.min} max={input.max} step={input.step} value={formState[input.key] ?? input.defaultValue ?? 0} onChange={(e) => handleInputChange(input.key, Number(e.target.value))} className="w-full h-1 bg-carbon-border rounded-lg appearance-none cursor-pointer accent-white" />}
                                        {input.type === 'select' && input.options && <div className="grid grid-cols-4 gap-1 p-1 bg-carbon-surface rounded border border-carbon-border">{input.options.map((opt: any) => <button key={opt} onClick={() => handleInputChange(input.key, isNaN(Number(opt)) ? opt : Number(opt))} className={`text-[10px] font-bold py-1.5 rounded transition-colors ${String(formState[input.key]) === String(opt) ? 'bg-carbon-card text-white shadow border border-white/20' : 'text-carbon-muted hover:text-white'}`}>{opt}</button>)}</div>}
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
                            <Button onClick={handleGenerate} disabled={(!generationPrompt && !mainPromptInput) || isLoading} isLoading={isLoading} className="w-full py-3">
                                {isLoading ? 'Queued' : 'Generate'}
                            </Button>
                        </div>
                        {errorMsg && <div className="p-3 bg-red-900/10 border border-red-900/20 rounded-md"><p className="text-red-400 text-xs">{errorMsg}</p></div>}
                        </div>
                        {/* End Scrollable Content */}
                    </div>
                </div>

                {/* Canvas Area */}
                <div className="lg:col-span-8 h-[700px]">
                    <div className="h-full carbon-card flex overflow-hidden relative bg-[#050505] shadow-2xl">
                        <div className="flex-1 flex flex-col relative bg-[#050505]">
                            <div className={`flex-grow flex items-center justify-center relative overflow-hidden p-4 ${isLoading ? 'bg-black' : "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiMyMjIiLz48L3N2Zz4=')]"}`}>
                                {!activeTask ? (
                                    <div className="text-center text-carbon-muted/20">
                                        <div className="text-4xl mb-2 font-light text-carbon-border">+</div>
                                        <p className="text-xs font-medium uppercase tracking-wider text-carbon-muted/40">Select or Start a Task</p>
                                    </div>
                                ) : isLoading ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black overflow-hidden">
                                        <DottedSurface className="absolute inset-0 z-0" />
                                        <div className="relative z-10 text-white/50 text-xs tracking-[0.2em] font-light text-center px-4">
                                            Processing...
                                        </div>
                                    </div>
                                ) : activeTask.status === 'failed' ? (
                                    <div className="text-center p-8 max-w-md">
                                        <div className="inline-flex p-4 rounded-full bg-red-500/10 mb-4 text-red-500"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                                        <h3 className="text-lg font-medium text-white mb-2">Generation Failed</h3>
                                        <p className="text-sm text-carbon-muted mb-4">{activeTask.error}</p>
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
                                            onDelete={(id) => {
                                                setTasks(prev => prev.filter(t => t.id !== id));
                                                if (activeTaskId === id) setActiveTaskId(null);
                                            }}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feed */}
            <section className="mt-16 pt-8 border-t border-carbon-border">
                <h2 className="text-xl font-semibold text-carbon-text mb-8">Excellent Template</h2>
                <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4 masonry-grid">
                    {publicImages.slice(0, 15).map((img: GeneratedImage) => (
                        <FeedItem
                            key={img.id}
                            img={img}
                            onClick={setSelectedFeedImage}
                            onRecreate={handleRecreate}
                        />
                    ))}
                </div>
            </section>

            <ImageZoom url={zoomUrl || ''} isOpen={!!zoomUrl} onClose={() => setZoomUrl(null)} />
            <ImageDetailModal image={selectedFeedImage} isOpen={!!selectedFeedImage} onClose={() => setSelectedFeedImage(null)} onRecreate={handleRecreate} />
        </div>
    );
};

export default Generate;
