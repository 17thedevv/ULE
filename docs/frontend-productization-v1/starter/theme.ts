/** ULE frontend reference module (browser-only).
 * No new package, no API endpoint, no database storage required.
 * Import and call installThemeSync() before React mount, then wire
 * saveThemePreference() into an accessible settings radio/select UI.
 */
export const THEME_STORAGE_KEY = 'ule.theme.v1';
export const THEME_PREFERENCES = ['system', 'paper', 'midnight', 'forest', 'contrast'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

// Session fallback when browser storage is unavailable.
let volatilePreference: ThemePreference | null = null;

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function readThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : (volatilePreference ?? 'system');
  } catch {
    return volatilePreference ?? 'system';
  }
}

function osPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function resolveTheme(preference: ThemePreference, dark = osPrefersDark()): ResolvedTheme {
  if (preference === 'system') return dark ? 'midnight' : 'paper';
  return preference;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const effective = resolveTheme(preference);
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective === 'midnight' ? 'dark' : 'light';
  return effective;
}

/** Emits a custom event for consumers rendering theme controls in the same tab. */
export function saveThemePreference(preference: ThemePreference): void {
  if (!isThemePreference(preference)) return;
  volatilePreference = preference;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage can be denied. Keep current session visually usable.
  }
  applyTheme(preference);
  window.dispatchEvent(new CustomEvent('ule-theme-change', { detail: { preference } }));
}

/** Install once at app bootstrap; call returned cleanup if bootstrapping again. */
export function installThemeSync(): () => void {
  applyTheme(readThemePreference());
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const handleSystem = () => {
    if (readThemePreference() === 'system') applyTheme('system');
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      volatilePreference = null;
      applyTheme(readThemePreference());
    }
  };
  media?.addEventListener?.('change', handleSystem);
  window.addEventListener('storage', handleStorage);
  return () => {
    media?.removeEventListener?.('change', handleSystem);
    window.removeEventListener('storage', handleStorage);
  };
}
