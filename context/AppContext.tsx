import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { GeneratedImage, GenerationTask, Model } from '../types';
import { MODELS as DEFAULT_MODELS } from '../constants';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface AppContextType {
  userImages: GeneratedImage[];
  availableModels: Model[];
  allModels: Model[];
  addUserImage: (img: GeneratedImage) => void;
  deleteUserImage: (id: string) => void;
  publishImage: (id: string) => void;
  addCustomModel: (model: Model) => void;
  updateCustomModel: (id: string, updates: Partial<Model>) => void;
  deleteCustomModel: (id: string) => void;
  toggleModelVisibility: (id: string) => void;
  setPromptForGeneration: (prompt: string) => void;
  generationPrompt: string;
  refreshImages: () => Promise<void>;
  tasks: GenerationTask[];
  setTasks: React.Dispatch<React.SetStateAction<GenerationTask[]>>;
  activeTaskId: string | null;
  setActiveTaskId: (id: string | null) => void;
  isLoadingTasks: boolean;
  deleteTask: (id: string) => void;
  dailyPublishLimit: number;
  getTodayPublishCount: () => number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const getGeneratedImageDedupKey = (img: Pick<GeneratedImage, 'id' | 'images' | 'publicUrl'>) => {
  return img.publicUrl || img.images?.[0] || img.id;
};

const loadPublicApi = async () => {
  const module = await import('../services/publicApi');
  return module.publicApi;
};

const loadLocalImageStore = async () => {
  const module = await import('../lib/localImageStore');
  return module.localImageStore;
};

type IdleCallbackHandle = number;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();

  const [userImages, setUserImages] = useState<GeneratedImage[]>([]);
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [customModels, setCustomModels] = useState<Model[]>([]);
  const [hiddenModelIds, setHiddenModelIds] = useState<string[]>([]);
  const [globalModels, setGlobalModels] = useState<Model[]>([]);
  const [tasks, setTasks] = useState<GenerationTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const pollingAttempts = useRef<Record<string, number>>({});
  const pollingInFlightRef = useRef<Set<string>>(new Set());
  const completedTaskIdsRef = useRef<Set<string>>(new Set());
  const runningTaskIdsRef = useRef<Set<string>>(new Set());
  const tasksRef = useRef<GenerationTask[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const fetchGlobalModels = useCallback(async () => {
    try {
      const publicApi = await loadPublicApi();
      const data = await publicApi.getPublicModels();

      setGlobalModels((data || []).map((model: any) => ({
        id: model.id,
        name: model.name,
        version: model.version || '1.0',
        description: model.description || '',
        isCustom: true,
        web_app_id: model.web_app_id,
        schema: model.schema,
        input_map: model.input_map,
        thumbnail: model.thumbnail_url,
        hidden: model.is_hidden,
        api_key: model.api_key,
      })));
    } catch {
      // Silently fall back to bundled models when public model loading fails.
    }
  }, []);

  const fetchUserImages = useCallback(async () => {
    try {
      const localImageStore = await loadLocalImageStore();
      const dbImages = await localImageStore.getAllImages();

      setUserImages(dbImages.map((img) => ({
        id: img.id,
        url: img.url,
        images: [img.url],
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
    } catch (error) {
      console.error('Failed to fetch user images from local DB:', error);
    }
  }, [user]);

  const fetchCustomModels = useCallback(async () => {
    if (!user || !session) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from('custom_models')
        .select('id,name,version,description,web_app_id,schema,input_map,thumbnail_url,is_hidden,api_key,created_at')
        .eq('user_id', user.id);

      if (error || !data) {
        return;
      }

      const sortedData = [...data].sort((left, right) => {
        const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
        const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
        return rightTime - leftTime;
      });

      setCustomModels(sortedData.map((model) => ({
        id: model.id,
        name: model.name,
        version: model.version || '1.0',
        description: model.description || '',
        isCustom: true,
        web_app_id: model.web_app_id,
        schema: model.schema,
        input_map: model.input_map,
        thumbnail: model.thumbnail_url,
        hidden: model.is_hidden,
        api_key: model.api_key,
      })));
      setHiddenModelIds(data.filter((model) => model.is_hidden).map((model) => model.id));
    } catch (error) {
      console.error('Failed to fetch custom models:', error);
    }
  }, [session, user]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: IdleCallbackHandle | undefined;

    const hydrateLocalImages = async () => {
      try {
        const localImageStore = await loadLocalImageStore();
        await localImageStore.cleanupOldDrafts();

        if (!cancelled) {
          await fetchUserImages();
        }
      } catch (error) {
        console.error('Failed to hydrate local images:', error);
      }
    };

    const scheduleLocalImageHydration = () => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => {
          void hydrateLocalImages();
        }, { timeout: 1500 });
        return;
      }

      timeoutId = setTimeout(() => {
        void hydrateLocalImages();
      }, 300);
    };

    const loadData = async () => {
      if (!user || !session) {
        await fetchGlobalModels();

        if (!cancelled) {
          setUserImages([]);
          setCustomModels([]);
          setHiddenModelIds([]);
        }
        return;
      }

      await Promise.all([
        fetchCustomModels(),
        fetchGlobalModels(),
      ]);

      if (!cancelled) {
        scheduleLocalImageHydration();
      }
    };

    void loadData();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (idleId !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [fetchCustomModels, fetchGlobalModels, fetchUserImages, session, user]);

  useEffect(() => {
    const currentRunning = tasks
      .filter((task) => (task.status === 'processing' || task.status === 'queued') && !task.id.startsWith('pending_'))
      .map((task) => task.id);

    const currentSet = new Set(currentRunning);
    const hasChanged = currentRunning.length !== runningTaskIdsRef.current.size ||
      currentRunning.some((taskId) => !runningTaskIdsRef.current.has(taskId));

    if (!hasChanged) {
      return;
    }

    runningTaskIdsRef.current = currentSet;
    if (currentRunning.length === 0) {
      return;
    }

    const intervalId = setInterval(async () => {
      const idsToPoll = Array.from(runningTaskIdsRef.current);

      for (const taskId of idsToPoll) {
        if (pollingInFlightRef.current.has(taskId) || completedTaskIdsRef.current.has(taskId)) {
          continue;
        }

        const currentTask = tasksRef.current.find((task) => task.id === taskId);
        if (!currentTask) {
          runningTaskIdsRef.current.delete(taskId);
          delete pollingAttempts.current[taskId];
          continue;
        }

        if (currentTask.status !== 'processing' && currentTask.status !== 'queued') {
          runningTaskIdsRef.current.delete(taskId);
          delete pollingAttempts.current[taskId];
          continue;
        }

        if (!currentTask.requestId) {
          continue;
        }

        pollingInFlightRef.current.add(taskId);
        pollingAttempts.current[taskId] = (pollingAttempts.current[taskId] || 0) + 1;

        try {
          const { pollTaskStatus } = await import('../services/api');
          const statusData = await pollTaskStatus(
            currentTask.requestId,
            {
              modelId: currentTask.modelId,
              prompt: currentTask.prompt,
              params: currentTask.params,
              userId: user?.id || null,
            },
            currentTask.id
          );

          if (statusData.status === 'COMPLETED' && statusData.resultUrl) {
            completedTaskIdsRef.current.add(taskId);
            runningTaskIdsRef.current.delete(taskId);

            const completedAt = Date.now();
            const imageUrl = statusData.resultUrl;
            const images = statusData.images?.length ? statusData.images : [imageUrl];

            setTasks((prev) => {
              const task = prev.find((item) => item.id === taskId);
              if (!task) {
                return prev;
              }

              const duration = task.startedAt ? Math.floor((completedAt - task.startedAt) / 1000) : 0;

              return prev.map((item) => item.id === taskId ? {
                ...item,
                status: 'completed',
                imageUrl,
                images,
                completedAt,
                duration,
              } : item);
            });
            delete pollingAttempts.current[taskId];

            const duration = currentTask.startedAt ? Math.floor((completedAt - currentTask.startedAt) / 1000) : 0;

            void persistGeneratedImage({
              taskId,
              imageUrl,
              images,
              prompt: currentTask.prompt,
              modelName: currentTask.modelName,
              modelId: currentTask.modelId,
              width: currentTask.width,
              height: currentTask.height,
              params: currentTask.params,
              duration,
            }).catch((error) => console.error('Failed to save generated image to IndexedDB', error));
          } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
            runningTaskIdsRef.current.delete(taskId);
            setTasks((prev) => prev.map((task) => task.id === taskId ? {
              ...task,
              status: 'failed',
              error: statusData.error,
            } : task));
            delete pollingAttempts.current[taskId];
          } else if (pollingAttempts.current[taskId] > 40) {
            runningTaskIdsRef.current.delete(taskId);
            setTasks((prev) => prev.map((task) => task.id === taskId ? {
              ...task,
              status: 'failed',
              error: 'Generation timeout',
            } : task));
            delete pollingAttempts.current[taskId];
          }
        } catch (error) {
          console.error(`Polling error for ${taskId}`, error);
        } finally {
          pollingInFlightRef.current.delete(taskId);
        }
      }
    }, 4000);

    return () => clearInterval(intervalId);
  }, [tasks, user]);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
    setActiveTaskId((prev) => prev === id ? null : prev);
    delete pollingAttempts.current[id];
    runningTaskIdsRef.current.delete(id);
    pollingInFlightRef.current.delete(id);
    completedTaskIdsRef.current.delete(id);
  }, []);

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId), [activeTaskId, tasks]);
  const isLoadingTasks = useMemo(() => {
    return activeTask?.status === 'processing' || activeTask?.status === 'queued';
  }, [activeTask]);

  const refreshImages = async () => {
    await fetchUserImages();
  };

  const addUserImage = useCallback((img: GeneratedImage) => {
    setUserImages((prev) => {
      const incomingKey = getGeneratedImageDedupKey(img);
      const existingIndex = prev.findIndex((existing) =>
        existing.id === img.id || getGeneratedImageDedupKey(existing) === incomingKey
      );

      if (existingIndex === -1) {
        return [img, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = { ...next[existingIndex], ...img };

      if (existingIndex === 0) {
        return next;
      }

      const [existingImage] = next.splice(existingIndex, 1);
      return [existingImage, ...next];
    });
  }, []);

  const persistGeneratedImage = useCallback(async ({
    taskId,
    imageUrl,
    images,
    prompt,
    modelName,
    modelId,
    width,
    height,
    params,
    duration,
  }: {
    taskId: string;
    imageUrl: string;
    images?: string[];
    prompt: string;
    modelName: string;
    modelId?: string;
    width: number;
    height: number;
    params?: GenerationTask['params'];
    duration?: number;
  }) => {
    const localImageStore = await loadLocalImageStore();
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const createdAt = Date.now();

    const localImg = await localImageStore.saveImage({
      id: `img_${taskId}`,
      blob,
      prompt,
      model: modelName,
      modelId,
      width,
      height,
      createdAt,
      params: params || {},
    });

    addUserImage({
      id: localImg.id,
      url: localImg.url,
      images: images?.length ? images : [imageUrl],
      prompt: localImg.prompt,
      width: localImg.width,
      height: localImg.height,
      createdAt: localImg.createdAt,
      isPublic: false,
      userId: user?.id || 'anon',
      model: localImg.model,
      modelId: localImg.modelId,
      params,
      duration,
    });
  }, [addUserImage, user]);

  const deleteUserImage = async (id: string) => {
    const image = userImages.find((item) => item.id === id);
    if (!image) {
      return;
    }

    const previousUserImages = userImages;
    setUserImages((prev) => prev.filter((item) => item.id !== id));

    const localImageStore = await loadLocalImageStore();
    await localImageStore.deleteImage(id).catch(console.error);

    if (session && image.isPublic) {
      let error = null;

      if (image.remoteId) {
        const result = await supabase.from('images').delete().eq('id', image.remoteId);
        error = result.error;
      } else if (user?.id && image.publicUrl) {
        const result = await supabase.from('images').delete().eq('user_id', user.id).eq('url', image.publicUrl);
        error = result.error;
      }

      if (error) {
        console.error('Failed to delete image from Supabase:', error);
        setUserImages(previousUserImages);
      }
    }
  };

  const DAILY_PUBLISH_LIMIT = 50;

  const getTodayPublishCount = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    return userImages.filter((image) => image.isPublic && image.createdAt >= todayStart).length;
  }, [userImages]);

  const publishImage = async (id: string) => {
    const image = userImages.find((item) => item.id === id);
    if (!image || image.isPublic || !user) {
      return;
    }

    const todayCount = getTodayPublishCount();
    if (todayCount >= DAILY_PUBLISH_LIMIT) {
      alert(`今日发布已达上限（${DAILY_PUBLISH_LIMIT}张/天），请明天再来 🎨`);
      return;
    }

    const previousUserImages = userImages;
    setUserImages((prev) => prev.map((item) => item.id === id ? { ...item, isPublic: true } : item));

    try {
      const { publishImageToGallery } = await import('../services/publishService');
      const result = await publishImageToGallery(id, user.id);

      if (!result.success) {
        console.error('Publish failed:', result.error);
        setUserImages(previousUserImages);
        alert(`发布失败: ${result.error}`);
        return;
      }

      setUserImages((prev) => prev.map((item) => item.id === id ? {
        ...item,
        isPublic: true,
        remoteId: result.remoteId || item.remoteId,
        publicUrl: result.publicUrl || item.publicUrl,
        url: result.publicUrl || item.url,
        images: result.publicUrl ? [result.publicUrl] : item.images,
      } : item));
    } catch (error) {
      console.error('Publish exception:', error);
      setUserImages(previousUserImages);
      alert('发布过程发生错误，请重试');
    }
  };

  const addCustomModel = async (model: Model) => {
    setCustomModels((prev) => [...prev, model]);

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
          api_key: model.api_key,
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to add custom model:', error);
        setCustomModels((prev) => prev.filter((item) => item.id !== model.id));
      } else if (data) {
        setCustomModels((prev) => prev.map((item) => item.id === model.id ? { ...item, id: data.id } : item));
      }
    }
  };

  const updateCustomModel = async (id: string, updates: Partial<Model>) => {
    const previousModels = customModels;
    setCustomModels((prev) => prev.map((model) => model.id === id ? { ...model, ...updates } : model));

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
    const previousModels = customModels;
    const previousHidden = hiddenModelIds;

    setCustomModels((prev) => prev.filter((model) => model.id !== id));
    setHiddenModelIds((prev) => prev.filter((hiddenId) => hiddenId !== id));

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

    setHiddenModelIds((prev) => isCurrentlyHidden ? prev.filter((hiddenId) => hiddenId !== id) : [...prev, id]);

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

  const allModels = useMemo(() => {
    const modelMap = new Map<string, Model>();

    DEFAULT_MODELS.forEach((model) => modelMap.set(model.id, model));
    globalModels.forEach((model) => modelMap.set(model.id, model));
    customModels.forEach((model) => modelMap.set(model.id, model));

    return Array.from(modelMap.values()).map((model) => ({
      ...model,
      hidden: hiddenModelIds.includes(model.id),
    }));
  }, [customModels, globalModels, hiddenModelIds]);

  const availableModels = useMemo(() => allModels.filter((model) => !model.hidden), [allModels]);

  return (
    <AppContext.Provider value={{
      userImages,
      availableModels,
      allModels,
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
      refreshImages,
      tasks,
      setTasks,
      activeTaskId,
      setActiveTaskId,
      isLoadingTasks,
      deleteTask,
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
