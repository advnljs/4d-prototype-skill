import { useEffect, useRef, useState } from 'react';
import { PRESETS } from '@/lib/palette';
import { defaultToken, themeStore, useTheme, type ThemePrefs } from '@/lib/theme';
import { Icon } from './Icon';
import { cx, Segmented } from './primitives';

/**
 * 顶栏“外观”：配色（预设 / 客户品牌色）× 明暗 × 风格。改动即时生效并记在本机；演示进行中也可以切换。
 * 原样呈现的内容（文件与格式样例：Excel、库表、接口报文、外部系统表单）不随外观变化。
 */
export function ThemeSwitcher() {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<ThemePrefs>) => themeStore.set(patch);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const swatch = (key: string) => (key === 'default' ? defaultToken('primary-500') : key === 'custom' ? t.brand : PRESETS.find((p) => p.key === key)?.brand) ?? 'var(--color-ink-300)';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        data-demo="theme-toggle"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(!open)}
        className={cx('flex h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-xs text-ink-600 transition-colors hover:bg-ink-950/[0.05] hover:text-ink-900', open && 'bg-ink-950/[0.06] text-ink-900')}
      >
        <Icon name="palette" size={16} />
        外观
      </button>
      {open ? (
        <div role="dialog" aria-label="外观" className="anim-fade absolute right-0 top-10 z-50 w-[320px] rounded-[16px] bg-surface p-4 shadow-pop ring-1 ring-ink-950/[0.06]">
          <div className="text-xs font-medium text-ink-500">配色</div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[...PRESETS.map((p) => ({ key: p.key, label: p.label })), { key: 'custom', label: '品牌色' }].map((p) => (
              <button
                key={p.key}
                type="button"
                data-demo={`theme-palette-${p.key}`}
                aria-pressed={t.palette === p.key}
                onClick={() => set({ palette: p.key })}
                className={cx(
                  'flex h-9 items-center gap-2 rounded-[10px] px-2 text-left text-xs transition-colors',
                  t.palette === p.key ? 'bg-primary-50 font-medium text-primary-700 ring-1 ring-primary-300' : 'text-ink-700 hover:bg-ink-950/[0.04]',
                )}
              >
                <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-ink-950/[0.08]" style={{ background: swatch(p.key) }} />
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
          {t.palette === 'custom' ? (
            <label className="mt-2 flex items-center justify-between gap-3 rounded-[10px] bg-ink-50 px-3 py-2 text-xs text-ink-600">
              输入客户的品牌色，自动生成整套配色
              <span className="flex items-center gap-2">
                <span className="num font-mono text-ink-700">{t.brand}</span>
                <input type="color" value={t.brand} onChange={(e) => set({ brand: e.target.value })} aria-label="品牌色" className="h-7 w-9 cursor-pointer rounded-[6px] border-0 bg-transparent p-0" />
              </span>
            </label>
          ) : null}

          <div className="mt-4 text-xs font-medium text-ink-500">明暗</div>
          <div className="mt-2">
            <Segmented<ThemePrefs['mode']>
              size="sm"
              value={t.mode}
              onChange={(mode) => set({ mode })}
              items={[
                { value: 'light', label: <span className="flex items-center gap-1" data-demo="theme-mode-light"><Icon name="sun" size={13} />浅色</span> },
                { value: 'dark', label: <span className="flex items-center gap-1" data-demo="theme-mode-dark"><Icon name="moon" size={13} />深色</span> },
                { value: 'system', label: '跟随系统' },
              ]}
            />
          </div>

          <div className="mt-4 text-xs font-medium text-ink-500">风格</div>
          <div className="mt-2 flex items-center justify-between">
            <Segmented<ThemePrefs['style']>
              size="sm"
              value={t.style}
              onChange={(style) => set({ style })}
              items={[
                { value: 'soft', label: <span data-demo="theme-style-soft">圆润</span> },
                { value: 'sharp', label: <span data-demo="theme-style-sharp">方正</span> },
              ]}
            />
            <button type="button" onClick={() => themeStore.reset()} className="text-xs text-primary-600 hover:underline">
              恢复默认
            </button>
          </div>
          <p className="mt-3 text-2xs leading-[17px] text-ink-400">Excel、库表、接口报文、外部系统表单等格式样例保持原样，不随外观变化。</p>
        </div>
      ) : null}
    </div>
  );
}
