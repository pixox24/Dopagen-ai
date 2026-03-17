import localforage from 'localforage';

export interface LocalImage {
    id: string;
    blob: Blob;
    url: string; // Object URL for rendering
    remoteId?: string;
    publicUrl?: string;
    prompt: string;
    model: string;
    modelId?: string;
    width: number;
    height: number;
    createdAt: number;
    status: 'draft' | 'published';
    params?: any;
}

// Config instance
const store = localforage.createInstance({
    name: 'DopaGenAI',
    storeName: 'images'
});

const objectUrlCache = new Map<string, string>();

const revokeCachedObjectUrl = (id: string) => {
    const objectUrl = objectUrlCache.get(id);
    if (!objectUrl) {
        return;
    }

    URL.revokeObjectURL(objectUrl);
    objectUrlCache.delete(id);
};

const resolveImageUrl = (image: Pick<LocalImage, 'id' | 'blob' | 'status' | 'publicUrl'>) => {
    if (image.status === 'published' && image.publicUrl) {
        revokeCachedObjectUrl(image.id);
        return image.publicUrl;
    }

    const cached = objectUrlCache.get(image.id);
    if (cached) {
        return cached;
    }

    const objectUrl = URL.createObjectURL(image.blob);
    objectUrlCache.set(image.id, objectUrl);
    return objectUrl;
};

export const localImageStore = {
    /**
     * Save a new image as draft
     */
    async saveImage(image: Omit<LocalImage, 'status' | 'url'>): Promise<LocalImage> {
        const newImage: LocalImage = {
            ...image,
            status: 'draft',
            url: '' // Will be populated on read
        };
        await store.setItem(newImage.id, newImage);

        // Generate URL for immediate use
        return {
            ...newImage,
            url: resolveImageUrl(newImage)
        };
    },

    /**
     * Get all images, sorted by createdAt descending
     */
    async getAllImages(): Promise<LocalImage[]> {
        const images: LocalImage[] = [];
        await store.iterate((value: LocalImage) => {
            images.push({
                ...value,
                url: value.blob ? resolveImageUrl(value) : value.url
            });
        });
        return images.sort((a, b) => b.createdAt - a.createdAt);
    },

    /**
     * Get a single image by ID
     */
    async getImageById(id: string): Promise<LocalImage | null> {
        const image = await store.getItem<LocalImage>(id);
        if (image && image.blob) {
            return {
                ...image,
                url: resolveImageUrl(image)
            };
        }
        return image;
    },

    /**
     * Mark an image as published
     */
    async markAsPublished(id: string, metadata?: { remoteId?: string; publicUrl?: string }): Promise<void> {
        const image = await store.getItem<LocalImage>(id);
        if (image) {
            image.status = 'published';
            if (metadata?.remoteId) image.remoteId = metadata.remoteId;
            if (metadata?.publicUrl) image.publicUrl = metadata.publicUrl;
            revokeCachedObjectUrl(id);
            await store.setItem(id, image);
        }
    },

    /**
     * Delete an image
     */
    async deleteImage(id: string): Promise<void> {
        revokeCachedObjectUrl(id);
        await store.removeItem(id);
    },

    /**
     * 快速检查某张图片的原始大图是否还在 IndexedDB 中
     * 仅检查 key 是否存在，不读取 Blob，开销极小
     */
    async hasOriginal(id: string): Promise<boolean> {
        try {
            const image = await store.getItem<LocalImage>(id);
            return !!(image && image.blob);
        } catch {
            return false;
        }
    },

    /**
     * Clean up draft images older than 7 days
     * Run this on app initialization
     */
    async cleanupOldDrafts(): Promise<void> {
        try {
            const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const keysToDelete: string[] = [];

            await store.iterate((value: LocalImage, key: string) => {
                if (value.status === 'draft' && (now - value.createdAt > SEVEN_DAYS_MS)) {
                    keysToDelete.push(key);
                }
            });

            for (const key of keysToDelete) {
                revokeCachedObjectUrl(key);
                await store.removeItem(key);
            }
        } catch (err) {
            console.error('[LocalImageStore] Failed to cleanup old drafts:', err);
        }
    }
};
