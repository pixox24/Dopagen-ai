import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { GeneratedImage, Model, GenerationTask } from '../types';
import { pollTaskStatus } from '../services/api';
import { MODELS as DEFAULT_MODELS } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface AppContextType {
  userImages: GeneratedImage[];
  publicImages: GeneratedImage[];
  availableModels: Model[];
  allModels: Model[];
  isLoadingData: boolean;
  addUserImage: (img: GeneratedImage) => void;
  deleteUserImage: (id: string) => void;
  publishImage: (id: string) => void;
  addCustomModel: (model: Model) => void;
  updateCustomModel: (id: string, updates: Partial<Model>) => void;
  deleteCustomModel: (id: string) => void;
  toggleModelVisibility: (id: string) => void;
  setPromptForGeneration: (prompt: string) => void;
  generationPrompt: string;
  globalApiKey: string;
  setGlobalApiKey: (key: string) => void;
  loadingMessages: string[];
  setLoadingMessages: (msgs: string[]) => void;
  refreshImages: () => Promise<void>;
  // 任务管理
  tasks: GenerationTask[];
  setTasks: React.Dispatch<React.SetStateAction<GenerationTask[]>>;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  isLoadingTasks: boolean;
  deleteTask: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const FALLBACK_LOADING_MESSAGES = [
  "INITIALIZING NEURAL PATHWAYS",
  "INJECTING DOPAMINE",
  "ALIGNING TENSORS",
  "SYNTHESIZING DREAMS",
  "DECODING MATRIX",
  "RENDERING REALITY"
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();

  const [userImages, setUserImages] = useState<GeneratedImage[]>([]);
  const [publicImages, setPublicImages] = useState<GeneratedImage[]>([]);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [customModels, setCustomModels] = useState<Model[]>([]);
  const [hiddenModelIds, setHiddenModelIds] = useState<string[]>([]);
  const [globalModels, setGlobalModels] = useState<Model[]>([]);

  // API Key 使用 sessionStorage 替代 localStorage，减少 XSS 窃取风险
  // sessionStorage 在标签页关闭时自动清除
  const [globalApiKey, setGlobalApiKeyState] = useState<string>(() => {
    return sessionStorage.getItem('dopa_global_api_key') || '';
  });

  const [loadingMessages, setLoadingMessagesState] = useState<string[]>(FALLBACK_LOADING_MESSAGES);

  // 任务管理状态 (全局持久)
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const pollingAttempts = React.useRef<Record<string, number>>({});

  // ============================================
  // 从后端 API + Supabase 加载数据
  // ============================================

  // 从后端公开 API 获取管理员配置的全局模型
  const fetchGlobalModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/public/models`);
      if (res.ok) {
        const data = await res.json();
        setGlobalModels((data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          version: m.version || '1.0',
          description: m.description || '',
          isCustom: true,
          web_app_id: m.web_app_id,
          schema: m.schema,
          input_map: m.input_map,
          thumbnail: m.thumbnail_url,
          hidden: m.is_hidden,
          api_key: m.api_key,
        })));
      }
    } catch {
      // 后端不可用时静默降级
    }
  }, []);

  // 从后端获取管理员配置的加载消息
  const fetchLoadingMessages = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/public/settings`);
      if (res.ok) {
        const data = await res.json();
        if (data.loadingMessages?.length) {
          setLoadingMessagesState(data.loadingMessages);
        }
      }
    } catch {
      // 后端不可用时使用默认值
    }
  }, []);

  const fetchUserImages = useCallback(async () => {
    if (!user || !session) return;
    try {
      const { data, error } = await supabase
        .from('images')
        .select(`
          *,
          profiles(username, avatar_url)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUserImages(data.map(img => ({
          id: img.id,
          url: img.url,
          prompt: img.prompt,
          width: img.width,
          height: img.height,
          createdAt: new Date(img.created_at).getTime(),
          isPublic: img.is_public,
          userId: img.user_id,
          model: img.model_name,
          params: img.params,
          user: img.profiles ? {
            username: img.profiles.username,
            avatar: img.profiles.avatar_url
          } : undefined
        })));
      }
    } catch (err: unknown) {
      console.error('Failed to fetch user images:', err);
    }
  }, [user, session]);

  const fetchPublicImages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('images')
        .select(`*, profiles(username, avatar_url)`)
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!error && data) {
        setPublicImages(data.map(img => ({
          id: img.id,
          url: img.url,
          prompt: img.prompt,
          width: img.width,
          height: img.height,
          createdAt: new Date(img.created_at).getTime(),
          isPublic: true,
          userId: img.user_id,
          model: img.model_name,
          params: img.params,
          user: img.profiles ? {
            username: img.profiles.username,
            avatar: img.profiles.avatar_url
          } : undefined
        })));
      }
    } catch (err: unknown) {
      console.error('Failed to fetch public images:', err);
    }
  }, []);

  const fetchCustomModels = useCallback(async () => {
    if (!user || !session) return;
    try {
      const { data, error } = await supabase
        .from('custom_models')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setCustomModels(data.map(m => ({
          id: m.id,
          name: m.name,
          version: m.version || '1.0',
          description: m.description || '',
          isCustom: true,
          web_app_id: m.web_app_id,
          schema: m.schema,
          input_map: m.input_map,
          thumbnail: m.thumbnail_url,
          hidden: m.is_hidden,
          api_key: m.api_key
        })));
        setHiddenModelIds(data.filter(m => m.is_hidden).map(m => m.id));
      }
    } catch (err: unknown) {
      console.error('Failed to fetch custom models:', err);
    }
  }, [user, session]);

  // 初始加载
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingData(true);
      await Promise.all([
        fetchUserImages(),
        fetchPublicImages(),
        fetchCustomModels(),
        fetchGlobalModels(),
        fetchLoadingMessages(),
      ]);
      setIsLoadingData(false);
    };

    if (user && session) {
      loadData();
    } else {
      // 未登录时也加载公开数据
      Promise.all([fetchPublicImages(), fetchGlobalModels(), fetchLoadingMessages()]);
      setUserImages([]);
      setCustomModels([]);
    }
  }, [user, session, fetchUserImages, fetchPublicImages, fetchCustomModels, fetchGlobalModels, fetchLoadingMessages]);

  /**
   * 任务轮询逻辑 - 全局运行 (性能优化版)
   */
  // 使用 ref 跟踪当前轮询的任务 ID，避免在 Effect 内部读取 tasks 导致循环触发
  const runningTaskIdsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    // 找出所有运行中且有后端 ID 的任务
    const currentRunning = tasks
      .filter(t => (t.status === 'processing' || t.status === 'queued') && !t.id.startsWith('pending_'))
      .map(t => t.id);

    const currentSet = new Set(currentRunning);

    // 如果运行中的任务集合没有变化，不重新启动定时器
    const hasChanged = currentRunning.length !== runningTaskIdsRef.current.size ||
      currentRunning.some(id => !runningTaskIdsRef.current.has(id));

    if (!hasChanged) return;

    runningTaskIdsRef.current = currentSet;
    if (currentRunning.length === 0) return;

    const intervalId = setInterval(async () => {
      // 内部通过 ref 获取最新的 ID 集合
      const idsToPoll = Array.from(runningTaskIdsRef.current);

      for (const taskId of idsToPoll) {
        pollingAttempts.current[taskId] = (pollingAttempts.current[taskId] || 0) + 1;

        try {
          const statusData = await pollTaskStatus(taskId);

          if (statusData.status === 'COMPLETED' && statusData.resultUrl) {
            const completedAt = Date.now();

            // 需要在闭包内找到原始任务以计算耗时
            setTasks(prev => {
              const task = prev.find(t => t.id === taskId);
              if (!task) return prev;

              const duration = task.startedAt ? Math.floor((completedAt - task.startedAt) / 1000) : 0;

              // 自动添加到用户图库 (异步)
              addUserImage({
                id: 'img_' + Date.now(),
                url: statusData.resultUrl || '',
                images: statusData.resultUrl ? [statusData.resultUrl] : [],
                prompt: task.prompt,
                width: task.width,
                height: task.height,
                createdAt: Date.now(),
                isPublic: false,
                userId: user?.id || 'anon',
                model: task.modelName,
                modelId: task.modelId,
                duration
              });

              return prev.map(t => t.id === taskId ? {
                ...t,
                status: 'completed',
                imageUrl: statusData.resultUrl,
                images: statusData.resultUrl ? [statusData.resultUrl] : [],
                completedAt,
                duration
              } : t);
            });

            delete pollingAttempts.current[taskId];
          } else if (statusData.status === 'FAILED') {
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed', error: statusData.error } : t));
            delete pollingAttempts.current[taskId];
          } else if (pollingAttempts.current[taskId] > 40) { // 提高超时容忍度到 120s
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'failed', error: 'Generation timeout' } : t));
            delete pollingAttempts.current[taskId];
          }
        } catch (e) {
          console.error("Polling error for " + taskId, e);
        }
      }
    }, 4000); // 稍微调低频率减少压力

    return () => clearInterval(intervalId);
  }, [tasks, user]); // 虽然依赖 tasks，但内部通过 Ref 比较集合变化来决定是否重启定时器

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setActiveTaskId(prev => prev === id ? null : prev);
    if (pollingAttempts.current[id]) delete pollingAttempts.current[id];
  }, []);

  const activeTask = useMemo(() => tasks.find(t => t.id === activeTaskId), [tasks, activeTaskId]);
  const isLoadingTasks = useMemo(() => activeTask?.status === 'processing' || activeTask?.status === 'queued', [activeTask]);

  // ============================================
  // 数据操作方法
  // ============================================

  // loading messages 现在由后端管理，不再 localStorage 持久化

  const setGlobalApiKey = (key: string) => {
    setGlobalApiKeyState(key);
    // 使用 sessionStorage 存储 API Key，比 localStorage 更安全
    // sessionStorage 仅在当前标签页可用，关闭后自动清除
    sessionStorage.setItem('dopa_global_api_key', key);
  };

  const setLoadingMessages = (msgs: string[]) => {
    setLoadingMessagesState(msgs);
  };

  const refreshImages = async () => {
    await Promise.all([fetchUserImages(), fetchPublicImages()]);
  };

  const addUserImage = (img: GeneratedImage) => {
    // 乐观更新：先添加到本地，后端已在任务完成时自动保存
    setUserImages(prev => [img, ...prev]);
  };

  const deleteUserImage = async (id: string) => {
    // 保留旧数据用于回滚
    const previousUserImages = userImages;
    const previousPublicImages = publicImages;

    // 乐观更新
    setUserImages(prev => prev.filter(img => img.id !== id));
    setPublicImages(prev => prev.filter(img => img.id !== id));

    // 同步到 Supabase
    if (session) {
      const { error } = await supabase.from('images').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete image:', error);
        // 失败时回滚到之前的状态
        setUserImages(previousUserImages);
        setPublicImages(previousPublicImages);
      }
    }
  };

  const publishImage = async (id: string) => {
    const img = userImages.find(i => i.id === id);
    if (img && !img.isPublic) {
      // 保留旧数据用于回滚
      const previousUserImages = userImages;
      const previousPublicImages = publicImages;

      // 乐观更新
      const updatedImg = { ...img, isPublic: true };
      setUserImages(prev => prev.map(i => i.id === id ? updatedImg : i));
      setPublicImages(prev => [updatedImg, ...prev]);

      // 同步到 Supabase，失败时回滚
      if (session) {
        const { error } = await supabase.from('images').update({ is_public: true }).eq('id', id);
        if (error) {
          console.error('Failed to publish image:', error);
          setUserImages(previousUserImages);
          setPublicImages(previousPublicImages);
        }
      }
    }
  };

  const addCustomModel = async (model: Model) => {
    // 乐观更新
    setCustomModels(prev => [...prev, model]);

    // 同步到 Supabase
    if (session && user) {
      const { data, error } = await supabase
        .from('custom_models')
        .insert({
          user_id: user.id,
          name: model.name,
          version: model.version,
          description: model.description,
          web_app_id: model.web_app_id,
          schema: model.schema,
          input_map: model.input_map,
          thumbnail_url: model.thumbnail,
          api_key: model.api_key
        })
        .select()
        .single();

      if (error) {
        // 失败时回滚
        console.error('Failed to add custom model:', error);
        setCustomModels(prev => prev.filter(m => m.id !== model.id));
      } else if (data) {
        // 用服务端生成的 ID 替换本地 ID
        setCustomModels(prev => prev.map(m =>
          m.id === model.id ? { ...m, id: data.id } : m
        ));
      }
    }
  };

  const updateCustomModel = async (id: string, updates: Partial<Model>) => {
    // 保留旧数据用于回滚
    const previousModels = customModels;
    setCustomModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

    if (session) {
      const dbUpdates: Record<string, string | boolean | number | null | undefined> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.schema !== undefined) dbUpdates.schema = updates.schema as unknown as string;
      if (updates.input_map !== undefined) dbUpdates.input_map = updates.input_map as unknown as string;
      if (updates.thumbnail !== undefined) dbUpdates.thumbnail_url = updates.thumbnail;
      dbUpdates.updated_at = new Date().toISOString();

      const { error } = await supabase.from('custom_models').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Failed to update custom model:', error);
        setCustomModels(previousModels);
      }
    }
  };

  const deleteCustomModel = async (id: string) => {
    // 保留旧数据用于回滚
    const previousModels = customModels;
    const previousHidden = hiddenModelIds;

    setCustomModels(prev => prev.filter(m => m.id !== id));
    setHiddenModelIds(prev => prev.filter(hid => hid !== id));

    if (session) {
      const { error } = await supabase.from('custom_models').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete custom model:', error);
        setCustomModels(previousModels);
        setHiddenModelIds(previousHidden);
      }
    }
  };

  const toggleModelVisibility = async (id: string) => {
    const isCurrentlyHidden = hiddenModelIds.includes(id);
    const previousHidden = hiddenModelIds;

    setHiddenModelIds(prev =>
      isCurrentlyHidden ? prev.filter(hid => hid !== id) : [...prev, id]
    );

    if (session) {
      const { error } = await supabase
        .from('custom_models')
        .update({ is_hidden: !isCurrentlyHidden })
        .eq('id', id);
      if (error) {
        console.error('Failed to toggle model visibility:', error);
        setHiddenModelIds(previousHidden);
      }
    }
  };

  // ============================================
  // 计算派生状态
  // ============================================

  // 合并模型：内置 + 全局（管理员上传）+ 用户自定义
  const allModels = useMemo(() => {
    const modelMap = new Map<string, Model>();

    // 1. 先放入内置模型
    DEFAULT_MODELS.forEach(m => modelMap.set(m.id, m));

    // 2. 放入全局模型（覆盖可能存在的同 ID 内置模型）
    globalModels.forEach(m => modelMap.set(m.id, m));

    // 3. 放入用户自定义模型（覆盖同 ID）
    customModels.forEach(m => modelMap.set(m.id, m));

    return Array.from(modelMap.values()).map(m => ({
      ...m,
      hidden: hiddenModelIds.includes(m.id)
    }));
  }, [globalModels, customModels, hiddenModelIds]);

  const availableModels = useMemo(() => {
    return allModels.filter(m => !m.hidden);
  }, [allModels]);

  return (
    <AppContext.Provider value={{
      userImages,
      publicImages,
      availableModels,
      allModels,
      isLoadingData,
      addUserImage,
      deleteUserImage,
      publishImage,
      addCustomModel,
      updateCustomModel,
      deleteCustomModel,
      toggleModelVisibility,
      setPromptForGeneration: setGenerationPrompt,
      generationPrompt,
      globalApiKey,
      setGlobalApiKey,
      loadingMessages,
      setLoadingMessages,
      refreshImages,
      tasks,
      setTasks,
      activeTaskId,
      setActiveTaskId,
      isLoadingTasks,
      deleteTask
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
