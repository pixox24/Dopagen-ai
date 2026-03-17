import { supabase } from '../lib/supabase';

const PUBLIC_MODEL_SELECT =
  'id,name,version,description,web_app_id,schema,input_map,thumbnail_url,api_key,is_hidden,created_at';

interface PublicModelRow {
  id: string;
  name: string;
  version?: string;
  description?: string;
  web_app_id?: string | number;
  schema?: unknown;
  input_map?: unknown;
  thumbnail_url?: string;
  api_key?: string;
  is_hidden?: boolean;
  user_id?: string | null;
  created_at?: string;
}

const sortModels = <T extends { created_at?: string }>(models: T[]): T[] => {
  return [...models].sort((a, b) => {
    const left = a.created_at ? Date.parse(a.created_at) : 0;
    const right = b.created_at ? Date.parse(b.created_at) : 0;
    return right - left;
  });
};

export const publicApi = {
  getPublicModels: async (): Promise<PublicModelRow[]> => {
    const { data, error } = await supabase
      .from('custom_models')
      .select(PUBLIC_MODEL_SELECT)
      .is('user_id', null);

    if (error) {
      return [];
    }

    return sortModels((data || []).filter((model) => model.is_hidden !== true));
  },
};
