import React, { Suspense, useState, useMemo, memo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { GeneratedImage } from '../types';
import AvatarBadge from './AvatarBadge';

const ImageDetailModal = React.lazy(() => import('./ImageDetailModal'));

interface ExploreFeedProps {
  title?: string;
  description?: string;
  pageSize?: number;
  showHeader?: boolean;
  className?: string;
}

interface PublicFeedRow {
  id: string;
  url: string;
  prompt: string;
  width: number;
  height: number;
  created_at: string;
  user_id: string;
  model_name: string;
}

interface FeedCacheEntry {
  images: GeneratedImage[];
  hasMore: boolean;
  page: number;
  cachedAt: number;
}

const FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const FEED_CACHE_KEY_PREFIX = 'dopagen:public-feed:v1';
const PUBLIC_FEED_SELECT =
  'id,url,prompt,width,height,created_at,user_id,model_name';
const FEED_THUMBNAIL_WIDTHS = [240, 360, 520, 720];
const FEED_IMAGE_SIZES =
  '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 25vw, 20vw';

const feedMemoryCache = new Map<string, FeedCacheEntry>();

const getFeedCacheKey = (pageSize: number) => `${FEED_CACHE_KEY_PREFIX}:${pageSize}`;

const isFeedCacheFresh = (cache: FeedCacheEntry) => {
  return Date.now() - cache.cachedAt < FEED_CACHE_TTL_MS;
};

const mapFeedRows = (rows: PublicFeedRow[]): GeneratedImage[] => {
  return rows.map((img) => ({
    id: img.id,
    remoteId: img.id,
    publicUrl: img.url,
    url: img.url,
    prompt: img.prompt,
    width: img.width,
    height: img.height,
    createdAt: new Date(img.created_at).getTime(),
    isPublic: true,
    userId: img.user_id,
    model: img.model_name,
  }));
};

const mergeUniqueImages = (existing: GeneratedImage[], incoming: GeneratedImage[]) => {
  if (existing.length === 0) {
    return incoming;
  }

  const existingIds = new Set(existing.map((img) => img.remoteId || img.id));
  const uniqueIncoming = incoming.filter((img) => !existingIds.has(img.remoteId || img.id));

  if (uniqueIncoming.length === 0) {
    return existing;
  }

  return [...existing, ...uniqueIncoming];
};

const readFeedCache = (cacheKey: string): FeedCacheEntry | null => {
  const memoryCache = feedMemoryCache.get(cacheKey);
  if (memoryCache) {
    return memoryCache;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<FeedCacheEntry>;
    if (!Array.isArray(parsed.images)) {
      return null;
    }

    const cache: FeedCacheEntry = {
      images: parsed.images as GeneratedImage[],
      hasMore: typeof parsed.hasMore === 'boolean' ? parsed.hasMore : true,
      page: typeof parsed.page === 'number' ? parsed.page : 0,
      cachedAt: typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0,
    };

    feedMemoryCache.set(cacheKey, cache);
    return cache;
  } catch (error) {
    window.sessionStorage.removeItem(cacheKey);
    console.warn('[ExploreFeed] Failed to restore cached feed data.', error);
    return null;
  }
};

const writeFeedCache = (cacheKey: string, cache: FeedCacheEntry) => {
  feedMemoryCache.set(cacheKey, cache);

  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify(cache));
  } catch (error) {
    console.warn('[ExploreFeed] Failed to persist cached feed data.', error);
  }
};

const fetchPublicFeedPage = async (pageSize: number, pageNum: number) => {
  const from = pageNum * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await supabase
    .from('images')
    .select(PUBLIC_FEED_SELECT)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const rows = (data || []) as PublicFeedRow[];
  return {
    images: mapFeedRows(rows),
    hasMore: rows.length === pageSize,
  };
};

export const warmPublicFeedCache = async (pageSize = 12) => {
  const cacheKey = getFeedCacheKey(pageSize);
  const cachedFeed = readFeedCache(cacheKey);

  if (cachedFeed && isFeedCacheFresh(cachedFeed)) {
    return cachedFeed;
  }

  const firstPage = await fetchPublicFeedPage(pageSize, 0);
  const cache: FeedCacheEntry = {
    images: firstPage.images,
    hasMore: firstPage.hasMore,
    page: 0,
    cachedAt: Date.now(),
  };

  writeFeedCache(cacheKey, cache);
  return cache;
};

const buildThumbnailSource = (url: string) => {
  if (!url.includes('supabase.co/storage')) {
    return {
      src: url,
      srcSet: undefined as string | undefined,
      sizes: undefined as string | undefined,
    };
  }

  const separator = url.includes('?') ? '&' : '?';
  const buildVariant = (width: number) => {
    return `${url}${separator}width=${width}&quality=${width >= 520 ? 72 : 60}`;
  };

  return {
    src: buildVariant(360),
    srcSet: FEED_THUMBNAIL_WIDTHS.map((width) => `${buildVariant(width)} ${width}w`).join(', '),
    sizes: FEED_IMAGE_SIZES,
  };
};

