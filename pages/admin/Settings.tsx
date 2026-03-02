import React, { useState, useEffect } from 'react';
import Button from '../../components/Button';
import { adminApi, SiteSettings } from '../../services/adminApi';

const Settings: React.FC = () => {
    const [settings, setSettings] = useState<SiteSettings>({ bizyairApiKey: '', loadingMessages: [] });
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [messagesInput, setMessagesInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        adminApi.getSettings()
            .then(data => {
                setSettings(data);
                setApiKeyInput(data.bizyairApiKey);
                setMessagesInput(data.loadingMessages.join('\n'));
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            const newMessages = messagesInput.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            const updated = await adminApi.updateSettings({
                bizyairApiKey: apiKeyInput.trim(),
                loadingMessages: newMessages,
            });
            setSettings(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const handleClearKey = () => {
        setApiKeyInput('');
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse max-w-3xl">
                <div className="h-8 w-48 bg-carbon-border rounded"></div>
                <div className="h-64 bg-carbon-card border border-carbon-border rounded-xl"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-3xl">
            <div className="border-b border-carbon-border pb-6">
                <h1 className="text-2xl font-semibold text-white tracking-tight">System Settings</h1>
                <p className="text-sm text-carbon-muted mt-1">Configure global API credentials and interface customization. Changes are saved server-side.</p>
            </div>

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>
            )}

            {/* API Key Section */}
            <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-medium text-white">Universal API Key</h3>
                        <p className="text-sm text-carbon-muted mt-1 leading-relaxed">
                            Server-side API key for BizyAir. Used for all image generation tasks. Stored securely on the backend.
                        </p>

                        <div className="mt-4 relative group">
                            <label className="block text-[11px] font-medium uppercase text-carbon-muted mb-2">BizyAir API Key</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="password"
                                    className="flex-1 p-3 rounded-lg carbon-input text-sm font-mono tracking-wider focus:ring-1 focus:ring-yellow-500/50 transition-all"
                                    placeholder="sk-..."
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                />
                                {apiKeyInput && (
                                    <button
                                        onClick={handleClearKey}
                                        className="p-3 rounded-lg bg-carbon-surface border border-carbon-border hover:border-red-500/50 hover:text-red-400 text-carbon-muted transition-all"
                                        title="Clear Key"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="mt-2 text-xs text-carbon-muted">
                            {settings.bizyairApiKey ? (
                                <span className="flex items-center gap-1.5 text-green-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>Active (server-side)
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 opacity-50">
                                    <span className="w-1.5 h-1.5 rounded-full bg-carbon-border"></span>Not Configured
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading Texts Section */}
            <div className="bg-carbon-card border border-carbon-border rounded-xl p-6 space-y-6">
                <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-base font-medium text-white">Loading Screen Messages</h3>
                        <p className="text-sm text-carbon-muted mt-1 leading-relaxed">
                            Customize animated text displayed to all users during image generation. One message per line.
                        </p>
                        <div className="mt-4">
                            <textarea
                                className="w-full h-40 p-3 rounded-lg carbon-input text-xs font-mono resize-none leading-relaxed placeholder-carbon-muted/30"
                                placeholder={`PROCESSING\nINITIALIZING\nRENDERING`}
                                value={messagesInput}
                                onChange={(e) => setMessagesInput(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Bar */}
            <div className="flex justify-end pt-4">
                <Button onClick={handleSave} variant="primary" size="lg" className="min-w-[150px]" isLoading={saving} disabled={saving}>
                    {saved ? '✓ Saved' : 'Save Changes'}
                </Button>
            </div>
        </div>
    );
};

export default Settings;
