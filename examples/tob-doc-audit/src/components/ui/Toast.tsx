import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { cx } from './primitives';

type ToastTone = 'success' | 'error' | 'info' | 'download';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  desc?: string;
}

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(tone: ToastTone, title: string, desc?: string, ms = 3600) {
  const id = ++seq;
  items = [...items, { id, tone, title, desc }];
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ms);
}

/**
 * 需求说明书要求“自动生成可下载文件（出现在页面左下角）”，
 * 因此下载类通知固定显示在左下角，其余提示显示在右上角。
 */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
  );
  const downloads = list.filter((t) => t.tone === 'download');
  const others = list.filter((t) => t.tone !== 'download');
  return (
    <>
      <div aria-live="polite" className="pointer-events-none fixed right-5 top-16 z-50 flex w-[360px] flex-col gap-2">
        {others.map((t) => (
          <ToastCard key={t.id} t={t} />
        ))}
      </div>
      <div aria-live="polite" className="pointer-events-none fixed left-[264px] z-50 flex w-[380px] flex-col gap-2" style={{ bottom: 'calc(var(--flow-dock-h, 0px) + 20px)' }}>
        {downloads.map((t) => (
          <ToastCard key={t.id} t={t} />
        ))}
      </div>
    </>
  );
}

function ToastCard({ t }: { t: ToastItem }) {
  const icon = t.tone === 'success' ? 'checkCircle' : t.tone === 'error' ? 'alertCircle' : t.tone === 'download' ? 'download' : 'alertCircle';
  const color =
    t.tone === 'success' ? 'text-pine-500' : t.tone === 'error' ? 'text-seal-500' : t.tone === 'download' ? 'text-primary-500' : 'text-primary-500';
  return (
    <div className="anim-rise pointer-events-auto flex gap-3 rounded-[14px] bg-white/90 px-4 py-3 shadow-pop ring-1 ring-black/[0.06] backdrop-blur-xl">
      <Icon name={icon} size={18} className={cx('mt-0.5 shrink-0', color)} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-900">{t.title}</div>
        {t.desc ? <div className="mt-0.5 break-all text-xs text-ink-500">{t.desc}</div> : null}
      </div>
    </div>
  );
}
