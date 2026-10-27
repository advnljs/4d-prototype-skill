import { useSyncExternalStore } from 'react';
import { buildVars, cssName, type Mode, type Style } from './palette';
import { createStore } from './store';

/**
 * 外观（配色 × 明暗 × 风格）：偏好存在本机，应用时把 palette.ts 算出的变量写进一个 <style>：
 *   :root           覆盖 token（配色、深色、风格的阴影）
 *   .theme-island   恢复原始 token —— 原样呈现的内容（手机里的 App、地图插画、文件与格式样例、外部系统页面）
 *                   保持自己的样子，不随原型外观变化
 * 风格“方正”的圆角在 index.css 里用 html[data-style] 处理；html[data-mode] 供少量需要区分明暗的样式使用。
 * 在 main.tsx 渲染之前调用 applyTheme()，避免首屏闪一下默认配色。
 */
export interface ThemePrefs {
  palette: string;
  brand: string;
  mode: Mode | 'system';
  style: Style;
}

export const themeStore = createStore<ThemePrefs>('theme', () => ({ palette: 'default', brand: '#2563eb', mode: 'light', style: 'soft' }));

let defaults: Record<string, string> | null = null;

/** 从样式表里读出 @theme 的原始 token（Tailwind 4 输出在 @layer theme 的 :root 规则里） */
function readDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if ('cssRules' in r && (r as CSSGroupingRule).cssRules) visit((r as CSSGroupingRule).cssRules);
      if (r instanceof CSSStyleRule && /(^|,)\s*:root\b/.test(r.selectorText)) {
        for (const name of Array.from(r.style)) {
          if (name.startsWith('--color-')) out[name.slice(8)] = r.style.getPropertyValue(name).trim();
          if (name.startsWith('--shadow-')) out[name.slice(2)] = r.style.getPropertyValue(name).trim();
        }
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      /* 跨域样式表不可读，跳过 */
    }
  }
  return out;
}

/** 原始 token（例如 “原型默认” 色块用 primary-500 的原始值） */
export function defaultToken(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  defaults ??= readDefaults();
  return defaults[name];
}

const systemDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export function resolvedMode(p: ThemePrefs = themeStore.get()): Mode {
  return p.mode === 'system' ? (systemDark() ? 'dark' : 'light') : p.mode;
}

export function applyTheme() {
  if (typeof document === 'undefined') return;
  defaults ??= readDefaults();
  const p = themeStore.get();
  const mode = resolvedMode(p);
  const vars = buildVars(defaults, { palette: p.palette, brand: p.brand, mode, style: p.style });
  const decl = (entries: [string, string][]) => entries.map(([k, v]) => `${cssName(k)}:${v};`).join('');
  const island = Object.keys(vars).filter((k) => defaults![k] !== undefined).map((k) => [k, defaults![k]] as [string, string]);
  let el = document.getElementById('theme-vars');
  if (!el) {
    el = document.createElement('style');
    el.id = 'theme-vars';
    document.head.appendChild(el);
  }
  el.textContent = `:root{${decl(Object.entries(vars))}}.theme-island{${decl(island)}color-scheme:light;}`;
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.style = p.style;
  root.dataset.palette = p.palette;
  root.style.colorScheme = mode;
}

let wired = false;
/** 启动时调用一次：应用当前外观，并在偏好或系统明暗变化时重新应用 */
export function initTheme() {
  applyTheme();
  if (wired || typeof window === 'undefined') return;
  wired = true;
  themeStore.subscribe(applyTheme);
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => themeStore.get().mode === 'system' && applyTheme());
}

export function useTheme(): ThemePrefs {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get, themeStore.get);
}
