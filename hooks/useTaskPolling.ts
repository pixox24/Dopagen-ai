import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { GenerationTask } from '../types';

/**
 * 自定义 Hook：任务轮询管理 (适配器版)
 * 现在状态由 AppContext 全局保留，本 Hook 仅作为便捷访问接口
 * 即使页面切换，轮询逻辑依然在 AppContext 中后台运行
 */
interface UseTaskPollingOptions {
    onTaskCompleted?: (task: GenerationTask, resultUrl: string, duration: number) => void;
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

export function useTaskPolling({ onTaskCompleted }: UseTaskPollingOptions = {}): TaskPollingReturn {
    const {
        tasks,
        setTasks,
        activeTaskId,
        setActiveTaskId,
        isLoadingTasks: isLoading,
        deleteTask
    } = useApp();

    const activeTask = useMemo(() => tasks.find(t => t.id === activeTaskId), [tasks, activeTaskId]);

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
