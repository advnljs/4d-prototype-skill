import { Fragment, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import { CHANGE_LABEL, type Change, type LStage } from '@/flow/lineage';
import { ActorChip } from './ActorChip';

const CHANGE_CLS: Record<Change, string> = {
  keep: 'bg-black/[0.05] text-ink-500',
  map: 'bg-primary-50 text-primary-600',
  derive: 'bg-rule-50 text-rule-700',
  new: 'bg-pine-50 text-pine-700',
  mask: 'bg-amber-50 text-amber-700',
  drop: 'bg-black/[0.04] text-ink-400 line-through',
};

/** 数据流转：阶段链 + “上一阶段 → 当前阶段”结构对比（字段标注变化方式） */
export function LineageView({ stages, compact, initial = 0 }: { stages: LStage[]; compact?: boolean; initial?: number }) {
  const [idx, setIdx] = useState(Math.min(initial, stages.length - 1));
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      if (idx >= stages.length - 1) setPlaying(false);
      else setIdx(idx + 1);
    }, 2600);
    return () => window.clearTimeout(id);
  }, [playing, idx, stages.length]);
  const cur = stages[idx];
  const prev = idx > 0 ? stages[idx - 1] : null;
  if (!cur) return null;
  return (
    <div>
      <div className="flex items-center gap-2">
        <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-y-1.5">
          {stages.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 ? <Icon name="chevronRight" size={12} className="mx-0.5 shrink-0 text-ink-300" /> : null}
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setIdx(i);
                    setPlaying(false);
                  }}
                  aria-current={i === idx ? 'step' : undefined}
                  className={cx(
                    'flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-left transition-[background-color,box-shadow] duration-150',
                    compact ? 'text-2xs' : 'text-xs',
                    i === idx ? 'bg-white font-medium text-ink-900 shadow-raise ring-1 ring-black/[0.06]' : i < idx ? 'text-ink-600 hover:bg-black/[0.04]' : 'text-ink-400 hover:bg-black/[0.04]',
                  )}
                >
                  <span className="num flex h-[18px] w-[18px] items-center justify-center rounded-full text-2xs font-semibold text-white" style={{ background: ACTORS[s.actor].color, opacity: i <= idx ? 1 : 0.4 }}>
                    {i + 1}
                  </span>
                  {s.title}
                </button>
              </li>
            </Fragment>
          ))}
        </ol>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" icon="chevronLeft" aria-label="上一阶段" disabled={idx === 0} onClick={() => setIdx(idx - 1)} />
          <Button size="sm" variant="ghost" icon="chevronRight" aria-label="下一阶段" disabled={idx >= stages.length - 1} onClick={() => setIdx(idx + 1)} />
          <Button
            size="sm"
            icon={playing ? 'pause' : 'play'}
            onClick={() => {
              if (!playing && idx >= stages.length - 1) setIdx(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? '暂停' : '逐步播放'}
          </Button>
        </div>
      </div>

      <div className={cx('mt-3 grid gap-4', compact ? 'grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]' : 'grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]')}>
        <StageCard s={prev} dim label="上一阶段" compact={compact} />
        <StageCard key={cur.key} s={cur} label={`第 ${idx + 1} 阶段`} compact={compact} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-2xs text-ink-500">
        字段变化：
        {(Object.keys(CHANGE_LABEL) as Change[]).map((c) => (
          <span key={c} className={cx('rounded px-1.5 py-px font-medium', CHANGE_CLS[c])}>
            {CHANGE_LABEL[c]}
          </span>
        ))}
      </div>
    </div>
  );
}

function StageCard({ s, dim, label, compact }: { s: LStage | null; dim?: boolean; label: string; compact?: boolean }) {
  if (!s)
    return (
      <div className="flex items-center justify-center self-start rounded-[14px] border border-dashed border-black/[0.1] px-4 py-8 text-sm text-ink-400">
        <Icon name="inbox" size={16} className="mr-1.5" />
        数据起点（外部系统）
      </div>
    );
  return (
    <section className={cx('anim-fade self-start rounded-[14px] border bg-surface', dim ? 'border-black/[0.05] opacity-75' : 'border-primary-100 shadow-raise')}>
      <header className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] px-4 py-2.5">
        <span className="text-2xs text-ink-400">{label}</span>
        <span className="text-sm font-semibold text-ink-900">{s.title}</span>
        <span className="code rounded-[6px] bg-ink-50 px-1.5 py-px text-[12px] text-agent-700">{s.type}</span>
        <span className="ml-auto">
          <ActorChip actor={s.actor} size="xs" />
        </span>
      </header>
      <p className="px-4 pt-2 text-xs leading-relaxed text-ink-600">{s.summary}</p>
      <table className="mt-1 w-full table-fixed text-xs">
        <colgroup>
          <col className={compact ? 'w-[34%]' : 'w-[32%]'} />
          <col />
          {!dim ? <col className="w-[72px]" /> : null}
        </colgroup>
        <tbody className="divide-y divide-black/[0.04] align-top">
          {s.fields.map((f, i) => (
            <tr key={`${f.k}-${i}`}>
              <td className="code truncate px-4 py-1.5 text-ink-600" title={f.k}>
                {f.k}
              </td>
              <td className="px-2 py-1.5">
                <div className={cx('break-all leading-5', f.change === 'drop' ? 'text-ink-400 line-through' : f.change === 'mask' ? 'text-amber-700' : 'text-ink-900')}>{f.v}</div>
                {f.note && !dim ? <div className="text-2xs leading-4 text-ink-400">{f.note}</div> : null}
              </td>
              {!dim ? (
                <td className="px-3 py-1.5 text-right">
                  <span className={cx('whitespace-nowrap rounded px-1.5 py-px text-2xs font-medium', CHANGE_CLS[f.change])}>{CHANGE_LABEL[f.change]}</span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {s.more ? <p className="px-4 pb-2.5 pt-1 text-2xs text-ink-400">{s.more}</p> : <div className="pb-1.5" />}
    </section>
  );
}
