import React, { useState, useMemo, memo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { GeneratedImage } from '../types';
import ImageDetailModal from './ImageDetailModal';

interface ExploreFeedProps {
  title?: string;
  description?: string;
  pageSize?: number;
  showHeader?: boolean;
  className?: string;
}

const FeedItem = memo(function FeedItem({ img, onClick }: { img: GeneratedImage; onClick: (img: GeneratedImage) => void }) {
  const { username, avatarUrl } = useMemo(() => ({
    username: img.userId?.split('-')[0] || 'Anon',
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${img.userId}`
  }), [img.userId]);

  const thumbnailUrl = useMemo(() => {
    if (img.url.includes('supabase.co/storage')) {
      const separator = img.url.includes('?') ? '&' : '?';
      return `${img.url}${separator}width=400&quality=75`;
    }
    return img.url;
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

  const loadPage = useCallback(async (pageNum: number) => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const from = pageNum * pageSize;
      const to = from + pageSize - 1;

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

      if (!data || data.length < pageSize) {
        setHasMore(false);
      }

      if (data && data.length > 0) {
        const newImages: GeneratedImage[] = data.map(img => ({
          id: img.params?.local_image_id || img.id,
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
          params: img.params,
        }));

        setImages(prev => {
          const existingIds = new Set(prev.map(i => i.remoteId || i.id));
          const unique = newImages.filter(i => !existingIds.has(i.remoteId || i.id));
          return [...prev, ...unique];
        });
      }
    } catch (err) {
      console.error('Failed to load public gallery:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, pageSize]);

  useEffect(() => {
    loadPage(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadPage(nextPage);
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoading, page, loadPage]);

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
        {images.map((img: GeneratedImage) => (
          <FeedItem
            key={img.remoteId || img.id}
            img={img}
            onClick={setSelectedImage}
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
          - You've reached the end -
        </div>
      )}

      {!isLoading && images.length === 0 && !hasMore && (
        <div className="text-center py-20 text-carbon-muted">
          <p className="text-sm">No feed data available.</p>
        </div>
      )}

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
    </section>
  );
};

export default ExploreFeed;
