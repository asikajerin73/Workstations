import { ArkError } from '../shared/types';
import { deepSpace, themeToCssVars, type Theme } from '../shared/tokens';

export interface ThemeTarget {
  setProperty(name: string, value: string): void;
}

export interface ThemeEngine {
  applyTheme(target: ThemeTarget, themeId: string): Theme;
  getCurrentThemeId(): string | null;
}

export function createThemeEngine(registry: readonly Theme[]): ThemeEngine {
  const themes: ReadonlyMap<string, Theme> = new Map(registry.map((theme) => [theme.id, theme]));
  let currentThemeId: string | null = null;

  return {
    applyTheme(target, themeId) {
      const theme = themes.get(themeId);
      if (theme === undefined) {
        throw new ArkError('E-THEME-001', `Unknown theme: ${themeId}`);
      }

      for (const [name, value] of Object.entries(themeToCssVars(theme))) {
        target.setProperty(name, value);
      }
      currentThemeId = theme.id;
      return theme;
    },
    getCurrentThemeId: () => currentThemeId,
  };
}

const defaultEngine = createThemeEngine([deepSpace]);

export const applyTheme = defaultEngine.applyTheme;
export const getCurrentThemeId = defaultEngine.getCurrentThemeId;
