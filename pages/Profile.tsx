import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import Button from '../components/Button';
import ImageZoom from '../components/ImageZoom';
import { useNavigate } from 'react-router-dom';
import { GeneratedImage } from '../types';
import { downloadImageToLocal } from '../lib/download';

const Profile: React.FC = () => {
  const { user, logout } = useAuth();
  const { userImages, deleteUserImage, publishImage } = useApp();
  const navigate = useNavigate();
  
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="w-12 h-12 rounded bg-carbon-card border border-carbon-border flex items-center justify-center mb-6">
           <svg className="w-6 h-6 text-carbon-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        </div>
        <h2 className="text-lg font-medium mb-4 text-white">Authentication Required</h2>
        <Button onClick={() => navigate('/login')} variant="primary" size="sm">Log In</Button>
      </div>
    );
  }

  // --- Helpers ---
  
  const toggleSelection = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const selectAll = () => {
      if (selectedIds.size === userImages.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(userImages.map(img => img.id)));
      }
  };

  const handleDownloadSingle = async (img: GeneratedImage) => {
      try {
        await downloadImageToLocal(img.url, `dopa-${img.id}.png`);
      } catch (error) {
        console.error('Download failed:', error);
      }
  };

  const handleBatchDownload = async () => {
      const imagesToDownload = userImages.filter(img => selectedIds.has(img.id));
      
      // Sequential download to allow browser to handle multiple files gracefully
      for (const img of imagesToDownload) {
          handleDownloadSingle(img);
          await new Promise(r => setTimeout(r, 300)); // Small delay between downloads
      }
      setIsBatchMode(false);
      setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
      if (window.confirm(`Are you sure you want to delete ${selectedIds.size} images?`)) {
          selectedIds.forEach(id => deleteUserImage(id));
          setIsBatchMode(false);
          setSelectedIds(new Set());
      }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24 relative">
      
      {/* Profile Header Card */}
      <div className="carbon-card p-8 md:p-10">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="relative">
            <img 
              src={user.avatar} 
              alt={user.username} 
              className="w-24 h-24 rounded-full object-cover border-2 border-carbon-border bg-carbon-surface"
            />
          </div>

          <div className="flex-grow text-center md:text-left space-y-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {user.username}
              </h1>
              <p className="text-carbon-muted text-sm">
                {user.email}
              </p>
            </div>

            <div className="flex gap-6 justify-center md:justify-start mt-4">
               <div>
                  <span className="block text-xl font-bold text-white">{userImages.length}</span>
                  <span className="text-[10px] uppercase text-carbon-muted tracking-wide">Generated</span>
               </div>
               <div>
                  <span className="block text-xl font-bold text-white">{userImages.filter(i => i.isPublic).length}</span>
                  <span className="text-[10px] uppercase text-carbon-muted tracking-wide">Published</span>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Section */}
      <div>
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-carbon-border">
           <h2 className="text-lg font-semibold text-white">
             History
           </h2>
           <div className="flex gap-2">
                <Button 
                    variant={isBatchMode ? 'secondary' : 'outline'} 
                    size="sm" 
                    onClick={() => {
                        setIsBatchMode(!isBatchMode);
                        setSelectedIds(new Set());
                    }}
                    className={isBatchMode ? "border-white/20 bg-white/10 text-white" : ""}
                >
                    {isBatchMode ? 'Cancel Selection' : 'Batch Manage'}
                </Button>
           </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {userImages.map((img) => {
            const isSelected = selectedIds.has(img.id);

            return (
                <div 
                  key={img.id} 
                  className={`group relative bg-carbon-card border rounded-lg overflow-hidden transition-all duration-300 flex flex-col ${
                      isSelected ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-carbon-border hover:border-carbon-lightBorder'
                  }`}
                  onClick={() => isBatchMode && toggleSelection(img.id)}
                >
                  {/* Image Container */}
                  <div className="relative aspect-square bg-[#050505] overflow-hidden cursor-pointer">
                    <img 
                      src={img.url} 
                      alt="User Gen" 
                      className={`w-full h-full object-contain transition-transform duration-500 ${isBatchMode ? '' : 'group-hover:scale-105'}`} 
                      loading="lazy"
                      onClick={(e) => {
                          if (!isBatchMode) {
                              e.stopPropagation();
                              setZoomUrl(img.url);
                          }
                      }}
                    />
                    
                    {/* Batch Selection Overlay */}
                    {isBatchMode && (
                        <div className={`absolute inset-0 bg-black/20 flex justify-end p-2 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500' : 'bg-black/50 border-white/50'}`}>
                                {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                        </div>
                    )}
                  </div>

                  {/* Info & Actions */}
                  <div className="p-3 bg-carbon-card border-t border-carbon-border flex flex-col gap-2 mt-auto">
                     {/* Metadata Row */}
                     <div className="flex justify-between items-center text-[10px] text-carbon-muted font-mono">
                        <span>{new Date(img.createdAt).toLocaleDateString()}</span>
                        <span>{img.width}x{img.height}</span>
                     </div>
                     
                     {/* Actions Row (Bottom Right) */}
                     <div className="flex items-center justify-end gap-1 pt-1 border-t border-carbon-border/50">
                         {/* Download */}
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleDownloadSingle(img); }}
                            className="p-1.5 text-carbon-muted hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Download"
                         >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                         </button>

                         {/* Publish Toggle */}
                         <button 
                            onClick={(e) => { e.stopPropagation(); publishImage(img.id); }}
                            className={`p-1.5 rounded transition-colors ${img.isPublic ? 'text-green-400 bg-green-400/10' : 'text-carbon-muted hover:text-white hover:bg-white/10'}`}
                            title={img.isPublic ? "Public" : "Publish"}
                         >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                         </button>

                         {/* Delete */}
                         <button 
                            onClick={(e) => { e.stopPropagation(); deleteUserImage(img.id); }}
                            className="p-1.5 text-carbon-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            title="Delete"
                         >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                         </button>
                     </div>
                  </div>
                </div>
            );
          })}
        </div>

        {userImages.length === 0 && (
           <div className="text-center py-24 rounded-xl border border-dashed border-carbon-border bg-carbon-surface/30">
              <p className="text-carbon-muted text-sm mb-4">You haven't generated any images yet.</p>
              <Button variant="primary" onClick={() => navigate('/')} size="sm">Start Creating</Button>
           </div>
        )}
      </div>

      {/* Batch Action Floating Bar */}
      <div className={`fixed bottom-0 left-0 right-0 p-6 flex justify-center pointer-events-none transition-transform duration-500 ease-out z-50 ${isBatchMode && selectedIds.size > 0 ? 'translate-y-0' : 'translate-y-32'}`}>
          <div className="bg-[#111] border border-carbon-border rounded-full shadow-2xl px-6 py-3 flex items-center gap-6 pointer-events-auto min-w-[300px] justify-between">
               <div className="flex items-center gap-2">
                   <span className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">{selectedIds.size}</span>
                   <span className="text-sm font-medium text-white">Selected</span>
               </div>
               
               <div className="h-6 w-px bg-carbon-border"></div>

               <div className="flex gap-2">
                   <button 
                        onClick={handleBatchDownload}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-xs font-bold hover:bg-gray-200 transition-colors"
                   >
                       <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                       Download All
                   </button>
                   <button 
                        onClick={handleBatchDelete}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full text-xs font-bold hover:bg-red-500 hover:text-white transition-colors"
                   >
                       Delete
                   </button>
               </div>
          </div>
      </div>

      <ImageZoom 
        url={zoomUrl || ''} 
        isOpen={!!zoomUrl} 
        onClose={() => setZoomUrl(null)} 
      />
    </div>
  );
};

export default Profile;