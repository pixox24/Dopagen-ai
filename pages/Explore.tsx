import React, { useState, useMemo, memo } from 'react';
import { useApp } from '../context/AppContext';
import { GeneratedImage } from '../types';
import ImageDetailModal from '../components/ImageDetailModal';

// Memoized FeedItem component for better performance
interface FeedItemProps {
    img: GeneratedImage;
    onClick: (img: GeneratedImage) => void;
}

const FeedItem = memo(function FeedItem({ img, onClick }: FeedItemProps) {
    // Memoize derived values to avoid recalculation on every render
    const { username, avatarUrl } = useMemo(() => ({
        username: img.userId.split('-')[0] || 'Anon',
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${img.userId}`
    }), [img.userId]);

    return (
        <div 
            className="break-inside-avoid relative group rounded-xl overflow-hidden cursor-pointer bg-carbon-card content-visibility-item"
            onClick={() => onClick(img)}
        >
            <img 
                src={img.url} 
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
  const { publicImages, setPromptForGeneration } = useApp();
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);

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

      {/* Masonry Layout - with content-visibility optimization */}
      <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4 space-y-4 masonry-grid">
        {publicImages.map((img: GeneratedImage) => (
            <FeedItem
                key={img.id}
                img={img}
                onClick={setSelectedImage}
            />
        ))}
      </div>
      
      {publicImages.length === 0 && (
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