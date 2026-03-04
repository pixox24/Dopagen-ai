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
    error?: string;
}

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

        const compressedFile = await imageCompression(file, {
            maxSizeMB: 1,              // 严格限制 ≤1MB
            maxWidthOrHeight: targetMaxDim, // 1:1→800px，其他→1024px
            initialQuality: 0.75,      // 75% 质量，极致压缩
            useWebWorker: true,        // 使用 Web Worker 不阻塞 UI
            fileType: 'image/webp',    // 转成 WebP 格式，体积更小
        });

        console.log(`[Publish] 压缩完成: ${(compressedFile.size / 1024).toFixed(1)}KB (${((1 - compressedFile.size / file.size) * 100).toFixed(0)}% 压缩率)`);

        // ======== 第 3 步：上传到 Supabase Storage ========
        const timestamp = Date.now();
        const filePath = `${userId}/${timestamp}_${imageId}.webp`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('public-gallery')
            .upload(filePath, compressedFile, {
                contentType: 'image/webp',
                cacheControl: '31536000', // 缓存 1 年（图片内容不会变）
                upsert: false,
            });

        if (uploadError) {
            console.error('[Publish] 上传失败:', uploadError);
            return { success: false, error: `上传失败: ${uploadError.message}` };
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
                id: imageId,
                user_id: userId,
                url: publicUrl,
                prompt: localImg.prompt,
                width: localImg.width,
                height: localImg.height,
                model_name: localImg.model || 'unknown',
                is_public: true,
                params: localImg.params || {},
            });

        if (dbError) {
            // 如果数据库写入失败，尝试清理已上传的文件
            console.error('[Publish] 数据库写入失败:', dbError);
            await supabase.storage.from('public-gallery').remove([filePath]).catch(() => { });
            return { success: false, error: `数据库写入失败: ${dbError.message}` };
        }

        // ======== 第 5 步：更新本地状态 ========
        await localImageStore.markAsPublished(imageId);

        console.log(`[Publish] ✅ 图片 ${imageId} 发布成功!`);
        return { success: true, publicUrl };

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Publish] 发布过程异常:', msg);
        return { success: false, error: msg };
    }
}
