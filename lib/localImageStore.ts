import localforage from 'localforage';

export interface LocalImage {
    id: string;
    blob: Blob;
    url: string; // Object URL for rendering
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
            url: URL.createObjectURL(newImage.blob)
        };
    },

    /**
     * Get all images, sorted by createdAt descending
     */
    async getAllImages(): Promise<LocalImage[]> {
        const images: LocalImage[] = [];
        await store.iterate((value: LocalImage) => {
            if (value.blob) {
                value.url = URL.createObjectURL(value.blob);
            }
            images.push(value);
        });
        return images.sort((a, b) => b.createdAt - a.createdAt);
    },

    /**
     * Get a single image by ID
     */
    async getImageById(id: string): Promise<LocalImage | null> {
        const image = await store.getItem<LocalImage>(id);
        if (image && image.blob) {
            image.url = URL.createObjectURL(image.blob);
        }
        return image;
    },

    /**
     * Mark an image as published
     */
    async markAsPublished(id: string): Promise<void> {
        const image = await store.getItem<LocalImage>(id);
        if (image) {
            image.status = 'published';
            await store.setItem(id, image);
        }
    },

    /**
     * Delete an image
     */
    async deleteImage(id: string): Promise<void> {
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
                await store.removeItem(key);
            }

            if (keysToDelete.length > 0) {
                console.log(`[LocalImageStore] Cleaned up ${keysToDelete.length} old draft images.`);
            }
        } catch (err) {
            console.error('[LocalImageStore] Failed to cleanup old drafts:', err);
        }
    }
};
