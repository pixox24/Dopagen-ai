import { useState, useEffect, useRef, useCallback } from 'react';
import { pollTaskStatus } from '../services/api';
import { GenerationTask, GeneratedImage } from '../types';

/**
 * 自定义 Hook：任务轮询管理
 * 从 Generate.tsx 中抽离，符合单一职责原则
 * 负责管理任务列表、轮询和自动超时
 */
interface UseTaskPollingOptions {
    // 当任务完成时的回调
    onTaskCompleted: (task: GenerationTask, resultUrl: string, duration: number) => void;
}

interface TaskPollingReturn {
    tasks: GenerationTask[];
    setTasks: React.Dispatch<React.SetStateAction<GenerationTask[]>>;
    activeTaskId: string | null;
    setActiveTaskId: (id: string | null) => void;
    activeTask: GenerationTask | undefined;
    isLoading: boolean;
    deleteTask: (id: string) => void;
}

export function useTaskPolling({ onTaskCompleted }: UseTaskPollingOptions): TaskPollingReturn {
    const [tasks, setTasks] = useState<GenerationTask[]>([]);
    const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
    // 轮询计数器用于超时检测
    const pollingAttempts = useRef<Record<string, number>>({});

    // 轮询运行中的任务
    useEffect(() => {
        const runningTasks = tasks.filter(t => t.status === 'processing' || t.status === 'queued');
        if (runningTasks.length === 0) return;

        const intervalId = setInterval(async () => {
            for (const task of runningTasks) {
                // 跳过尚未获得后端 ID 的任务
                if (task.id.startsWith('pending_')) continue;

                pollingAttempts.current[task.id] = (pollingAttempts.current[task.id] || 0) + 1;

                try {
                    const statusData = await pollTaskStatus(task.id);

                    if (statusData.status === 'COMPLETED' && statusData.resultUrl) {
                        const completedAt = Date.now();
                        const duration = task.startedAt ? Math.floor((completedAt - task.startedAt) / 1000) : 0;

                        delete pollingAttempts.current[task.id];

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

                        onTaskCompleted(task, statusData.resultUrl, duration);

                    } else if (statusData.status === 'FAILED') {
                        delete pollingAttempts.current[task.id];
                        setTasks(prev => prev.map(t =>
                            t.id === task.id ? { ...t, status: 'failed', error: statusData.error } : t
                        ));
                    } else if (pollingAttempts.current[task.id] > 30) {
                        // 超时：30 次轮询 × 3 秒 = 90 秒
                        console.warn(`Task ${task.id} timeout after 90 seconds`);
                        setTasks(prev => prev.map(t =>
                            t.id === task.id
                                ? { ...t, status: 'failed', error: 'Generation timeout - please try again' }
                                : t
                        ));
                        delete pollingAttempts.current[task.id];
                    }
                } catch (e: unknown) {
                    console.error("Polling error", e);
                }
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [tasks, onTaskCompleted]);

    const activeTask = tasks.find(t => t.id === activeTaskId);
    const isLoading = activeTask?.status === 'processing' || activeTask?.status === 'queued';

    const deleteTask = useCallback((id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        setActiveTaskId(prev => prev === id ? null : prev);
        delete pollingAttempts.current[id];
    }, []);

    return {
        tasks,
        setTasks,
        activeTaskId,
        setActiveTaskId,
        activeTask,
        isLoading,
        deleteTask
    };
}
