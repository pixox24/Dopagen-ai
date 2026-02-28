import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { GeneratedImage } from '../types';
import Button from './Button';
import { downloadToLocal } from '../lib/download';

interface ImageDetailModalProps {
    image: GeneratedImage | null;
    isOpen: boolean;
    onClose: () => void;
    onRecreate?: (e: React.MouseEvent | null, img: GeneratedImage) => void;
}

const ImageDetailModal: React.FC<ImageDetailModalProps> = ({ image, isOpen, onClose, onRecreate }) => {
    const { setPromptForGeneration } = useApp();
    const navigate = useNavigate();

    if (!isOpen || !image) return null;

    const handleRecreate = () => {
        if (onRecreate && image) {
            onRecreate(null, image);
            onClose();
        } else {
            setPromptForGeneration(image.prompt);
            onClose();
            navigate('/');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    const handleCopyPrompt = () => {
        navigator.clipboard.writeText(image.prompt);
    };

    const handleDownload = async () => {
        await downloadToLocal(image.url, `dopa-gen-${image.id}.jpg`);
    };

    // Use joined user data or fallback
    const username = image.user?.username || image.userId.split('-')[0] || 'Creator';
    const avatarUrl = image.user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${image.userId}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 animate-fade-in">
            {/* Close Overlay */}
            <div className="absolute inset-0" onClick={onClose}></div>

            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 z-50 p-2 bg-black/50 text-white rounded-full hover:bg-white/20 transition-colors"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="relative w-full max-w-6xl h-[90vh] bg-[#090909] border border-carbon-border rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row z-10" onClick={e => e.stopPropagation()}>

                {/* Left: Image Canvas */}
                <div className="flex-1 bg-[#050505] flex items-center justify-center p-4 md:p-8 relative overflow-hidden pattern-grid text-white">
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
                    <img
                        src={image.url}
                        alt={image.prompt}
                        className="max-w-full max-h-full object-contain shadow-2xl rounded-sm"
                    />
                </div>

                {/* Right: Details Panel */}
                <div className="w-full md:w-[400px] flex-shrink-0 bg-[#090909] border-l border-carbon-border flex flex-col h-full text-white">

                    {/* Header: User Profile */}
                    <div className="p-6 border-b border-carbon-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src={avatarUrl} alt={username} className="w-10 h-10 rounded-full border border-carbon-border bg-carbon-surface" />
                            <div>
                                <h3 className="text-sm font-semibold text-white">{username}</h3>
                                <p className="text-xs text-carbon-muted">Verified Creator</p>
                            </div>
                        </div>
                        <button className="px-3 py-1 text-xs font-medium text-white bg-carbon-surface border border-carbon-border rounded-full hover:bg-white/10 transition-colors">
                            Follow
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                        {/* Prompt Section */}
                        <div>
                            <h4 className="text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-3">Prompt</h4>
                            <p className="text-sm text-gray-300 leading-relaxed font-normal whitespace-pre-wrap">
                                {image.prompt}
                            </p>
                            <button
                                onClick={handleCopyPrompt}
                                className="mt-3 text-xs text-carbon-muted hover:text-white flex items-center gap-1 transition-colors"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                Copy prompt
                            </button>
                        </div>

                        {/* Settings Section */}
                        <div>
                            <h4 className="text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-3">Settings</h4>
                            <div className="flex flex-wrap gap-2">
                                <span className="px-2 py-1 bg-carbon-surface border border-carbon-border rounded text-xs text-carbon-text">
                                    {image.width} x {image.height}
                                </span>
                                <span className="px-2 py-1 bg-carbon-surface border border-carbon-border rounded text-xs text-carbon-text">
                                    {image.model}
                                </span>
                                {image.duration && (
                                    <span className="px-2 py-1 bg-carbon-surface border border-carbon-border rounded text-xs text-carbon-text">
                                        {image.duration}s
                                    </span>
                                )}
                                <span className="px-2 py-1 bg-carbon-surface border border-carbon-border rounded text-xs text-carbon-text">
                                    {new Date(image.createdAt).toLocaleString()}
                                </span>
                            </div>
                        </div>

                        {/* Generation Parameters */}
                        {image.params && (
                            <div>
                                <h4 className="text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-3">Parameters</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    {image.params.aspect_ratio && (
                                        <div className="flex justify-between">
                                            <span className="text-carbon-muted">Aspect Ratio:</span>
                                            <span className="text-carbon-text">{image.params.aspect_ratio}</span>
                                        </div>
                                    )}
                                    {image.params.quality && (
                                        <div className="flex justify-between">
                                            <span className="text-carbon-muted">Quality:</span>
                                            <span className="text-carbon-text">{image.params.quality}</span>
                                        </div>
                                    )}
                                    {image.params.input_values?.seed !== undefined && (
                                        <div className="flex justify-between">
                                            <span className="text-carbon-muted">Seed:</span>
                                            <span className="text-carbon-text">{image.params.input_values.seed}</span>
                                        </div>
                                    )}
                                    {image.params.input_values?.steps !== undefined && (
                                        <div className="flex justify-between">
                                            <span className="text-carbon-muted">Steps:</span>
                                            <span className="text-carbon-text">{image.params.input_values.steps}</span>
                                        </div>
                                    )}
                                    {image.params.input_values?.cfg_scale !== undefined && (
                                        <div className="flex justify-between">
                                            <span className="text-carbon-muted">CFG Scale:</span>
                                            <span className="text-carbon-text">{image.params.input_values.cfg_scale}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Negative Prompt */}
                        <div>
                            <h4 className="text-[10px] font-bold text-carbon-muted uppercase tracking-wider mb-3">Negative Prompt</h4>
                            <p className="text-xs text-carbon-muted italic leading-relaxed">
                                {image.params?.input_values?.negative_prompt || 'None'}
                            </p>
                        </div>

                    </div>

                    {/* Footer: Actions */}
                    <div className="p-6 border-t border-carbon-border bg-[#0a0a0a] space-y-3">
                        <Button
                            onClick={handleRecreate}
                            variant="primary"
                            className="w-full gap-2 !bg-white !text-black hover:!bg-gray-200"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            Recreate
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                            <Button onClick={handleDownload} variant="secondary" size="sm" className="w-full">
                                Download
                            </Button>
                            <Button variant="outline" size="sm" className="w-full">
                                Share Link
                            </Button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ImageDetailModal;
