import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

/* ---------------- Button ---------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'agent';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary-500 text-white hover:bg-[#0077ed] active:bg-primary-600 disabled:bg-ink-200 disabled:text-ink-400',
  secondary: 'bg-black/[0.05] text-ink-900 hover:bg-black/[0.08] active:bg-black/[0.11] disabled:text-ink-300',
  ghost: 'text-primary-500 hover:bg-primary-50 active:bg-primary-100 disabled:text-ink-300',
  danger: 'bg-seal-500 text-white hover:bg-seal-600 active:bg-seal-700 disabled:bg-ink-200',
  agent: 'bg-agent-500 text-white hover:bg-agent-600 active:bg-agent-700 disabled:bg-ink-200',
};
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5 rounded-full',
  md: 'h-9 px-4 text-sm gap-2 rounded-full',
  lg: 'h-11 px-6 text-[15px] gap-2 rounded-full',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cx(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 12 : 14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
      {iconRight ? <Icon name={iconRight} size={size === 'sm' ? 14 : 16} /> : null}
    </button>
  );
});

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin', className)} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Badge / Tag ---------------- */

export type Tone = 'neutral' | 'primary' | 'seal' | 'amber' | 'pine' | 'rule' | 'agent';

const TONE: Record<Tone, string> = {
  neutral: 'bg-black/[0.05] text-ink-600',
  primary: 'bg-primary-50 text-primary-600',
  seal: 'bg-seal-100/70 text-seal-600',
  amber: 'bg-amber-100/80 text-amber-700',
  pine: 'bg-pine-100/80 text-pine-700',
  rule: 'bg-rule-100/70 text-rule-700',
  agent: 'bg-agent-100/80 text-agent-700',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-px text-xs font-medium',
        TONE[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={12} className="shrink-0" /> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** 执行方式标签：代码规则 / 智能体 / 混合 */
export function EngineTag({ engine, className }: { engine: 'code' | 'agent' | 'hybrid'; className?: string }) {
  if (engine === 'code')
    return (
      <Badge tone="rule" icon="code" className={className}>
        确定性规则
      </Badge>
    );
  if (engine === 'agent')
    return (
      <Badge tone="agent" icon="sparkle" className={className}>
        智能体判断
      </Badge>
    );
  return (
    <Badge tone="agent" icon="merge" className={className}>
      规则预筛 + 智能体复核
    </Badge>
  );
}

/* ---------------- Stamp：疑点印章（本原型唯一的“签名”元素） ---------------- */

export function Stamp({ label = '疑点', tone = 'seal', className }: { label?: string; tone?: 'seal' | 'amber' | 'pine'; className?: string }) {
  const color = tone === 'seal' ? 'bg-seal-500 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : 'bg-pine-500 text-white';
  const icon = tone === 'seal' ? 'alertCircle' : tone === 'amber' ? 'help' : 'checkCircle';
  return (
    <span className={cx('anim-fade inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)]', color, className)}>
      <Icon name={icon} size={15} strokeWidth={2} />
      {label}
    </span>
  );
}

/* ---------------- Panel：页面分区容器 ---------------- */

export function Panel({
  title,
  desc,
  actions,
  children,
  className,
  bodyClassName,
  id,
  anchor,
}: {
  title?: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
  /** 全流程演示中用于定位高亮的锚点 */
  anchor?: string;
}) {
  return (
    <section id={id} data-flow-anchor={anchor} className={cx('scroll-mt-16 rounded-[18px] bg-surface shadow-raise ring-1 ring-black/[0.04]', className)}>
      {title || actions ? (
        <header className="flex items-start justify-between gap-4 px-6 pb-1 pt-5">
          <div className="min-w-0">
            {title ? <h2 className="text-[17px] font-semibold text-ink-900">{title}</h2> : null}
            {desc ? <p className="mt-1 text-sm leading-relaxed text-ink-500">{desc}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx('p-6 pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------- Form controls ---------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-500">
        {label}
        {required ? <span className="ml-0.5 text-seal-500">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-seal-600" role="alert">
          <Icon name="alertCircle" size={12} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

const controlBase =
  'h-9 w-full rounded-[10px] border border-black/[0.1] bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-400 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-black/[0.18] focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(controlBase, className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cx(controlBase, 'appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(controlBase, 'h-auto py-2 leading-relaxed', className)} {...rest} />;
}

/* ---------------- Tabs ---------------- */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  className?: string;
}) {
  return (
    <div className={cx('flex', className)}>
      <div role="tablist" className="inline-flex items-center gap-0.5 rounded-[10px] bg-black/[0.055] p-[3px]">
        {items.map((it) => {
          const active = it.value === value;
          return (
            <button
              key={it.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(it.value)}
              className={cx(
                'flex h-8 items-center gap-1.5 rounded-[8px] px-3.5 text-sm transition-[background-color,color,box-shadow] duration-150',
                active ? 'bg-white font-medium text-ink-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {it.label}
              {typeof it.count === 'number' ? <span className={cx('num text-xs', active ? 'text-ink-500' : 'text-ink-400')}>{it.count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Segmented ---------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  items: { value: T; label: ReactNode; disabled?: boolean }[];
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-black/[0.055] p-[3px]" role="radiogroup">
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cx(
              'rounded-[8px] transition-[background-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-50',
              size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-8 px-3.5 text-sm',
              active ? 'bg-white font-medium text-ink-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-ink-600 hover:text-ink-900',
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Modal（原生 dialog，自带焦点管理与 Esc 关闭） ---------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  tone,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  tone?: 'warn';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[86vh] overflow-visible rounded-[22px] bg-transparent p-0 backdrop:bg-black/25 backdrop:backdrop-blur-sm"
      style={{ width }}
    >
      {open ? (
        <div className="anim-rise flex max-h-[86vh] flex-col overflow-hidden rounded-[22px] bg-surface shadow-pop ring-1 ring-black/[0.05]">
          <header className={cx('flex items-center justify-between px-6 pb-2 pt-5', tone === 'warn' ? 'bg-gradient-to-b from-amber-50 to-white' : '')}>
            <h2 id={titleId} className="text-[17px] font-semibold text-ink-900">
              {title}
            </h2>
            <button
              type="button"
              aria-label="关闭"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.05] text-ink-500 transition-colors hover:bg-black/[0.09] hover:text-ink-800"
            >
              <Icon name="x" size={14} strokeWidth={2} />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>
          {footer ? <footer className="flex justify-end gap-2 px-6 pb-5 pt-2">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>,
    document.body,
  );
}

/* ---------------- Drawer ---------------- */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 920,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 'var(--flow-dock-h, 0px)' }} role="dialog" aria-modal="true">
      <div className="anim-fade absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside
        className="anim-slide-right absolute inset-y-2 right-2 flex flex-col overflow-hidden rounded-[22px] bg-paper shadow-pop ring-1 ring-black/[0.06]"
        style={{ width: `min(${width}px, calc(100vw - 16px))` }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/[0.06] bg-white/80 px-7 py-5 backdrop-blur-xl">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-ink-900">{title}</h2>
            {subtitle ? <div className="mt-1 text-sm text-ink-500">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              aria-label="关闭"
              data-demo="drawer-close"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.05] text-ink-500 transition-colors hover:bg-black/[0.09] hover:text-ink-800"
            >
              <Icon name="x" size={15} strokeWidth={2} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/* ---------------- Callout ---------------- */

export function Callout({
  tone = 'primary',
  icon,
  title,
  children,
  className,
  anchor,
}: {
  tone?: 'primary' | 'amber' | 'seal' | 'agent' | 'neutral' | 'pine';
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  anchor?: string;
}) {
  const map = {
    primary: 'bg-primary-50 text-primary-700',
    amber: 'bg-amber-50 text-amber-700',
    seal: 'bg-seal-50 text-seal-700',
    agent: 'bg-agent-50 text-agent-700',
    neutral: 'bg-ink-50 text-ink-600',
    pine: 'bg-pine-50 text-pine-700',
  } as const;
  return (
    <div data-flow-anchor={anchor} className={cx('flex gap-2.5 rounded-[12px] px-4 py-3 text-sm', map[tone], className)}>
      {icon ? <Icon name={icon} size={16} className="mt-0.5 shrink-0" /> : null}
      <div className="min-w-0">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cx(title ? 'mt-0.5' : '', 'leading-relaxed opacity-90')}>{children}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- KV list ---------------- */

export function KV({ items, cols = 2, className }: { items: [ReactNode, ReactNode][]; cols?: 1 | 2 | 3 | 4; className?: string }) {
  const grid = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' }[cols];
  return (
    <dl className={cx('grid gap-x-6 gap-y-2.5', grid, className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-ink-500">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink-800">{v ?? <span className="text-ink-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- Empty ---------------- */

export function Empty({ icon = 'inbox', title, children }: { icon?: IconName; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/[0.04] text-ink-400">
        <Icon name={icon} size={20} />
      </span>
      <div className="text-base font-medium text-ink-800">{title}</div>
      {children ? <div className="max-w-md text-sm text-ink-500">{children}</div> : null}
    </div>
  );
}

/* ---------------- Progress ---------------- */

export function Progress({ value, tone = 'primary', running }: { value: number; tone?: 'primary' | 'agent' | 'rule' | 'pine'; running?: boolean }) {
  const color = { primary: 'bg-primary-500', agent: 'bg-agent-500', rule: 'bg-rule-500', pine: 'bg-pine-500' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cx('h-full rounded-full transition-[width] duration-300 ease-out', color, running && 'bar-running')}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ---------------- Switch ---------------- */

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'bg-[#34c759]' : 'bg-black/[0.12]',
      )}
    >
      <span className={cx('inline-block h-[18px] w-[18px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2)] transition-transform duration-200', checked ? 'translate-x-[18px]' : 'translate-x-[2px]')} />
    </button>
  );
}
