import React, { useState, useEffect } from 'react';
import { adminApi, AdminStats } from '../../services/adminApi';

const Dashboard: React.FC = () => {
    const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, totalImages: 0, totalTasks: 0, totalModels: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        adminApi.getStats()
            .then(setStats)
            .catch(err => console.error('Failed to load stats:', err))
            .finally(() => setLoading(false));
    }, []);

    const statCards = [
        { label: 'Total Models', value: stats.totalModels, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        { label: 'Generated Assets', value: stats.totalImages, color: 'text-green-400', bg: 'bg-green-500/10' },
        { label: 'Active Users', value: stats.totalUsers, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { label: 'Total Tasks', value: stats.totalTasks, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    ];

    return (
        <div className="space-y-6 animate-fade-in">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard Overview</h1>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                    <div key={i} className={`bg-carbon-card border border-carbon-border p-5 rounded-xl ${loading ? 'animate-pulse' : ''}`}>
                        <p className="text-xs text-carbon-muted uppercase tracking-wider mb-2">{stat.label}</p>
                        <div className="flex items-baseline gap-2">
                            <span className={`text-2xl font-bold ${stat.color}`}>
                                {loading ? '—' : stat.value.toLocaleString()}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
                <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 min-h-[300px]">
                    <h3 className="text-sm font-medium text-white mb-4">System Info</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between py-2 border-b border-carbon-border/50">
                            <span className="text-carbon-muted">Architecture</span>
                            <span className="text-white font-mono text-xs">React + Express + Supabase</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-carbon-border/50">
                            <span className="text-carbon-muted">Auth Mode</span>
                            <span className="text-green-400 font-mono text-xs">JWT (Backend)</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-carbon-border/50">
                            <span className="text-carbon-muted">API Status</span>
                            <span className="text-green-400 font-mono text-xs">● Connected</span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-carbon-muted">Admin Session</span>
                            <span className="text-yellow-400 font-mono text-xs">8h TTL</span>
                        </div>
                    </div>
                </div>
                <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 min-h-[300px]">
                    <h3 className="text-sm font-medium text-white mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                        <a href="#/admin/models/new" className="block p-4 rounded-lg bg-carbon-surface border border-carbon-border hover:border-blue-500/30 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">+</div>
                                <div>
                                    <p className="text-sm font-medium text-white">Import New Model</p>
                                    <p className="text-xs text-carbon-muted">Add a model for all users</p>
                                </div>
                            </div>
                        </a>
                        <a href="#/admin/settings" className="block p-4 rounded-lg bg-carbon-surface border border-carbon-border hover:border-yellow-500/30 transition-all group">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-400 group-hover:bg-yellow-500/20 transition-colors">⚙</div>
                                <div>
                                    <p className="text-sm font-medium text-white">System Settings</p>
                                    <p className="text-xs text-carbon-muted">API keys & configurations</p>
                                </div>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
