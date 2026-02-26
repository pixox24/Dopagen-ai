import React, { useState, useEffect } from 'react';

interface ImageZoomProps {
  url: string;
  isOpen: boolean;
  onClose: () => void;
}

const ImageZoom: React.FC<ImageZoomProps> = ({ url, isOpen, onClose }) => {
  const [isOriginalSize, setIsOriginalSize] = useState(false);

  // Reset state when opening a new image
  useEffect(() => {
    if (isOpen) {
      setIsOriginalSize(false);
    }
  }, [isOpen, url]);

  if (!isOpen) return null;

  const toggleZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOriginalSize(!isOriginalSize);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in overflow-auto"
      onClick={onClose}
    >
      {/* Fixed Controls */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] flex gap-4">
         <button 
          onClick={onClose}
          className="px-5 py-2 bg-carbon-card/80 backdrop-blur border border-carbon-border rounded-full text-xs font-medium text-white hover:bg-white hover:text-black transition-colors shadow-lg"
        >
          Close Viewer
        </button>
      </div>
      
      {/* Scrollable Container Area */}
      <div 
        className={`w-full h-full flex items-center justify-center p-4 ${isOriginalSize ? 'overflow-auto cursor-zoom-out items-start' : 'cursor-zoom-in'}`}
        onClick={isOriginalSize ? toggleZoom : onClose} 
      >
        <img 
          src={url} 
          alt="Zoomed" 
          onClick={toggleZoom}
          className={`transition-all duration-300 ease-out rounded-sm shadow-2xl border border-carbon-border select-none ${
            isOriginalSize 
              ? 'max-w-none h-auto m-auto' // Original Size: No max width, centers via margin auto
              : 'max-w-[95vw] max-h-[90vh] object-contain' // Fit Screen
          }`}
          style={{
             cursor: isOriginalSize ? 'zoom-out' : 'zoom-in'
          }}
        />
      </div>

      {/* Hint Text */}
      {!isOriginalSize && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-white/50 text-[10px] uppercase tracking-widest pointer-events-none">
              Click Image to Zoom 1:1
          </div>
      )}
    </div>
  );
};

export default ImageZoom;