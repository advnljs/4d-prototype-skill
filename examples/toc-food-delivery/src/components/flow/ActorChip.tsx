import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ACTORS, ACTOR_ORDER, type ActorKey } from '@/flow/actors';
import { NECESSITY_LABEL, type Necessity } from '@/flow/workflow';

/** 操作方标签：彩色图标 + 名称（颜色只表示“谁在做”，与疑点/通过等结论色无关） */
export function ActorChip({ actor, size = 'sm', short, iconOnly, className }: { actor: ActorKey; size?: 'xs' | 'sm'; short?: boolean; iconOnly?: boolean; className?: string }) {
  const a = ACTORS[actor];
  return (
    <span
      title={`${a.label}：${a.desc}`}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium text-ink-700',
        size === 'xs' ? 'h-[18px] px-1.5 text-2xs' : 'h-[22px] px-2 text-xs',
        iconOnly && (size === 'xs' ? 'w-[18px] justify-center px-0' : 'w-[22px] justify-center px-0'),
        className,
      )}
      style={{ background: `color-mix(in srgb, ${a.color} 11%, white)`, boxShadow: `inset 0 0 0 0.5px color-mix(in srgb, ${a.color} 35%, transparent)` }}
    >
      <Icon name={a.icon} size={size === 'xs' ? 11 : 12} strokeWidth={2} style={{ color: a.color }} />
      {iconOnly ? <span className="sr-only">{a.label}</span> : short ? a.short : a.label}
    </span>
  );
}

export function ActorDot({ actor, className }: { actor: ActorKey; className?: string }) {
  return <span aria-hidden="true" className={cx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: ACTORS[actor].color }} />;
}

export function ActorLegend({ className, actors = ACTOR_ORDER }: { className?: string; actors?: ActorKey[] }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5', className)}>
      {actors.map((k) => (
        <ActorChip key={k} actor={k} size="xs" />
      ))}
    </div>
  );
}

/** 环节的需求地位：需求必需（实心深色）/ 原型补充 · 可选（虚线框）；未标注的环节不显示 */
export function NecessityTag({ n, short, className }: { n?: Necessity; short?: boolean; className?: string }) {
  if (!n) return null;
  const label = short ? (n === 'required' ? '必需' : '可选') : NECESSITY_LABEL[n];
  return (
    <span
      title={n === 'required' ? '需求明确要求、必须执行的环节' : '原型补充，可选：去掉不影响主流程'}
      className={cx(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-2xs font-medium leading-[16px]',
        n === 'required' ? 'bg-ink-900 text-white' : 'border border-dashed border-ink-400 bg-white text-ink-600',
        className,
      )}
    >
      {label}
    </span>
  );
}
