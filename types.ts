
// User 类型统一定义在 context/AuthContext.tsx 中，此处不再重复
// 如需引用请使用：import { User } from './context/AuthContext';

export interface GeneratedImage {
  id: string;
  url: string;        // Primary/First Image (for thumbnails)
  images?: string[];  // Array of all images if Batch > 1
  remoteId?: string;  // Cloud DB record ID
  publicUrl?: string; // Published public URL
  prompt: string;
  width: number;
  height: number;
  createdAt: number;
  isPublic: boolean;
  userId: string;
  model: string;
  modelId?: string;   // Model ID for Recreate

  // New fields for Recreate & Display
  // 生成参数的结构化类型
  params?: {
    web_app_id?: string | number;
    input_values?: Record<string, string | number | boolean>;
    aspect_ratio?: string;
    quality?: string;
    [key: string]: unknown;
  };
  duration?: number;   // Generation duration in seconds
  user?: {             // Joined user profile
    username: string;
    avatar: string;
  };
}

export type GenerationStage =
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'completed'
  | 'failed';

export type GenerationFailureCode =
  | 'timeout'
  | 'invalid_input'
  | 'quota'
  | 'provider_error'
  | 'network'
  | 'cancelled'
  | 'empty_output'
  | 'unknown';

// New Task Interface for Queue Management
export interface GenerationTask {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  prompt: string;
  modelName: string;
  modelId: string;
  imageUrl?: string;        // Primary/First Image
  images?: string[];        // All images for batch results
  error?: string;
  failureCode?: GenerationFailureCode;
  failureHint?: string;
  failureDetail?: string;
  requestId?: string;       // Added for polling BizyAir directly
  params?: any;             // Passed to backend
  createdAt: number;
  startedAt?: number;       // When generation started (processing)
  completedAt?: number;     // When generation completed
  duration?: number;        // Generation duration in seconds
  progress?: number;        // Estimated progress from provider state
  bizyStatus?: string;      // Raw provider status for diagnostics
  queueCount?: number;      // Tasks ahead if provider exposes it
  stage?: GenerationStage;  // User-facing stage derived from provider state
  width: number;
  height: number;
}

export interface BizyAirRequest {
  web_app_id: string | number;
  suppress_preview_output: boolean;
  input_values: Record<string, string | number | boolean>;
}

// --- NEW SCHEMA DEFINITIONS ---

export type SchemaInputType =
  | 'image'
  | 'textarea'
  | 'text'
  | 'slider'
  | 'select'
  | 'number'
  | 'boolean'
  | 'hidden';

export type SchemaMappingType =
  | 'width'
  | 'height'
  | 'aspect_ratio'
  | 'quality'
  | 'batch_size';

export interface SchemaInput {
  key: string;           // The API key (e.g., "17:Node.prompt")
  label: string;         // Human readable label
  type: SchemaInputType;
  defaultValue?: any;

  // Constraints
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | number[];
  required?: boolean;

  // Logic Flags
  generate?: 'random_int'; // If true, backend generates a random number
  mapping?: SchemaMappingType; // If set, binds to global UI state (width, height, etc)
}

export interface ModelSchema {
  model_id: number;      // Corresponds to web_app_id
  inputs: SchemaInput[];
}

export interface ModelParameter {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  defaultValue: any;
}

export interface ModelInputMap {
  images: string[];
  prompt: string;
  negative_prompt?: string;
  width?: string;
  height?: string;
  seed?: string;
  customParams?: ModelParameter[];
}

export interface Model {
  id: string;
  name: string;
  version: string;
  description: string;
  isCustom?: boolean;
  schema?: ModelSchema;     // The new source of truth for inputs
  hidden?: boolean;
  thumbnail?: string;
  api_key?: string;

  // Legacy/Alternative fields
  web_app_id?: number;
  input_map?: ModelInputMap;

  // Default parameters for dynamic resolution
  defaultParams?: {
    aspect_ratio?: string;
    quality?: string;
    width?: number;
    height?: number;
    input_values?: Record<string, string | number | boolean>;
  };
}

export interface GenerateOptions {
  model: Model;
  formState: Record<string, string | number | boolean | null>; 
  prompt?: string;
  taskId?: string;
  params?: any;
  globalWidth: number;
  globalHeight: number;
  globalAspectRatio: string;
  globalQuality: string;
}
