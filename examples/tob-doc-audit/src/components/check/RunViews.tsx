import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Spinner, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import type { Stage, TickerItem } from '@/agent/pipeline';
import type { TraceStep } from '@/rules/types';
import { ActorChip } from '@/components/flow/ActorChip';
import { vClearTimeout, vSetTimeout } from '@/flow/clock';
import { TraceTimeline } from './TraceTimeline';

/* ---------------- 播放器：按阶段推进演示时间 ---------------- */

export function useRunPlayer(stages: Stage[], runId: number) {
  const offsets = useMemo(() => {
    let acc = 0;
    return stages.map((s) => {
      const start = acc;
      acc += s.ms;
      return { start, end: acc };
    });
  }, [stages]);
  const total = offsets.length ? offsets[offsets.length - 1].end : 0;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    setT(0);
    setPlaying(true);
  }, [runId]);
  useEffect(() => {
    if (!playing || t >= total || !total) return;
    // 走演示虚拟时钟：随全局播放速度加快/放慢，全流程暂停时停住
    const id = vSetTimeout(() => setT((x) => Math.min(total, x + 80)), 80);
    return () => vClearTimeout(id);
  }, [playing, t, total]);
  const active = offsets.findIndex((o) => t < o.end);
  return {
    t,
    total,
    done: total > 0 && t >= total,
    active: active === -1 ? stages.length : active,
    progress: (i: number) => {
      const o = offsets[i];
      if (!o) return 0;
      return Math.max(0, Math.min(1, (t - o.start) / Math.max(1, o.end - o.start)));
    },
    playing,
    toggle: () => setPlaying((p) => !p),
    skip: () => setT(total),
    replay: () => {
      setT(0);
      setPlaying(true);
    },
  };
}

export type Player = ReturnType<typeof useRunPlayer>;

const ENGINE_LABEL: Record<Stage['engine'], { label: string; cls: string }> = {
  code: { label: '确定性', cls: 'text-rule-600 bg-rule-50' },
  agent: { label: '智能体', cls: 'text-agent-600 bg-agent-50' },
  mixed: { label: '规则+智能体', cls: 'text-agent-600 bg-agent-50' },
  rpa: { label: 'RPA', cls: 'text-primary-600 bg-primary-50' },
};

/* ---------------- 流水线 ---------------- */

