import { Model } from './types';

export const BIZYAIR_API_URL = 'https://api.bizyair.cn/w/v1/webapp/task/openapi/create';

// Standardized Models with explicit UI Schemas
export const MODELS: Model[] = [
  { 
    id: 'qwen-edit-2512', 
    name: 'QwenEdit 2.5', 
    version: '2.5', 
    description: 'AI Image Editing & Inpainting',
    schema: {
        model_id: 43061,
        inputs: [
            { key: "41:LoadImage.image", label: "Input Image", type: "image", required: true },
            { key: "117:Text Multiline.text", label: "Prompt", type: "textarea", required: true },
            { key: "118:Text Multiline.text", label: "Negative Prompt", type: "textarea" },
            { key: "119:PrimitiveInt.value", label: "Width", type: "hidden", mapping: "width" },
            { key: "120:PrimitiveInt.value", label: "Height", type: "hidden", mapping: "height" },
            { key: "65:KSampler.seed", label: "Seed", type: "hidden", generate: "random_int" }
        ]
    }
  }
];

export const ASPECT_RATIOS = [
  '1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'
] as const;

export const QUALITY_LEVELS = [
  { label: 'Standard (1K)', value: '1K' },
  { label: 'High (2K)', value: '2K' },
  { label: 'Ultra (4K)', value: '4K' },
] as const;

// Resolution Lookup Table
export const RESOLUTION_MAP: Record<string, Record<string, { w: number, h: number }>> = {
  '1:1': {
    '1K': { w: 1024, h: 1024 },
    '2K': { w: 2048, h: 2048 },
    '4K': { w: 4096, h: 4096 },
  },
  '3:2': {
    '1K': { w: 1024, h: 683 },
    '2K': { w: 2048, h: 1365 },
    '4K': { w: 4096, h: 2731 },
  },
  '2:3': {
    '1K': { w: 683, h: 1024 },
    '2K': { w: 1365, h: 2048 },
    '4K': { w: 2731, h: 4096 },
  },
  '3:4': {
    '1K': { w: 768, h: 1024 },
    '2K': { w: 1536, h: 2048 },
    '4K': { w: 3072, h: 4096 },
  },
  '4:3': {
    '1K': { w: 1024, h: 768 },
    '2K': { w: 2048, h: 1536 },
    '4K': { w: 4096, h: 3072 },
  },
  '4:5': {
    '1K': { w: 819, h: 1024 },
    '2K': { w: 1638, h: 2048 },
    '4K': { w: 3277, h: 4096 },
  },
  '5:4': {
    '1K': { w: 1024, h: 819 },
    '2K': { w: 2048, h: 1638 },
    '4K': { w: 4096, h: 3277 },
  },
  '9:16': {
    '1K': { w: 576, h: 1024 },
    '2K': { w: 1152, h: 2048 },
    '4K': { w: 2304, h: 4096 },
  },
  '16:9': {
    '1K': { w: 1024, h: 576 },
    '2K': { w: 2048, h: 1152 },
    '4K': { w: 4096, h: 2304 },
  },
  '21:9': {
    '1K': { w: 1024, h: 439 },
    '2K': { w: 2048, h: 878 },
    '4K': { w: 4096, h: 1755 },
  },
};

export const MOCK_PUBLIC_IMAGES = [
  {
    id: 'pub-1',
    url: 'https://picsum.photos/1024/1024?random=1',
    prompt: 'A cyberpunk cat eating neon ramen in Tokyo rain',
    width: 1024,
    height: 1024,
    createdAt: Date.now(),
    isPublic: true,
    userId: 'user-demo',
    model: 'QwenEdit 2.5'
  },
  {
    id: 'pub-2',
    url: 'https://picsum.photos/832/1216?random=2',
    prompt: 'Portrait of a space princess with bioluminescent skin',
    width: 832,
    height: 1216,
    createdAt: Date.now(),
    isPublic: true,
    userId: 'user-demo',
    model: 'QwenEdit 2.5'
  }
];
