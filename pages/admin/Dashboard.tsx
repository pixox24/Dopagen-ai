import React from 'react';
import { useApp } from '../../context/AppContext';

const Dashboard: React.FC = () => {
  const { allModels, userImages } = useApp();

  return (
    <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Dashboard Overview</h1>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
                { label: 'Total Models', value: allModels.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { label: 'Generated Assets', value: userImages.length, color: 'text-green-400', bg: 'bg-green-500/10' },
                { label: 'Active Users', value: '1,204', color: 'text-purple-400', bg: 'bg-purple-500/10' },
                { label: 'System Status', value: '98%', color: 'text-orange-400', bg: 'bg-orange-500/10' },
            ].map((stat, i) => (
                <div key={i} className="bg-carbon-card border border-carbon-border p-5 rounded-xl">
                    <p className="text-xs text-carbon-muted uppercase tracking-wider mb-2">{stat.label}</p>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-bold ${stat.color}`}>{stat.value}</span>
                        {i === 2 && <span className="text-[10px] text-green-400">+12%</span>}
                    </div>
                </div>
            ))}
        </div>

        {/* Placeholder Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6">
            <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 min-h-[300px] flex flex-col justify-center items-center text-carbon-muted">
                <div className="w-full h-full border-2 border-dashed border-carbon-border rounded flex items-center justify-center bg-[#050505]">
                    Chart Placeholder
                </div>
            </div>
            <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 min-h-[300px]">
                <h3 className="text-sm font-medium text-white mb-4">Recent Activity</h3>
                <div className="space-y-4">
                    {[1,2,3].map(j => (
                        <div key={j} className="flex items-center gap-3 pb-3 border-b border-carbon-border/50 last:border-0">
                            <div className="w-8 h-8 rounded-full bg-carbon-surface"></div>
                            <div>
                                <div className="h-2 w-32 bg-carbon-border rounded mb-1"></div>
                                <div className="h-2 w-20 bg-carbon-border rounded opacity-50"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Dashboard;
