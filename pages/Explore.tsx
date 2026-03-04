import React, { useState, useMemo, memo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { GeneratedImage } from '../types';
import ImageDetailModal from '../components/ImageDetailModal';

const PAGE_SIZE = 12; // 每次加载 12 条，极致节省流量

// Memoized FeedItem component for better performance
interface FeedItemProps {
  img: GeneratedImage;
  onClick: (img: GeneratedImage) => void;
}

const FeedItem = memo(function FeedItem({ img, onClick }: FeedItemProps) {
  const { username, avatarUrl } = useMemo(() => ({
    username: img.userId?.split('-')[0] || 'Anon',
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${img.userId}`
  }), [img.userId]);

  // 使用 Supabase Storage 图片转换 API 获取缩略图
  // 如果是 Storage 链接，拼接 ?width=400&quality=75 来最大限度地节省带宽
  const thumbnailUrl = useMemo(() => {
    if (img.url.includes('supabase.co/storage')) {
      // Supabase Storage 内置的图片转换 API
      const separator = img.url.includes('?') ? '&' : '?';
      return `${img.url}${separator}width=400&quality=75`;
    }
    return img.url; // 外部链接不做处理
  }, [img.url]);

  return (
    <div
      className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-pointer bg-carbon-card content-visibility-item"
      onClick={() => onClick(img)}
    >
      <img
        src={thumbnailUrl}
        alt={img.prompt}
        className="w-full h-auto block transition-transform duration-700 group-hover:scale-105"
        loading="lazy"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
        <div className="flex items-center justify-between translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
          <div className="flex items-center gap-2">
            <img src={avatarUrl} alt={username} className="w-6 h-6 rounded-full border border-white/20 bg-black/50" />
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

const Explore: React.FC = () => {
  const { setPromptForGeneration } = useApp();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

  // 分页状态（由 Explore 页面独立管理，不依赖 AppContext）
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // 用于 IntersectionObserver 的哨兵元素
  const sentinelRef = useRef<HTMLDivElement>(null);

  // 从 Supabase 加载指定页码的数据
  const loadPage = useCallback(async (pageNum: number) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from('images')
        .select('*')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('Failed to fetch public images:', error);
        return;
      }

      if (!data || data.length < PAGE_SIZE) {
        setHasMore(false); // 没有更多数据了
      }

      if (data && data.length > 0) {
        const newImages: GeneratedImage[] = data.map(img => ({
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
        }));

        setImages(prev => {
          // 去重（防止并发请求导致重复）
          const existingIds = new Set(prev.map(i => i.id));
          const unique = newImages.filter(i => !existingIds.has(i.id));
          return [...prev, ...unique];
        });
      }
    } catch (err) {
      console.error('Failed to load public gallery:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // 首次进入页面时加载第一页
  useEffect(() => {
    loadPage(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // IntersectionObserver 实现无限滚动
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 当哨兵元素进入视口时，加载下一页
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPage(nextPage);
        }
      },
      { rootMargin: '200px' } // 提前 200px 开始预加载
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, page, loadPage]);

  return (
    <div>
      <div className="mb-8 border-b border-carbon-border pb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-white mb-2">
          Global Feed
        </h1>
        <p className="text-sm text-carbon-muted">
          Curated generations from the community
        </p>
      </div>

      {/* Masonry Layout */}
      <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4 masonry-grid">
        {images.map((img: GeneratedImage) => (
          <FeedItem
            key={img.id}
            img={img}
            onClick={setSelectedImage}
          />
        ))}
      </div>

      {/* 加载中提示 */}
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

      {/* 无限滚动哨兵元素 */}
      {hasMore && !isLoading && (
        <div ref={sentinelRef} className="h-1" />
      )}

      {/* 没有更多数据 */}
      {!hasMore && images.length > 0 && (
        <div className="text-center py-8 text-carbon-muted text-xs">
          — You've reached the end —
        </div>
      )}

      {/* 空状态 */}
      {!isLoading && images.length === 0 && !hasMore && (
        <div className="text-center py-20 text-carbon-muted">
          <p className="text-sm">No feed data available.</p>
        </div>
      )}

      {/* Detail Modal */}
      <ImageDetailModal
        image={selectedImage}
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </div>
  );
};

export default Explore;