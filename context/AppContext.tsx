import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { GeneratedImage, Model, GenerationTask } from '../types';
import { pollTaskStatus } from '../services/api';
import { publicApi } from '../services/adminApi';
import { MODELS as DEFAULT_MODELS } from '../constants';
import { supabase } from '../lib/supabase';
import { localImageStore } from '../lib/localImageStore';
import { useAuth } from './AuthContext';

interface AppContextType {
  userImages: GeneratedImage[];
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
  // 发布限制
  dailyPublishLimit: number;
  getTodayPublishCount: () => number;
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

  // 从 Supabase 获取管理员配置的全局模型（user_id IS NULL）
  const fetchGlobalModels = useCallback(async () => {
    try {
      const data = await publicApi.getPublicModels();
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
    } catch {
      // Supabase 不可用时静默降级
    }
  }, []);

  // 从 Supabase 获取管理员配置的加载消息
  const fetchLoadingMessages = useCallback(async () => {
    try {
      const data = await publicApi.getPublicSettings();
      if (data.loadingMessages?.length) {
        setLoadingMessagesState(data.loadingMessages);
      }
    } catch {
      // Supabase 不可用时使用默认值
    }
  }, []);

  const fetchUserImages = useCallback(async () => {
    try {
      // 从 IndexedDB 获取图片
      const dbImages = await localImageStore.getAllImages();
      setUserImages(dbImages.map(img => ({
        id: img.id,
        url: img.url,
        images: [img.url], // 如果有 batch 的情况视需求填充
        remoteId: img.remoteId,
        publicUrl: img.publicUrl,
        prompt: img.prompt,
        width: img.width,
        height: img.height,
        createdAt: img.createdAt,
        isPublic: img.status === 'published',
        userId: user?.id || 'anon',
        model: img.model,
        modelId: img.modelId,
        params: img.params,
      })));
    } catch (err: unknown) {
      console.error('Failed to fetch user images from local DB:', err);
    }
  }, [user]);



