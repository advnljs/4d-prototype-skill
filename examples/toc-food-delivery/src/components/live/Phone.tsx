import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ACTORS, type ActorKey } from '@/flow/actors';
import type { Banner } from '@/state/live';

/**
 * 手机外框：刘海岛、状态栏（业务时钟）、推送横幅、屏幕内容。
 * 屏幕切换用 key 触发进入动画（只动 transform / opacity）。
 */
export function Phone({
  who,
  label,
  time,
  dark,
  active,
  anchor,
  banner,
  screenKey,
  children,
}: {
  who: ActorKey;
  label: string;
  time: string;
  dark?: boolean;
  active?: boolean;
  anchor: string;
  banner?: Banner;
  screenKey: string;
  children: ReactNode;
}) {
  const a = ACTORS[who];
  return (
    <figure className="flex min-w-0 flex-col items-center gap-2.5">
      <div
        data-flow-anchor={anchor}
        className={cx('phone-frame theme-island relative rounded-[46px] bg-[#141110] p-[7px] shadow-phone transition-[transform,box-shadow] duration-300', active && 'ring-[3px] ring-offset-4 ring-offset-paper')}
        style={{ width: 268, height: 552, ...(active ? ({ '--tw-ring-color': `color-mix(in srgb, ${a.color} 55%, transparent)` } as React.CSSProperties) : {}) }}
      >
        {/* 侧键 */}
        <span className="absolute -left-[2px] top-[108px] h-9 w-[3px] rounded-l bg-[#2a2420]" />
        <span className="absolute -right-[2px] top-[140px] h-14 w-[3px] rounded-r bg-[#2a2420]" />
        <div className={cx('relative flex h-full flex-col overflow-hidden rounded-[39px]', dark ? 'bg-[#15171c]' : 'bg-[#f6f4f1]')}>
          <StatusBar time={time} dark={dark} />
          {banner ? <PushBanner key={banner.id} b={banner} /> : null}
          <div key={screenKey} className="anim-screen relative flex min-h-0 flex-1 flex-col">
            {children}
          </div>
          <span className={cx('absolute bottom-1.5 left-1/2 h-[4px] w-[96px] -translate-x-1/2 rounded-full', dark ? 'bg-white/70' : 'bg-black/80')} />
        </div>
      </div>
      <figcaption className="flex items-center gap-1.5 text-xs text-ink-600">
        <span className="h-2 w-2 rounded-full" style={{ background: a.color }} />
        <span className="font-medium text-ink-800">{label}</span>
      </figcaption>
    </figure>
  );
}

function StatusBar({ time, dark }: { time: string; dark?: boolean }) {
  return (
    <div className={cx('relative z-20 flex h-[34px] shrink-0 items-center justify-between px-6 pt-1 text-[12px] font-semibold', dark ? 'text-white' : 'text-ink-900')}>
      <span className="num w-12">{time}</span>
      <span className="absolute left-1/2 top-[7px] h-[22px] w-[78px] -translate-x-1/2 rounded-full bg-black" />
      <span className="flex w-12 items-center justify-end gap-1">
        <svg width="15" height="10" viewBox="0 0 15 10" aria-hidden="true" fill="currentColor">
          <rect x="0" y="7" width="2.6" height="3" rx="0.6" />
          <rect x="4" y="5" width="2.6" height="5" rx="0.6" />
          <rect x="8" y="2.6" width="2.6" height="7.4" rx="0.6" />
          <rect x="12" y="0" width="2.6" height="10" rx="0.6" />
        </svg>
        <svg width="22" height="11" viewBox="0 0 22 11" aria-hidden="true">
          <rect x="0.5" y="0.5" width="18" height="10" rx="3" fill="none" stroke="currentColor" opacity="0.45" />
          <rect x="2" y="2" width="13" height="7" rx="1.6" fill="currentColor" />
          <rect x="19.6" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

function PushBanner({ b }: { b: Banner }) {
  const icon = b.to === 'merchant' ? 'bell' : b.to === 'rider' ? 'bike' : 'bag';
  return (
    <div className="anim-banner absolute inset-x-2 top-[38px] z-30 flex items-start gap-2.5 rounded-[18px] bg-white/[0.92] px-3 py-2.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.35)] ring-1 ring-black/[0.06] backdrop-blur-xl">
      <span className="brand-grad mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-white">
        <Icon name={icon} size={15} strokeWidth={2} className={b.to === 'merchant' ? 'anim-ring' : undefined} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12.5px] font-semibold text-ink-900">{b.title}</span>
          <span className="shrink-0 text-[11px] text-ink-400">现在</span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-[16px] text-ink-600">{b.body}</p>
      </div>
    </div>
  );
}

/** 手机内的主操作按钮（演示光标点击的目标） */
export function AppButton({ children, onClick, demo, tone = 'brand', disabled, className, title }: { children: ReactNode; onClick?: () => void; demo?: string; tone?: 'brand' | 'dark' | 'rider' | 'ghost'; disabled?: boolean; className?: string; title?: string }) {
  const cls = {
    brand: 'brand-grad text-white shadow-[0_8px_18px_-8px_rgb(242_90_15/0.8)]',
    dark: 'bg-[#1f2329] text-white',
    rider: 'bg-gradient-to-b from-[#16b37f] to-[#0e9f6e] text-white shadow-[0_8px_18px_-8px_rgb(14_159_110/0.8)]',
    ghost: 'bg-black/[0.05] text-ink-800',
  }[tone];
  return (
    <button
      type="button"
      data-demo={demo}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx('flex h-10 w-full items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold transition-[transform,opacity] duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40', cls, className)}
    >
      {children}
    </button>
  );
}
