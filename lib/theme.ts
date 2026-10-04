export type Theme = 'light' | 'dark';

const listeners = new Set<() => void>();

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export const subscribeTheme = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
        media.removeEventListener('change', onStoreChange);
    };
};

export const readTheme = (): Theme => {
    try {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark') return saved;
    } catch {
        // localStorage can be unavailable (private mode, blocked site data)
    }
    return prefersDark() ? 'dark' : 'light';
};

// The server has no access to the visitor's preference; light is the default
// the stylesheet renders without a data-theme attribute.
export const readServerTheme = (): Theme => 'light';

export const writeTheme = (theme: Theme) => {
    try {
        localStorage.setItem('theme', theme);
    } catch {
        // Preference simply won't survive a reload
    }
    listeners.forEach((listener) => listener());
};