  const fetchCustomModels = useCallback(async () => {
    if (!user || !session) return;
    try {
      const { data, error } = await supabase
        .from('custom_models')
        .select('*')
        .eq('user_id', user.id);

      if (!error && data) {
        const sortedData = [...data].sort((a, b) => {
          const left = a.created_at ? Date.parse(a.created_at) : 0;
          const right = b.created_at ? Date.parse(b.created_at) : 0;
          return right - left;
        });

        setCustomModels(sortedData.map(m => ({
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

      // 初始化时自动清理过期草稿
      await localImageStore.cleanupOldDrafts();

      await Promise.all([
        fetchUserImages(),
        fetchCustomModels(),
        fetchGlobalModels(),
        fetchLoadingMessages(),
      ]);
      setIsLoadingData(false);
    };

    if (user && session) {
      loadData();
    } else {
      // 未登录时只加载公开配置，不全量拉取图片
      Promise.all([fetchGlobalModels(), fetchLoadingMessages()]);
      setUserImages([]);
      setCustomModels([]);
    }
  }, [user, session, fetchUserImages, fetchCustomModels, fetchGlobalModels, fetchLoadingMessages]);

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
          const currentTask = tasks.find(t => t.id === taskId);
          if (!currentTask?.requestId) {
            continue;
          }

          const statusData = await pollTaskStatus(
            currentTask.requestId,
            {
              modelId: currentTask.modelId,
              prompt: currentTask.prompt,
              params: currentTask.params
            },
            currentTask.id
          );

          if (statusData.status === 'COMPLETED' && statusData.resultUrl) {
            const completedAt = Date.now();
            const imageUrl = statusData.resultUrl;
            const images = statusData.images?.length ? statusData.images : [imageUrl];

            // 获取到 URL 后先通知状态变成 Completed
            setTasks(prev => {
              const task = prev.find(t => t.id === taskId);
              if (!task) return prev;
              const duration = task.startedAt ? Math.floor((completedAt - task.startedAt) / 1000) : 0;
              return prev.map(t => t.id === taskId ? {
                ...t,
                status: 'completed',
                imageUrl,
                images,
                completedAt,
                duration
              } : t);
            });
            delete pollingAttempts.current[taskId];

            const duration = currentTask.startedAt ? Math.floor((completedAt - currentTask.startedAt) / 1000) : 0;

            // 异步下载并保存图片到 IndexedDB
            fetch(imageUrl)
              .then(res => res.blob())
              .then(blob => {
                return localImageStore.saveImage({
                  id: 'img_' + Date.now(),
                  blob,
                  prompt: currentTask.prompt,
                  model: currentTask.modelName,
                  modelId: currentTask.modelId,
                  width: currentTask.width,
                  height: currentTask.height,
                  createdAt: Date.now(),
                  params: currentTask.params || {}
                });
              })
              .then(localImg => {
                // 乐观更新到本地状态
                addUserImage({
                  id: localImg.id,
                  url: localImg.url,
                  images,
                  prompt: localImg.prompt,
                  width: localImg.width,
                  height: localImg.height,
                  createdAt: localImg.createdAt,
                  isPublic: false,
                  userId: user?.id || 'anon',
                  model: localImg.model,
                  modelId: localImg.modelId,
                  params: currentTask.params,
                  duration
                });
              })
              .catch(err => console.error("Failed to save generated image to IndexedDB", err));
          } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
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
    await fetchUserImages();
  };

  const addUserImage = (img: GeneratedImage) => {
    // 乐观更新：先添加到本地，后端已在任务完成时自动保存
    setUserImages(prev => [img, ...prev]);
  };

  const deleteUserImage = async (id: string) => {
    const img = userImages.find(i => i.id === id);
    if (!img) return;

    // 保留旧数据用于回滚
    const previousUserImages = userImages;

    // 乐观更新
    setUserImages(prev => prev.filter(img => img.id !== id));

    // 先从本地 IndexedDB 中删除
    await localImageStore.deleteImage(id).catch(console.error);

    // 如果图片已经发布，还要同步删除云端记录
    if (session && img.isPublic) {
      let error = null;

      if (img.remoteId) {
        const result = await supabase.from('images').delete().eq('id', img.remoteId);
        error = result.error;
      } else if (user?.id && img.publicUrl) {
        const result = await supabase.from('images').delete().eq('user_id', user.id).eq('url', img.publicUrl);
        error = result.error;
      }

      if (error) {
        console.error('Failed to delete image from Supabase:', error);
        // 是否回滚视需求而定，因为本地已经被删掉了，一般不推荐给用户跳回去
        setUserImages(previousUserImages);
      }
    }
  };

  // 每日发布上限
  const DAILY_PUBLISH_LIMIT = 5;

  // 计算今日已发布数量（供 UI 层使用）
  const getTodayPublishCount = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    return userImages.filter(img => img.isPublic && img.createdAt >= todayStart).length;
  }, [userImages]);

  const publishImage = async (id: string) => {
    const img = userImages.find(i => i.id === id);
    if (!img || img.isPublic) return; // 已发布的不重复
    if (!user) return;

    // 每日发布上限检查
    const todayCount = getTodayPublishCount();
    if (todayCount >= DAILY_PUBLISH_LIMIT) {
      alert(`今日发布已达上限（${DAILY_PUBLISH_LIMIT}张/天），请明天再来 🎨`);
      return;
    }

    // 保留旧数据用于回滚
    const previousUserImages = userImages;

    // 乐观更新 UI：立即标记为已发布状态
    const updatedImg = { ...img, isPublic: true };
    setUserImages(prev => prev.map(i => i.id === id ? updatedImg : i));

    try {
      // 调用发布服务：压缩 → 上传 Storage → 写入数据库 → 更新 IndexedDB
      const { publishImageToGallery } = await import('../services/publishService');
      const result = await publishImageToGallery(id, user.id);

      if (!result.success) {
        // 发布失败：回滚 UI
        console.error('发布失败:', result.error);
        setUserImages(previousUserImages);
        alert(`发布失败: ${result.error}`);
      } else {
        setUserImages(prev => prev.map(i => i.id === id ? {
          ...i,
          isPublic: true,
          remoteId: result.remoteId || i.remoteId,
          publicUrl: result.publicUrl || i.publicUrl,
          url: result.publicUrl || i.url,
          images: result.publicUrl ? [result.publicUrl] : i.images
        } : i));
      }
      // 成功时无需额外操作，乐观更新已经生效
    } catch (err) {
      console.error('发布异常:', err);
      setUserImages(previousUserImages);
      alert('发布过程发生错误，请重试');
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
      availableModels,
      allModels,
      isLoadingData,
      addUserImage,
      deleteUserImage,
      publishImage,
      dailyPublishLimit: DAILY_PUBLISH_LIMIT,
      getTodayPublishCount,
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
