import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import type { StepKind, TraceStep } from '@/rules/types';

const KIND: Record<StepKind, { label: string; icon: IconName; dot: string; text: string }> = {
  perceive: { label: '感知', icon: 'eye', dot: 'bg-ink-500', text: 'text-ink-600' },
  tool: { label: '工具', icon: 'code', dot: 'bg-rule-500', text: 'text-rule-600' },
  retrieve: { label: '检索', icon: 'search', dot: 'bg-primary-500', text: 'text-primary-600' },
  reason: { label: '推理', icon: 'sparkle', dot: 'bg-agent-500', text: 'text-agent-600' },
  reflect: { label: '自检', icon: 'refresh', dot: 'bg-agent-500', text: 'text-agent-600' },
  verdict: { label: '结论', icon: 'flag', dot: 'bg-ink-800', text: 'text-ink-800' },
  cache: { label: '缓存', icon: 'database', dot: 'bg-ink-400', text: 'text-ink-500' },
};

/** 智能体推理轨迹：每一步的类型、内容、结构化入参/出参、模拟耗时与 token */
export function TraceTimeline({ steps, visible, compact }: { steps: TraceStep[]; visible?: number; compact?: boolean }) {
  const shown = visible === undefined ? steps : steps.slice(0, visible);
  return (
    <ol className="relative">
      {shown.map((s, i) => {
        const k = KIND[s.kind];
        const verdictTone =
          s.kind === 'verdict'
            ? s.io?.find((x) => x.label === 'verdict')?.value === 'fail'
              ? 'text-seal-600'
              : s.io?.find((x) => x.label === 'verdict')?.value === 'warn'
                ? 'text-amber-600'
                : 'text-pine-600'
            : '';
        return (
          <li key={i} className={cx('anim-rise relative flex gap-3', compact ? 'pb-2.5' : 'pb-4')}>
            {i < shown.length - 1 ? <span className="absolute left-[11px] top-6 bottom-0 w-px bg-ink-150" aria-hidden="true" /> : null}
            <span className={cx('relative z-[1] mt-0.5 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full text-white', k.dot)}>
              <Icon name={k.icon} size={12} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className={cx('text-sm font-medium', verdictTone || 'text-ink-900')}>
                  <span className={cx('mr-1.5 text-xs', k.text)}>{k.label}</span>
                  {s.title}
                </div>
                {s.ms !== undefined ? (
                  <span className="num shrink-0 text-2xs text-ink-400">
                    {s.ms >= 1000 ? `${(s.ms / 1000).toFixed(1)}s` : `${s.ms}ms`}
                    {s.tokens ? ` · ${s.tokens} tok` : ''}
                  </span>
                ) : null}
              </div>
              {s.text ? <p className="mt-1 text-sm leading-relaxed text-ink-700">{s.text}</p> : null}
              {s.io?.length ? (
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md bg-ink-50 px-2.5 py-1.5 text-xs">
                  {s.io.map((x, j) => (
                    <div key={j} className="contents">
                      <dt className="whitespace-nowrap text-ink-500">{x.label}</dt>
                      <dd className="code min-w-0 break-all text-ink-800">{x.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
