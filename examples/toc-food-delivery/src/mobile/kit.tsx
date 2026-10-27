import { useEffect, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { mUi } from './mstate';

/** 屏幕声明自己的状态栏颜色（深色头部用 light） */
export function useTone(tone: 'light' | 'dark') {
  useEffect(() => {
    mUi.set({ tone });
  }, [tone]);
}

type HeaderTone = 'brand' | 'dark' | 'green' | 'light' | 'clear';

const HEADER_BG: Record<HeaderTone, string> = {
  brand: 'brand-grad text-white',
  dark: 'bg-[#16181d] text-white',
  green: 'bg-gradient-to-b from-[#17b882] to-[#0e9f6e] text-white',
  light: 'bg-[#f7f4f1]/90 text-ink-900 backdrop-blur-xl',
  clear: 'text-ink-900',
};

/** App 顶部导航：自动避让状态栏 */
export function Header({ title, sub, onBack, right, tone = 'light', children, className }: { title?: ReactNode; sub?: ReactNode; onBack?: () => void; right?: ReactNode; tone?: HeaderTone; children?: ReactNode; className?: string }) {
  useTone(tone === 'light' || tone === 'clear' ? 'dark' : 'light');
  return (
    <header className={cx('relative z-20 shrink-0 px-4 pb-3', HEADER_BG[tone], className)} style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
      <div className="flex h-10 items-center gap-2">
        {onBack ? (
          <button type="button" aria-label="返回" onClick={onBack} className={cx('m-press -ml-1 flex h-9 w-9 items-center justify-center rounded-full', tone === 'light' || tone === 'clear' ? 'bg-black/[0.05]' : 'bg-white/15')}>
            <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? <div className="truncate text-[17px] font-bold leading-tight">{title}</div> : null}
          {sub ? <div className={cx('truncate text-[12.5px] leading-tight', tone === 'light' || tone === 'clear' ? 'text-ink-500' : 'text-white/75')}>{sub}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}

/** 底部页签栏（毛玻璃，避让 Home 指示条） */
export function TabBar<T extends string>({ items, value, onChange, tone = 'brand' }: { items: { value: T; label: string; icon: IconName; badge?: number }[]; value: T; onChange: (v: T) => void; tone?: 'brand' | 'dark' | 'green' }) {
  const on = { brand: 'text-primary-600', dark: 'text-[#ff9a3c]', green: 'text-[#0e9f6e]' }[tone];
  return (
    <nav className={cx('relative z-20 flex shrink-0 justify-around border-t pt-1.5 backdrop-blur-xl', tone === 'dark' ? 'border-white/[0.06] bg-[#16181d]/95' : 'border-black/[0.05] bg-white/[0.92]')} style={{ paddingBottom: 'calc(var(--sab) + 4px)' }}>
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)} className={cx('m-press relative flex w-20 flex-col items-center gap-0.5 py-1 text-[11px] font-medium', it.value === value ? on : tone === 'dark' ? 'text-white/45' : 'text-ink-400')}>
          <Icon name={it.icon} size={23} strokeWidth={it.value === value ? 2.1 : 1.7} />
          {it.label}
          {it.badge ? <span className="num absolute right-4 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-seal-500 px-1 text-[10px] font-bold text-white">{it.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

const BTN: Record<'brand' | 'dark' | 'green' | 'ghost' | 'white', string> = {
  brand: 'brand-grad text-white shadow-[0_10px_24px_-10px_rgb(242_90_15/0.9)]',
  dark: 'bg-[#1f2329] text-white shadow-[0_10px_24px_-12px_rgb(0_0_0/0.6)]',
  green: 'bg-gradient-to-b from-[#17b882] to-[#0e9f6e] text-white shadow-[0_10px_24px_-10px_rgb(14_159_110/0.9)]',
  ghost: 'bg-black/[0.05] text-ink-800',
  white: 'bg-white text-ink-900 shadow-raise',
};

/** 大号主按钮（演示光标点击的目标） */
export function Btn({ children, onClick, demo, tone = 'brand', disabled, className, icon, size = 'lg' }: { children: ReactNode; onClick?: () => void; demo?: string; tone?: keyof typeof BTN; disabled?: boolean; className?: string; icon?: IconName; size?: 'md' | 'lg' }) {
  return (
    <button
      type="button"
      data-demo={demo}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'm-press flex w-full items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none',
        size === 'lg' ? 'h-[52px] text-[16px]' : 'h-11 text-[14.5px]',
        BTN[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 19 : 17} strokeWidth={2.1} /> : null}
      {children}
    </button>
  );
}

/** 底部弹层（在 App 容器内部，带遮罩与把手） */
export function Sheet({ open, onClose, children, className, dark }: { open: boolean; onClose?: () => void; children: ReactNode; className?: string; dark?: boolean }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="anim-fade absolute inset-0 bg-black/35" onClick={onClose} />
      <div className={cx('anim-m-sheet relative max-h-[88%] overflow-hidden rounded-t-[28px] shadow-[0_-20px_50px_-20px_rgb(0_0_0/0.45)]', dark ? 'bg-[#1d2026] text-white' : 'bg-white', className)} style={{ paddingBottom: 'var(--sab)' }}>
        <div className={cx('mx-auto mt-2.5 h-[5px] w-10 rounded-full', dark ? 'bg-white/20' : 'bg-black/15')} />
        {children}
      </div>
    </div>
  );
}

/** 圆环进度 */
export function Ring({ value, size = 44, stroke = 4, color = '#e25507', track = 'rgb(0 0 0 / 0.08)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: 'stroke-dashoffset 500ms var(--ease-out-strong)' }} />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

export function Stars({ n, size = 20, onPick }: { n: number; size?: number; onPick?: (n: number) => void }) {
  return (
    <span className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" aria-label={`${i} 星`} onClick={() => onPick?.(i)} className={cx('m-press', i <= n && 'anim-pop')} style={{ animationDelay: `${i * 60}ms` }}>
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={i <= n ? '#ffb020' : '#e7e0d9'} />
          </svg>
        </button>
      ))}
    </span>
  );
}

export function Card({ children, className, anchor, onClick, demo }: { children: ReactNode; className?: string; anchor?: string; onClick?: () => void; demo?: string }) {
  const cls = cx('rounded-[20px] bg-white p-4 shadow-[0_8px_24px_-16px_rgb(60_30_10/0.35)] ring-1 ring-black/[0.03]', onClick && 'm-press w-full text-left', className);
  return onClick ? (
    <button type="button" data-flow-anchor={anchor} data-demo={demo} onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <div data-flow-anchor={anchor} className={cls}>
      {children}
    </div>
  );
}

export function Row({ k, v, strong, tone }: { k: ReactNode; v: ReactNode; strong?: boolean; tone?: 'brand' | 'muted' | 'warn' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[5px] text-[14px]">
      <span className="text-ink-600">{k}</span>
      <span className={cx('num text-right', strong ? 'font-bold text-ink-900' : 'font-medium', tone === 'brand' ? 'text-primary-600' : tone === 'muted' ? 'text-ink-400' : tone === 'warn' ? 'text-amber-700' : !strong && 'text-ink-900')}>{v}</span>
    </div>
  );
}

/** 横向分段（App 内的小页签） */
export function Seg<T extends string>({ items, value, onChange, dark }: { items: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; dark?: boolean }) {
  return (
    <div className={cx('flex rounded-full p-1', dark ? 'bg-white/[0.07]' : 'bg-black/[0.05]')}>
      {items.map((it) => (
        <button key={it.value} type="button" onClick={() => onChange(it.value)} className={cx('m-press flex h-8 flex-1 items-center justify-center rounded-full text-[13px] font-medium transition-colors', it.value === value ? (dark ? 'bg-white/[0.14] text-white' : 'bg-white text-ink-900 shadow-[0_1px_4px_rgb(0_0_0/0.12)]') : dark ? 'text-white/55' : 'text-ink-500')}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = 'brand', className }: { children: ReactNode; tone?: 'brand' | 'green' | 'warn' | 'neutral' | 'dark' | 'red'; className?: string }) {
  const cls = {
    brand: 'bg-primary-50 text-primary-700',
    green: 'bg-pine-50 text-pine-700',
    warn: 'bg-amber-50 text-amber-700',
    neutral: 'bg-black/[0.05] text-ink-600',
    dark: 'bg-white/10 text-white/80',
    red: 'bg-seal-50 text-seal-600',
  }[tone];
  return <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold', cls, className)}>{children}</span>;
}
