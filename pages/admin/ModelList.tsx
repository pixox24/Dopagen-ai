import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import { adminApi, AdminModel } from '../../services/adminApi';

// ============================================
// 两步确认删除按钮
// ============================================
const DeleteButton: React.FC<{ onDelete: () => void }> = ({ onDelete }) => {
    const [confirmStep, setConfirmStep] = useState(false);

    useEffect(() => {
        if (!confirmStep) return;
        const timer = setTimeout(() => setConfirmStep(false), 3000);
        return () => clearTimeout(timer);
    }, [confirmStep]);

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirmStep) {
            onDelete();
            setConfirmStep(false);
        } else {
            setConfirmStep(true);
        }
    };

    return (
        <button
            onClick={handleClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${confirmStep
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20'
                }`}
        >
            {confirmStep ? 'Confirm Delete' : 'Delete'}
        </button>
    );
};

// ============================================
// 模型列表主组件
// ============================================
const ModelList: React.FC = () => {
    const navigate = useNavigate();
    const [models, setModels] = useState<AdminModel[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadModels = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminApi.getModels();
            setModels(data);
            setError(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load models');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadModels(); }, [loadModels]);

    const handleToggle = async (id: string) => {
        try {
            const updated = await adminApi.toggleModelVisibility(id);
            setModels(prev => prev.map(m => m.id === id ? { ...m, is_hidden: updated.is_hidden } : m));
        } catch (err: unknown) {
            console.error('Toggle failed:', err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await adminApi.deleteModel(id);
            setModels(prev => prev.filter(m => m.id !== id));
        } catch (err: unknown) {
            console.error('Delete failed:', err);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-white tracking-tight">Models Config</h1>
                    <p className="text-sm text-carbon-muted mt-1">
                        Manage all models. Models created here are available to all users.
                    </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => navigate('/admin/models/new')}>
                    + Import Model
                </Button>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-carbon-card border border-carbon-border rounded-xl p-5 animate-pulse">
                            <div className="h-4 w-1/3 bg-carbon-border rounded mb-2"></div>
                            <div className="h-3 w-1/2 bg-carbon-border rounded opacity-50"></div>
                        </div>
                    ))}
                </div>
            ) : models.length === 0 ? (
                <div className="text-center py-20 text-carbon-muted">
                    <p className="text-lg mb-2">No models yet</p>
                    <p className="text-sm">Import your first model to get started.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {models.map(model => (
                        <div key={model.id} className={`bg-carbon-card border border-carbon-border rounded-xl p-5 transition-all hover:border-carbon-border/80 ${model.is_hidden ? 'opacity-50' : ''}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                    {model.thumbnail_url ? (
                                        <img src={model.thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-carbon-border flex-shrink-0" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-lg bg-carbon-surface border border-carbon-border flex items-center justify-center text-carbon-muted text-lg flex-shrink-0">⚗</div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-sm font-medium text-white truncate">{model.name}</h3>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-carbon-surface text-carbon-muted border border-carbon-border">
                                                v{model.version || '1.0'}
                                            </span>
                                            {model.is_hidden && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Hidden</span>
                                            )}
                                            {!model.user_id && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">Global</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-carbon-muted truncate">{model.description || 'No description'}</p>
                                        <p className="text-[10px] text-carbon-muted/50 mt-1 font-mono">ID: {model.web_app_id || model.id}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => handleToggle(model.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${model.is_hidden
                                                ? 'text-green-400 hover:bg-green-500/10 border-transparent hover:border-green-500/20'
                                                : 'text-yellow-400 hover:bg-yellow-500/10 border-transparent hover:border-yellow-500/20'
                                            }`}
                                    >
                                        {model.is_hidden ? 'Show' : 'Hide'}
                                    </button>
                                    <DeleteButton onDelete={() => handleDelete(model.id)} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ModelList;
