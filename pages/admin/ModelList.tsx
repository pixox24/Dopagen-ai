import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { Model } from '../../types';

// Internal Component: Two-step Delete Confirmation Button
const DeleteButton = ({ onDelete }: { onDelete: () => void }) => {
    const [status, setStatus] = useState<'idle' | 'confirm'>('idle');

    // Auto-reset after 3 seconds if not confirmed
    useEffect(() => {
        if (status === 'confirm') {
            const timer = setTimeout(() => setStatus('idle'), 3000);
            return () => clearTimeout(timer);
        }
    }, [status]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        
        if (status === 'idle') {
            setStatus('confirm');
        } else {
            onDelete();
        }
    };

    if (status === 'confirm') {
        return (
            <button 
                onClick={handleClick}
                className="flex items-center gap-1 px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded border border-red-400 transition-all animate-fade-in shadow-md shadow-red-900/20"
                title="Click again to confirm"
            >
                <span className="text-[10px] font-bold tracking-wide">CONFIRM?</span>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
            </button>
        );
    }

    return (
        <button 
            onClick={handleClick}
            className="group flex items-center gap-1 px-2 py-1 bg-carbon-surface hover:bg-red-500/10 text-carbon-muted hover:text-red-400 rounded border border-carbon-border hover:border-red-500/20 transition-all"
            title="Delete Model"
        >
            <span className="text-[10px] font-medium hidden group-hover:block">Delete</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
        </button>
    );
};

// Internal Component: Edit Modal
const EditModal = ({ model, isOpen, onClose, onSave }: { model: Model, isOpen: boolean, onClose: () => void, onSave: (id: string, updates: Partial<Model>) => void }) => {
    const [name, setName] = useState(model.name);
    const [desc, setDesc] = useState(model.description);

    useEffect(() => {
        if (isOpen) {
            setName(model.name);
            setDesc(model.description);
        }
    }, [isOpen, model]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(model.id, {
            name,
            description: desc
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-carbon-card border border-carbon-border p-6 rounded-xl w-full max-w-md shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-carbon-muted hover:text-white">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <h3 className="text-lg font-semibold text-white mb-6">Edit Model</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">Model Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-2.5 rounded carbon-input text-sm" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">Description</label>
                        <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-2.5 rounded carbon-input text-sm h-24 resize-none" />
                    </div>
                    <div className="pt-2 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave}>Save Changes</Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ModelList: React.FC = () => {
  const { allModels, deleteCustomModel, updateCustomModel, toggleModelVisibility } = useApp();
  const navigate = useNavigate();
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  const DEFAULT_THUMBNAIL = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiBmaWxsPSJub25lIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzExMSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjIwIiBzdHJva2U9IiMzMzMiIHN0cm9rZS13aWR0aD0iMiIvPjxjaXJjbGUgY3g9IjgwIiBjeT0iMjAiIHI9IjUiIGZpbGw9IiM0YWRlODAiLz48L3N2Zz4=`;

  return (
    <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-carbon-border pb-6">
            <div>
                <h1 className="text-2xl font-semibold text-white tracking-tight">Model Configuration</h1>
                <p className="text-sm text-carbon-muted mt-1">Manage AI workflows and integrations.</p>
            </div>
            <Button onClick={() => navigate('/admin/models/new')} className="gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Add New Model
            </Button>
        </div>

        <div className="bg-carbon-card border border-carbon-border rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead>
                    <tr className="bg-[#0a0a0a] border-b border-carbon-border text-xs uppercase text-carbon-muted">
                        <th className="px-6 py-4 font-medium w-16">Icon</th>
                        <th className="px-6 py-4 font-medium">Model Name</th>
                        <th className="px-6 py-4 font-medium">Type</th>
                        <th className="px-6 py-4 font-medium">Web App ID</th>
                        <th className="px-6 py-4 font-medium">Status</th>
                        <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-carbon-border">
                    {allModels.map((model) => (
                        <tr key={model.id} className="hover:bg-white/5 transition-colors">
                            <td className="px-6 py-4">
                                <div className="w-8 h-8 rounded overflow-hidden bg-carbon-surface border border-carbon-border">
                                    <img 
                                        src={model.thumbnail || DEFAULT_THUMBNAIL} 
                                        alt={model.name} 
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-white">{model.name}</span>
                                    </div>
                                    <span className="text-[10px] text-carbon-muted font-mono">{model.id}</span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                {model.isCustom ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/20">CUSTOM</span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/20">SYSTEM</span>
                                )}
                            </td>
                            <td className="px-6 py-4 font-mono text-carbon-muted">
                                {model.schema?.model_id || model.web_app_id || 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleModelVisibility(model.id);
                                    }}
                                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
                                        model.hidden 
                                        ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' 
                                        : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                                    }`}
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${model.hidden ? 'bg-red-400' : 'bg-green-400'}`}></span>
                                    {model.hidden ? 'HIDDEN' : 'ACTIVE'}
                                </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    {model.isCustom ? (
                                        <>
                                            <button 
                                                onClick={() => setEditingModel(model)}
                                                className="p-1.5 bg-carbon-surface hover:bg-white/10 text-carbon-muted hover:text-white rounded border border-carbon-border transition-all"
                                                title="Edit Model"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <DeleteButton onDelete={() => deleteCustomModel(model.id)} />
                                        </>
                                    ) : (
                                         <span className="text-[10px] text-carbon-muted italic py-1 px-2 cursor-not-allowed opacity-50">Locked</span>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                    {allModels.length === 0 && (
                        <tr>
                            <td colSpan={6} className="px-6 py-8 text-center text-carbon-muted">
                                No models found.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>

        {editingModel && (
            <EditModal 
                model={editingModel} 
                isOpen={!!editingModel} 
                onClose={() => setEditingModel(null)} 
                onSave={updateCustomModel}
            />
        )}
    </div>
  );
};

export default ModelList;
