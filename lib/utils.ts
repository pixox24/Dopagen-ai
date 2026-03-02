import { type ClassValue, clsx } from "clsx";

// 简化版 cn：项目未使用 Tailwind CSS 配置，不需要 twMerge
// 保留 clsx 用于条件类名合并
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}