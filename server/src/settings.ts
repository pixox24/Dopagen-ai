import fs from 'fs';
import path from 'path';

export interface SiteSettings {
    bizyairApiKey: string;
    loadingMessages: string[];
}

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');

const defaults: SiteSettings = {
    bizyairApiKey: process.env.BIZYAIR_API_KEY || '',
    loadingMessages: [
        'INITIALIZING NEURAL PATHWAYS',
        'INJECTING DOPAMINE',
        'ALIGNING TENSORS',
        'SYNTHESIZING DREAMS',
        'DECODING MATRIX',
        'RENDERING REALITY',
    ],
};

let current: SiteSettings = { ...defaults };

export function loadSettings(): void {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            current = { ...defaults, ...JSON.parse(raw) };
        }
    } catch {
        console.warn('[Settings] Failed to load, using defaults');
    }
}

function persist(): void {
    try {
        const dir = path.dirname(SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(current, null, 2));
    } catch (err) {
        console.error('[Settings] Failed to persist:', err);
    }
}

export function getSettings(): SiteSettings {
    return { ...current };
}

export function getApiKey(): string {
    return current.bizyairApiKey;
}

export function getLoadingMessages(): string[] {
    return [...current.loadingMessages];
}

export function updateSettings(updates: Partial<SiteSettings>): SiteSettings {
    current = { ...current, ...updates };
    persist();
    return { ...current };
}

// Initialize on import
loadSettings();