export function PipelineView({ stages, player }: { stages: Stage[]; player: Player }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <ol className="space-y-1">
      {stages.map((s, i) => {
        const state = player.done || i < player.active ? 'done' : i === player.active ? 'running' : 'waiting';
        const p = player.progress(i);
        const open = state === 'running' || (state === 'done' && expanded.has(s.key));
        const shownLines = !open ? 0 : state === 'done' ? s.lines.length : Math.max(1, Math.ceil(p * s.lines.length));
        const e = ENGINE_LABEL[s.engine];
        return (
          <li
            key={s.key}
            className={cx(
              'rounded-lg border px-3.5 py-2.5 transition-[background-color,border-color] duration-200',
              state === 'running' ? 'border-primary-100 bg-primary-50/70' : 'border-transparent',
              s.skipped && state !== 'waiting' && 'opacity-60',
            )}
          >
            <div
              className={cx('flex items-center gap-2.5', state === 'done' && 'cursor-pointer')}
              role={state === 'done' ? 'button' : undefined}
              tabIndex={state === 'done' ? 0 : undefined}
              aria-expanded={state === 'done' ? open : undefined}
              onClick={() => {
                if (state !== 'done') return;
                setExpanded((x) => {
                  const n = new Set(x);
                  if (n.has(s.key)) n.delete(s.key);
                  else n.add(s.key);
                  return n;
                });
              }}
              onKeyDown={(e) => {
                if (state === 'done' && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).click();
                }
              }}
            >
              <span
                className={cx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                  state === 'done' ? 'bg-pine-500 text-white' : state === 'running' ? 'bg-primary-500 text-white' : 'bg-ink-100 text-ink-500',
                )}
              >
                {state === 'done' ? <Icon name="check" size={13} strokeWidth={2.4} /> : state === 'running' ? <Spinner size={12} /> : i + 1}
              </span>
              <span className={cx('text-sm font-medium', state === 'waiting' ? 'text-ink-500' : 'text-ink-900')}>{s.title}</span>
              <span className={cx('rounded px-1.5 text-2xs leading-[18px]', e.cls)}>{e.label}</span>
              {s.actor && s.actor !== 'agent' ? <ActorChip actor={s.actor} size="xs" short /> : null}
              <span className="num ml-auto text-xs text-ink-500">{state === 'done' ? s.summary : state === 'running' ? `${Math.round(p * 100)}%` : ''}</span>
              {state === 'done' ? <Icon name="chevronDown" size={13} className={cx('shrink-0 text-ink-400 transition-transform duration-150', !open && '-rotate-90')} /> : null}
            </div>
            {shownLines > 0 ? (
              <ul className="ml-[34px] mt-1.5 space-y-0.5">
                {s.lines.slice(0, shownLines).map((l, k) => (
                  <li key={k} className="anim-fade flex gap-1.5 text-xs leading-5 text-ink-600">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-300" />
                    <span className="min-w-0">{l}</span>
                  </li>
                ))}
                {s.real && state === 'done' ? <li className="text-2xs text-ink-400">估算真实耗时 {s.real}</li> : null}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- 智能体工作台：运行中展示“正在想什么” ---------------- */

export function AgentConsole({
  stages,
  player,
  focus,
  ticker,
  mode,
  total,
}: {
  stages: Stage[];
  player: Player;
  focus?: { docNo: string; rule: string; steps: TraceStep[] };
  ticker: TickerItem[];
  mode: 'batch' | 'online';
  total: number;
}) {
  const agentIdx = stages.findIndex((s) => s.key === 'agent');
  const inAgent = player.active === agentIdx;
  const afterAgent = player.active > agentIdx || player.done;
  const p = agentIdx >= 0 ? player.progress(agentIdx) : 0;
  const shownTicker = afterAgent ? ticker.length : inAgent ? Math.floor(p * ticker.length) : 0;
  const steps = focus?.steps ?? [];
  const shownSteps = afterAgent ? steps.length : inAgent ? Math.min(steps.length, Math.ceil(p * 1.6 * steps.length)) : 0;
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [shownTicker]);
  const processed = mode === 'online' && inAgent ? Math.floor(p * total) : afterAgent ? total : 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cx('flex h-7 w-7 items-center justify-center rounded-md', inAgent ? 'bg-agent-500 text-white' : 'bg-agent-50 text-agent-600')}>
            <Icon name="sparkle" size={15} />
          </span>
          <div>
            <div className="text-sm font-semibold text-ink-900">智能体工作台</div>
            <div className="text-xs text-ink-500">
              {inAgent ? (mode === 'online' ? `逐笔调用中：第 ${processed} / ${total} 笔` : '批量判定中：按组合并发调用') : afterAgent ? '语义核查完成' : '等待确定性规则与归并完成…'}
            </div>
          </div>
        </div>
        {inAgent ? <span className="anim-pulse h-2 w-2 rounded-full bg-agent-500" aria-hidden="true" /> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-agent-100 bg-surface">
        <div className="flex items-center justify-between border-b border-agent-100 bg-agent-50/60 px-3.5 py-2">
          <span className="text-xs font-medium text-agent-700">推理轨迹示例{focus ? `：${focus.rule}` : ''}</span>
          {focus ? <span className="code text-2xs text-ink-500">{focus.docNo}</span> : null}
        </div>
        <div className="max-h-[330px] overflow-y-auto px-3.5 pt-3">
          {shownSteps ? <TraceTimeline steps={steps} visible={shownSteps} compact /> : <p className="pb-4 text-sm text-ink-400">智能体阶段开始后，这里实时展示一笔记录的完整推理过程。</p>}
        </div>
      </div>

      <div className="rounded-[14px] border border-black/[0.07] bg-surface">
        <div className="flex items-center justify-between border-b border-black/[0.05] px-3.5 py-2">
          <span className="text-xs font-medium text-ink-700">判定流</span>
          <span className="num text-2xs text-ink-500">
            {shownTicker}/{ticker.length}
          </span>
        </div>
        <ul ref={listRef} className="h-[180px] space-y-1 overflow-y-auto px-3.5 py-2">
          {ticker.slice(0, shownTicker).map((it) => (
            <li key={it.key} className="anim-fade flex items-start gap-2 text-xs leading-5">
              <Badge tone={it.verdict === 'fail' ? 'seal' : it.verdict === 'warn' ? 'amber' : 'agent'} className="mt-px shrink-0">
                {it.verdict === 'fail' ? '疑点' : it.verdict === 'warn' ? '待确认' : '拦截'}
              </Badge>
              <span className="code shrink-0 text-ink-400">{it.docNo.slice(-8)}</span>
              <span className="min-w-0 text-ink-700">
                <span className="font-medium text-ink-900">{it.rule}</span> {it.text}
              </span>
            </li>
          ))}
          {!shownTicker ? <li className="text-xs text-ink-400">暂无判定</li> : null}
        </ul>
      </div>
    </div>
  );
}

export function PlayerControls({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-2">
      <span className="num text-xs text-ink-500">
        演示 {(player.t / 1000).toFixed(1)}s / {(player.total / 1000).toFixed(1)}s
      </span>
      {player.done ? (
        <Button size="sm" icon="refresh" onClick={player.replay}>
          回放过程
        </Button>
      ) : (
        <>
          <Button size="sm" icon={player.playing ? 'pause' : 'play'} onClick={player.toggle}>
            {player.playing ? '暂停' : '继续'}
          </Button>
          <Button size="sm" icon="skip" onClick={player.skip}>
            跳过动画
          </Button>
        </>
      )}
    </div>
  );
}