const FeedItem = memo(function FeedItem({
  img,
  onClick,
  priority
}: {
  img: GeneratedImage;
  onClick: (img: GeneratedImage) => void;
  priority?: boolean;
}) {
  const username = useMemo(() => {
    return img.user?.username || img.userId?.split('-')[0] || 'Anon';
  }, [img.user?.username, img.userId]);

  const thumbnail = useMemo(() => {
    return buildThumbnailSource(img.url);
  }, [img.url]);

  return (
    <div
      className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-pointer bg-carbon-card content-visibility-item"
      onClick={() => onClick(img)}
      style={{ aspectRatio: `${img.width} / ${img.height}` }}
    >
      <img
        src={thumbnail.src}
        srcSet={thumbnail.srcSet}
        sizes={thumbnail.sizes}
        alt={img.prompt}
        className="h-full w-full object-cover block transition-transform duration-700 group-hover:scale-105"
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'low'}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
        <div className="flex items-center justify-between translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
          <div className="flex items-center gap-2">
            <AvatarBadge
              name={username}
              seed={img.userId}
              src={img.user?.avatar}
              className="h-6 w-6 border border-white/20 bg-black/50"
              textClassName="text-[9px]"
            />
            <span className="text-white text-xs font-medium shadow-black drop-shadow-md">{username}</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick(img);
            }}
            className="bg-white text-black text-[10px] font-bold px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors shadow-lg"
          >
            Recreate
          </button>
        </div>
      </div>
    </div>
  );
});

const ExploreFeed: React.FC<ExploreFeedProps> = ({
  title = 'Global Feed',
  description = 'Curated generations from the community',
  pageSize = 12,
  showHeader = true,
  className = ''
}) => {
  const { setPromptForGeneration } = useApp();
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const cacheKey = useMemo(() => getFeedCacheKey(pageSize), [pageSize]);

  const loadPage = useCallback(async (pageNum: number, options?: { replace?: boolean }) => {
    if (isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const { images: mappedImages, hasMore: nextHasMore } = await fetchPublicFeedPage(pageSize, pageNum);

      setImages((prev) => {
        const nextImages = options?.replace ? mappedImages : mergeUniqueImages(prev, mappedImages);

        writeFeedCache(cacheKey, {
          images: nextImages,
          hasMore: nextHasMore,
          page: pageNum,
          cachedAt: Date.now(),
        });

        return nextImages;
      });

      setHasMore(nextHasMore);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load public gallery:', err);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [cacheKey, pageSize]);

  useEffect(() => {
    const cachedFeed = readFeedCache(cacheKey);

    if (cachedFeed) {
      setImages(cachedFeed.images);
      setHasMore(cachedFeed.hasMore);
      setPage(cachedFeed.page);

      if (isFeedCacheFresh(cachedFeed)) {
        return;
      }
    }

    void loadPage(0, { replace: true });
  }, [cacheKey, loadPage]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          void loadPage(page + 1);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, page, loadPage]);

  return (
    <section className={className}>
      {showHeader && (
        <div className="mb-8 border-b border-carbon-border pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
            {title}
          </h1>
          <p className="text-sm text-carbon-muted">
            {description}
          </p>
        </div>
      )}

      <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4 masonry-grid">
        {images.map((img: GeneratedImage, index) => (
          <FeedItem
            key={img.remoteId || img.id}
            img={img}
            onClick={setSelectedImage}
            priority={index < 6}
          />
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="flex items-center gap-3 text-carbon-muted">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span className="text-sm">Loading more...</span>
          </div>
        </div>
      )}

      {hasMore && !isLoading && (
        <div ref={sentinelRef} className="h-1" />
      )}

      {!hasMore && images.length > 0 && (
        <div className="text-center py-8 text-carbon-muted text-xs">
          - You&apos;ve reached the end -
        </div>
      )}

      {!isLoading && images.length === 0 && !hasMore && (
        <div className="text-center py-20 text-carbon-muted">
          <p className="text-sm">No feed data available.</p>
        </div>
      )}

      {selectedImage && (
        <Suspense fallback={null}>
          <ImageDetailModal
            image={selectedImage}
            isOpen={!!selectedImage}
            onClose={() => setSelectedImage(null)}
            onRecreate={(e, img) => {
              if (e) e.stopPropagation();
              setPromptForGeneration(img.prompt);
              setSelectedImage(null);
              navigate('/');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </Suspense>
      )}
    </section>
  );
};

export default ExploreFeed;
