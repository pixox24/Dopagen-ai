import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { GeneratedImage, Model } from '../types';
import { MODELS as DEFAULT_MODELS } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_LOADING_MESSAGES = [
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

  const [globalApiKey, setGlobalApiKeyState] = useState<string>('');

  const [loadingMessages, setLoadingMessagesState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dopa_loading_messages');
      return saved ? JSON.parse(saved) : DEFAULT_LOADING_MESSAGES;
    } catch {
      return DEFAULT_LOADING_MESSAGES;
    }
  });

  // ============================================
  // 从 Supabase 加载数据
  // ============================================

  const fetchUserImages = useCallback(async () => {
    if (!user || !session) return;
    try {
      const { data, error } = await supabase
        .from('images')
        .select(`
          *,
          profiles:user_id (username, avatar_url)
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
    } catch (err) {
      console.error('Failed to fetch user images:', err);
    }
  }, [user, session]);

  const fetchPublicImages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('images')
        .select(`*, profiles:user_id (username, avatar_url)`)
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
    } catch (err) {
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
          hidden: m.is_hidden
        })));
        setHiddenModelIds(data.filter(m => m.is_hidden).map(m => m.id));
      }
    } catch (err) {
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
        fetchCustomModels()
      ]);
      setIsLoadingData(false);
    };

    if (user && session) {
      loadData();
    } else {
      // 未登录时也加载公开图片
      fetchPublicImages();
      setUserImages([]);
      setCustomModels([]);
    }
  }, [user, session, fetchUserImages, fetchPublicImages, fetchCustomModels]);

  // ============================================
  // 数据操作方法
  // ============================================

  // 保留 localStorage 用于不需要持久化到云端的设置
  useEffect(() => {
    localStorage.setItem('dopa_loading_messages', JSON.stringify(loadingMessages));
  }, [loadingMessages]);

  const setGlobalApiKey = (key: string) => {
    // Keep this only in memory; never persist secrets to localStorage.
    setGlobalApiKeyState(key);
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
    // 乐观更新
    setUserImages(prev => prev.filter(img => img.id !== id));
    setPublicImages(prev => prev.filter(img => img.id !== id));

    // 同步到 Supabase
    if (session) {
      const { error } = await supabase.from('images').delete().eq('id', id);
      if (error) {
        console.error('Failed to delete image:', error);
        // 失败时刷新以回滚
        await fetchUserImages();
      }
    }
  };

  const publishImage = async (id: string) => {
    const img = userImages.find(i => i.id === id);
    if (img && !img.isPublic) {
      // 乐观更新
      const updatedImg = { ...img, isPublic: true };
      setUserImages(prev => prev.map(i => i.id === id ? updatedImg : i));
      setPublicImages(prev => [updatedImg, ...prev]);

      // 同步到 Supabase
      if (session) {
        await supabase.from('images').update({ is_public: true }).eq('id', id);
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
          thumbnail_url: model.thumbnail
        })
        .select()
        .single();

      if (!error && data) {
        // 用服务端生成的 ID 替换本地 ID
        setCustomModels(prev => prev.map(m =>
          m.id === model.id ? { ...m, id: data.id } : m
        ));
      }
    }
  };

  const updateCustomModel = async (id: string, updates: Partial<Model>) => {
    setCustomModels(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));

    if (session) {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.schema !== undefined) dbUpdates.schema = updates.schema;
      if (updates.input_map !== undefined) dbUpdates.input_map = updates.input_map;
      if (updates.thumbnail !== undefined) dbUpdates.thumbnail_url = updates.thumbnail;
      dbUpdates.updated_at = new Date().toISOString();

      await supabase.from('custom_models').update(dbUpdates).eq('id', id);
    }
  };

  const deleteCustomModel = async (id: string) => {
    setCustomModels(prev => prev.filter(m => m.id !== id));
    setHiddenModelIds(prev => prev.filter(hid => hid !== id));

    if (session) {
      await supabase.from('custom_models').delete().eq('id', id);
    }
  };

  const toggleModelVisibility = async (id: string) => {
    const isCurrentlyHidden = hiddenModelIds.includes(id);

    setHiddenModelIds(prev =>
      isCurrentlyHidden ? prev.filter(hid => hid !== id) : [...prev, id]
    );

    if (session) {
      await supabase
        .from('custom_models')
        .update({ is_hidden: !isCurrentlyHidden })
        .eq('id', id);
    }
  };

  // ============================================
  // 计算派生状态
  // ============================================

  const allModels = useMemo(() => {
    return [...DEFAULT_MODELS, ...customModels].map(m => ({
      ...m,
      hidden: hiddenModelIds.includes(m.id)
    }));
  }, [customModels, hiddenModelIds]);

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
      refreshImages
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
