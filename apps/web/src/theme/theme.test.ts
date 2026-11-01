import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  installThemeSync,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme foundation (UI-01)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = '';
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveTheme', () => {
    it('resolves explicit preferences directly', () => {
      expect(resolveTheme('paper')).toBe('paper');
      expect(resolveTheme('midnight')).toBe('midnight');
      expect(resolveTheme('forest')).toBe('forest');
      expect(resolveTheme('contrast')).toBe('contrast');
    });

    it('resolves system to midnight when dark is true', () => {
      expect(resolveTheme('system', true)).toBe('midnight');
    });

    it('resolves system to paper when dark is false', () => {
      expect(resolveTheme('system', false)).toBe('paper');
    });
  });

  describe('readThemePreference & saveThemePreference', () => {
    it('defaults to system when no preference stored', () => {
      expect(readThemePreference()).toBe('system');
    });

    it('saves and reads valid theme preference', () => {
      saveThemePreference('forest');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('forest');
      expect(readThemePreference()).toBe('forest');
    });

    it('ignores invalid preference values', () => {
      saveThemePreference('paper');
      // @ts-expect-error Testing runtime invalid value
      saveThemePreference('neon-glow');
      expect(readThemePreference()).toBe('paper');
    });

    it('falls back gracefully when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage access denied');
      });

      saveThemePreference('contrast');
      expect(readThemePreference()).toBe('contrast');
    });
  });

  describe('applyTheme', () => {
    it('sets data-theme and color-scheme on document.documentElement', () => {
      const resolved = applyTheme('midnight');
      expect(resolved).toBe('midnight');
      expect(document.documentElement.dataset.theme).toBe('midnight');
      expect(document.documentElement.style.colorScheme).toBe('dark');
    });

    it('sets color-scheme to light for paper, forest, contrast', () => {
      applyTheme('paper');
      expect(document.documentElement.style.colorScheme).toBe('light');

      applyTheme('forest');
      expect(document.documentElement.style.colorScheme).toBe('light');

      applyTheme('contrast');
      expect(document.documentElement.style.colorScheme).toBe('light');
    });
  });

  describe('installThemeSync', () => {
    it('applies theme on installation and responds to storage events', () => {
      saveThemePreference('paper');
      const cleanup = installThemeSync();

      expect(document.documentElement.dataset.theme).toBe('paper');

      window.localStorage.setItem(THEME_STORAGE_KEY, 'forest');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: THEME_STORAGE_KEY,
          newValue: 'forest',
        }),
      );

      expect(document.documentElement.dataset.theme).toBe('forest');

      cleanup();
    });
  });
});
