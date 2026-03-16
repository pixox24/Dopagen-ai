/**
 * 发布服务层：负责将本地 IndexedDB 中的草稿图片压缩、上传至 Supabase Storage，
 * 并将元数据写入数据库的 images 表中。
 * 
 * 这是整个"本地优先 + 按需上云"架构中唯一会产生云端存储成本的环节。
 */
import imageCompression from 'browser-image-compression';
import { supabase } from '../lib/supabase';
import { localImageStore, LocalImage } from '../lib/localImageStore';

export interface PublishResult {
    success: boolean;
    publicUrl?: string;
    remoteId?: string;
    error?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeUploadError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error);
    if (/aborted/i.test(message) || /AbortError/i.test(message)) {
        return '上传请求被浏览器或网络中断，请确认网络稳定并重新登录后重试';
    }
    return message;
};

const uploadWithRetry = async (filePath: string, file: Blob, attempts = 3) => {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        const { data, error } = await supabase.storage
            .from('public-gallery')
            .upload(filePath, file, {
                contentType: file.type || 'image/webp',
                cacheControl: '31536000',
                upsert: false,
            });

        if (!error) {
            return { data, error: null };
        }

        lastError = new Error(normalizeUploadError(error));
        console.error(`[Publish] 上传尝试 ${attempt}/${attempts} 失败:`, error);

        if (attempt < attempts) {
            await sleep(500 * attempt);
        }
    }

    return { data: null, error: lastError };
};

/**
 * 将一张本地草稿图片发布到公共画廊
 * 
 * 工作流：
 * 1. 从 IndexedDB 取得原始 Blob
 * 2. 使用 browser-image-compression 在客户端压缩到 ≤1MB
 * 3. 上传压缩后的图片到 Supabase Storage 的 public-gallery 桶
 * 4. 获取公网 URL，连同 prompt、模型参数写入 images 表
 * 5. 更新 IndexedDB 中该图片的状态为 published
 */
export async function publishImageToGallery(imageId: string, userId: string): Promise<PublishResult> {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return { success: false, error: '登录状态已失效，请重新登录后再发布' };
        }

        // ======== 第 1 步：从 IndexedDB 取出图片 ========
        const localImg = await localImageStore.getImageById(imageId);
        if (!localImg) {
            return { success: false, error: '本地找不到该图片，可能已被清理' };
        }
        if (localImg.status === 'published') {
            return { success: false, error: '该图片已经发布过了' };
        }

        // 根据宽高比动态决定目标分辨率
        const aspectRatio = localImg.width / localImg.height;
        const isSquare = Math.abs(aspectRatio - 1) < 0.05; // 容差 5% 视为 1:1
        const targetMaxDim = isSquare ? 800 : 1024;

        console.log(`[Publish] 开始压缩图片 ${imageId}，原始大小: ${(localImg.blob.size / 1024).toFixed(1)}KB，比例: ${isSquare ? '1:1' : aspectRatio.toFixed(2)}，目标: ${targetMaxDim}px`);

        // 将 Blob 转为 File 对象（browser-image-compression 需要 File 类型）
        const file = new File([localImg.blob], `${imageId}.png`, { type: localImg.blob.type || 'image/png' });

        let compressedFile: File;
        try {
            compressedFile = await imageCompression(file, {
                maxSizeMB: 1,              // 严格限制 ≤1MB
                maxWidthOrHeight: targetMaxDim, // 1:1→800px，其他→1024px
                initialQuality: 0.75,      // 75% 质量，极致压缩
                useWebWorker: true,        // 使用 Web Worker 不阻塞 UI
                fileType: 'image/webp',    // 转成 WebP 格式，体积更小
            });
        } catch (workerError) {
            console.warn('[Publish] Worker 压缩失败，回退到主线程压缩:', workerError);
            compressedFile = await imageCompression(file, {
                maxSizeMB: 1,
                maxWidthOrHeight: targetMaxDim,
                initialQuality: 0.75,
                useWebWorker: false,
                fileType: 'image/webp',
            });
        }

        console.log(`[Publish] 压缩完成: ${(compressedFile.size / 1024).toFixed(1)}KB (${((1 - compressedFile.size / file.size) * 100).toFixed(0)}% 压缩率)`);

        // ======== 第 3 步：上传到 Supabase Storage ========
        const timestamp = Date.now();
        const filePath = `${userId}/${timestamp}_${imageId}.webp`;
        const remoteImageId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `published_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const uploadBlob = new Blob([await compressedFile.arrayBuffer()], { type: 'image/webp' });
        const { data: uploadData, error: uploadError } = await uploadWithRetry(filePath, uploadBlob);

        if (uploadError) {
            console.error('[Publish] 上传失败:', uploadError);
            return { success: false, error: `上传失败: ${normalizeUploadError(uploadError)}` };
        }

        // 获取公网访问 URL
        const { data: urlData } = supabase.storage
            .from('public-gallery')
            .getPublicUrl(uploadData.path);

        const publicUrl = urlData.publicUrl;
        if (!publicUrl) {
            return { success: false, error: '无法获取图片公网 URL' };
        }

        console.log(`[Publish] 上传成功，公网 URL: ${publicUrl}`);

        // ======== 第 4 步：写入数据库元数据 ========
        const { error: dbError } = await supabase
            .from('images')
            .insert({
                id: remoteImageId,
                user_id: userId,
                url: publicUrl,
                prompt: localImg.prompt,
                width: localImg.width,
                height: localImg.height,
                model_name: localImg.model || 'unknown',
                is_public: true,
                params: {
                    ...(localImg.params || {}),
                    local_image_id: imageId
                },
            });

        if (dbError) {
            // 如果数据库写入失败，尝试清理已上传的文件
            console.error('[Publish] 数据库写入失败:', dbError);
            await supabase.storage.from('public-gallery').remove([filePath]).catch(() => { });
            return { success: false, error: `数据库写入失败: ${dbError.message}` };
        }

        // ======== 第 5 步：更新本地状态 ========
        await localImageStore.markAsPublished(imageId, {
            remoteId: remoteImageId,
            publicUrl
        });

        console.log(`[Publish] ✅ 图片 ${imageId} 发布成功!`);
        return { success: true, publicUrl, remoteId: remoteImageId };

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Publish] 发布过程异常:', msg);
        return { success: false, error: msg };
    }
}
