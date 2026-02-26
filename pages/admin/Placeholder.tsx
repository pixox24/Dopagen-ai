import React from 'react';

interface PlaceholderProps {
  title: string;
}

const Placeholder: React.FC<PlaceholderProps> = ({ title }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4 animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-carbon-surface border border-carbon-border flex items-center justify-center text-carbon-muted">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            <p className="text-sm text-carbon-muted mt-2">This module is currently under development.</p>
        </div>
        <button disabled className="px-4 py-2 rounded bg-carbon-surface border border-carbon-border text-xs text-carbon-muted cursor-not-allowed">
            Coming Soon
        </button>
    </div>
  );
};

export default Placeholder;
