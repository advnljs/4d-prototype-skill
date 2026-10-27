import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Modal, Segmented, Spinner, cx } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import type { DataKey } from '@/flow/dataObjects';
import { closeFlowStart, flowPrefs, flowStore, goToStep, readyNow, startFlow, stepStateOf, useFlow, type FlowMode, type FlowState, type StepState } from '@/flow/director';
import { EDGES, PHASES, STEPS, STEP_INDEX, depsOf, levelOf, stepById, stepsForRoute, succOf, type FlowStep, type PhaseKey, type StepId } from '@/flow/workflow';
import { href, useRoute } from '@/lib/router';
import { useStore } from '@/lib/store';
import { USERS } from '@/state/session';
import { SCENARIOS, type ScenarioKey } from '@/sim/scenarios';
import { liveStore, setScenario } from '@/state/live';
import { ActorChip, ActorDot, NecessityTag } from './ActorChip';
import { DataChip, useDataModal } from './DataObject';
import { MiniDag } from './FlowDag';
import { DemoCursor } from './DemoCursor';
import { HUMAN, cursorHover, hideCursor } from '@/flow/cursor';
import { SpeedControl, usePlaybackHotkeys } from './PlaybackControls';

/**
 * 全局浮动的全流程导航（左下角）：
 * - 未演示时：显示当前页面在整体工作流中的位置，可点任一环节跳转（自动切换角色）；
 * - 演示时：显示当前环节、子步骤进度、操作方、时点与数据输入输出，并提供暂停 / 上一环节 / 下一环节。
 */
export function FlowNavigator() {
  const f = useFlow((s) => s);
  const panel = useStore(flowPrefs, (p) => p.panel);
  const { path, query } = useRoute();
  const here = stepsForRoute(path, query.get('tab'));
  const hereIdx = here.length ? STEP_INDEX[(here.find((h) => h.exact) ?? here[0]).step.id] : -1;
  const curIdx = f.active ? f.idx : f.focus ? STEP_INDEX[f.focus] : hereIdx;
  const data = useDataModal();
  useSpotlight();
  usePlaybackHotkeys(f.active);

  return (
    <>
      {panel === 'open' ? (
        <Expanded f={f} curIdx={curIdx} hereIds={here.map((h) => h.step.id)} onData={data.open} />
      ) : (
        <Compact f={f} curIdx={curIdx} inFlow={here.length > 0} path={path} hereIds={here.map((h) => h.step.id)} />
      )}
      <FlowStartModal open={f.startOpen} />
      <DemoCursor />
      {data.modal}
    </>
  );
}

/* ---------------- 折叠态 ---------------- */

function Compact({ f, curIdx, inFlow, path, hereIds }: { f: FlowState; curIdx: number; inFlow: boolean; path: string; hereIds: StepId[] }) {
  const step = curIdx >= 0 ? STEPS[curIdx] : null;
  return (
    <aside aria-label="全流程导航" className="anim-rise fixed bottom-3 left-3 z-[45] w-[224px] rounded-[16px] bg-surface/90 p-3 shadow-pop ring-1 ring-ink-950/[0.06] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
          <Icon name="route" size={14} className="text-primary-500" />
          全流程导航
        </span>
        <button type="button" aria-label="展开全流程导航" onClick={() => flowPrefs.set({ panel: 'open' })} className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/[0.05] text-ink-600 hover:bg-ink-950/[0.09]">
          <Icon name="chevronUp" size={13} strokeWidth={2} />
        </button>
      </div>
      {step ? (
        <button type="button" onClick={() => flowPrefs.set({ panel: 'open' })} className="mt-2 block w-full text-left">
          <div className="num text-2xs text-ink-500">
            环节 {curIdx + 1} · 第 {levelOf(step.id) + 1} 层 · {PHASES.find((p) => p.key === step.phase)?.title.split('：')[0]}
            {f.active ? ` · 已完成 ${f.completed.length + f.assumed.length}/${STEPS.length}` : ''}
          </div>
          <div className="mt-0.5 truncate text-[13px] font-semibold text-ink-900">{step.short}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <ActorChip actor={step.actor} size="xs" short />
            <span className="num text-2xs text-ink-500">{step.when}</span>
            {f.active ? <StatusPill f={f} /> : <span className="ml-auto text-2xs text-ink-400">你在这里</span>}
          </div>
        </button>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{inFlow ? '' : path === '/flow' ? '这里是全流程总览：点依赖图中的环节查看详情，或一键运行。' : '当前页面不在主流程中（讨论区页面）。'}</p>
      )}
      <div className="mt-2">
        <MiniDag f={f} current={step?.id ?? null} here={hereIds} width={200} height={54} />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {f.active ? <PlaybackHint /> : <StartButtons compact />}
      </div>
    </aside>
  );
}

function StatusPill({ f }: { f: FlowState }) {
  const [label, tone] = f.status === 'finished' ? ['已完成', 'pine'] : f.paused ? ['已暂停', 'amber'] : f.status === 'step-done' ? (f.mode === 'step' ? ['待下一环节', 'primary'] : ['即将继续', 'primary']) : ['运行中', 'primary'];
  return (
    <span className={cx('ml-auto inline-flex items-center gap-1 text-2xs font-medium', tone === 'pine' ? 'text-pine-600' : tone === 'amber' ? 'text-amber-600' : 'text-primary-600')}>
      {f.status === 'running' && !f.paused ? <span className="anim-pulse h-1.5 w-1.5 rounded-full bg-primary-500" /> : null}
      {label}
    </span>
  );
}

function StartButtons({ compact }: { compact?: boolean }) {
  return (
    <>
      <Button size="sm" variant="primary" icon="play" onClick={() => flowStore.set({ startOpen: true })} className={compact ? 'flex-1' : ''}>
        一键运行完整流程
      </Button>
      {!compact ? (
        <a href={href('/flow')} className="inline-flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium text-primary-500 hover:bg-primary-50">
          全流程总览
          <Icon name="arrowRight" size={13} />
        </a>
      ) : null}
    </>
  );
}

/* ---------------- 展开态 ---------------- */

function Expanded({ f, curIdx, hereIds, onData }: { f: FlowState; curIdx: number; hereIds: string[]; onData: (k: DataKey) => void }) {
  // 演示中“流程 · 数据”窗口展开时已有详细依赖图，这里不再重复缩略图
  const dockOpen = useStore(flowPrefs, (p) => (p.dock ?? 'open') === 'open');
  const curPhase = curIdx >= 0 ? STEPS[curIdx].phase : null;
  const [openPhases, setOpenPhases] = useState<Set<PhaseKey>>(() => new Set(curPhase ? [curPhase] : ['prep']));
  useEffect(() => {
    if (curPhase) setOpenPhases((s) => (s.has(curPhase) ? s : new Set([...s, curPhase])));
  }, [curPhase]);
  // 当前环节滚动到可见
  useEffect(() => {
    if (curIdx < 0) return;
    document.getElementById(`flow-nav-${STEPS[curIdx].id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [curIdx, f.sub]);

  return (
    <aside aria-label="全流程导航" className="anim-rise fixed bottom-3 left-3 z-[45] flex max-h-[calc(100vh-76px)] w-[408px] flex-col overflow-hidden rounded-[20px] bg-surface/[0.94] shadow-pop ring-1 ring-ink-950/[0.06] backdrop-blur-xl">
      <header className="shrink-0 border-b border-ink-950/[0.06] px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <Icon name="route" size={16} className="text-primary-500" />
          <h2 className="text-[15px] font-semibold text-ink-900">全流程导航</h2>
          {f.active ? <StatusPill f={f} /> : <span className="ml-auto text-2xs text-ink-400">浏览模式</span>}
          <button type="button" aria-label="收起全流程导航" onClick={() => flowPrefs.set({ panel: 'compact' })} className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-950/[0.05] text-ink-600 hover:bg-ink-950/[0.09]">
            <Icon name="chevronDown" size={13} strokeWidth={2} />
          </button>
        </div>
        {f.active ? (
          <>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="num text-xs text-ink-600">
                已完成 {f.completed.length}
                {f.assumed.length ? `（+视为完成 ${f.assumed.length}）` : ''}/{STEPS.length} · 可执行 {readyNow(f).length} · <Elapsed f={f} />
              </span>
            </div>
            {dockOpen ? null : (
              <div className="mt-2.5">
                <MiniDag f={f} current={curIdx >= 0 ? STEPS[curIdx].id : null} width={376} height={78} />
              </div>
            )}
            <div className="mt-2">
              <PlaybackHint />
            </div>
            <ReadyChoices f={f} />
            {f.left && f.paused ? (
              <p className="mt-2 rounded-[10px] bg-amber-50 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700">你离开了当前环节的页面，演示已暂停。点“继续”回到该环节重新执行。</p>
            ) : null}
            {f.status === 'finished' ? <Finished f={f} /> : null}
          </>
        ) : (
          <>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{STEPS.length} 个环节按依赖关系组成 DAG：上游完成后下游才能执行，没有依赖的分支（商家备餐与智能派单）可并行。点击任一环节可跳转（自动切换演示角色）；一键运行按依赖自动调度。</p>
            <div className="mt-2.5">
              <MiniDag f={f} current={curIdx >= 0 ? STEPS[curIdx].id : null} here={hereIds as StepId[]} width={376} height={78} />
            </div>
            <SpeedRow />
            <div className="mt-2.5 flex items-center gap-1.5">
              <StartButtons />
            </div>
          </>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
        {PHASES.map((p, pi) => {
          const steps = STEPS.filter((s) => s.phase === p.key);
          const open = openPhases.has(p.key);
          const done = steps.filter((s) => f.active && (f.completed.includes(s.id) || f.assumed.includes(s.id))).length;
          return (
            <section key={p.key} className="mb-1">
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setOpenPhases((s) => {
                    const n = new Set(s);
                    if (n.has(p.key)) n.delete(p.key);
                    else n.add(p.key);
                    return n;
                  })
                }
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-ink-950/[0.03]"
              >
                <Icon name="chevronRight" size={12} className={cx('shrink-0 text-ink-400 transition-transform duration-150', open && 'rotate-90')} />
                <span className="num text-2xs font-semibold text-ink-400">阶段 {pi + 1}</span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-800">{p.title}</span>
                <span className="num shrink-0 text-2xs text-ink-400">{f.active ? `${done}/${steps.length}` : p.when}</span>
              </button>
              {open ? (
                <ol className="mt-0.5 space-y-0.5">
                  {steps.map((s) => (
                    <StepRow key={s.id} s={s} f={f} current={STEP_INDEX[s.id] === curIdx} here={!f.active && hereIds.includes(s.id)} onData={onData} />
                  ))}
                </ol>
              ) : null}
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function StepRow({ s, f, current, here, onData }: { s: FlowStep; f: FlowState; current: boolean; here: boolean; onData: (k: DataKey) => void }) {
  const i = STEP_INDEX[s.id];
  const state = stepStateOf(f, s.id);
  const done = state === 'done';
  const running = state === 'running';
  return (
    <li id={`flow-nav-${s.id}`} className={cx('rounded-[12px] transition-colors duration-200', current ? 'bg-primary-50/80 ring-1 ring-primary-100' : '')}>
      <button
        type="button"
        onClick={() => goToStep(s.id)}
        title={f.active ? (state === 'ready' ? '执行此环节（上游已完成）' : '跳到此环节（未完成的上游视为完成）') : `打开此环节页面（切换为${USERS[s.role].roleName}）`}
        className="flex w-full items-center gap-2 rounded-[12px] px-2 py-1.5 text-left hover:bg-ink-950/[0.03]"
      >
        <span
          className={cx(
            'num flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
            done ? 'bg-pine-500 text-white' : running ? 'bg-primary-500 text-white' : state === 'assumed' ? 'border border-dashed border-ink-400 text-ink-500' : state === 'ready' ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300' : current ? 'bg-primary-100 text-primary-700' : 'bg-ink-100 text-ink-500',
          )}
        >
          {(done || state === 'assumed') && !current ? <Icon name="check" size={11} strokeWidth={2.6} /> : running ? <Spinner size={10} /> : i + 1}
        </span>
        <span className={cx('min-w-0 flex-1 truncate text-[13px]', current ? 'font-semibold text-ink-900' : 'text-ink-700', s.necessity === 'optional' && !current && 'text-ink-500')}>{s.short}</span>
        <NecessityTag n={s.necessity} short />
        {here ? <span className="shrink-0 rounded-full bg-primary-500 px-1.5 text-2xs leading-[16px] text-white">本页</span> : null}
        {state === 'ready' && !current ? <span className="shrink-0 text-2xs font-medium text-primary-600">可执行</span> : null}
        {state === 'assumed' ? <span className="shrink-0 text-2xs text-ink-400">视为完成</span> : null}
        <ActorChip actor={s.actor} size="xs" iconOnly />
        <span className="num w-[60px] shrink-0 truncate text-right text-2xs text-ink-400">{s.when}</span>
      </button>
      {current ? <StepDetail s={s} f={f} onData={onData} /> : null}
    </li>
  );
}

function StepDetail({ s, f, onData }: { s: FlowStep; f: FlowState; onData: (k: DataKey) => void }) {
  const active = f.active;
  const finishedStep = active && (f.status === 'step-done' || f.status === 'finished' || f.completed.includes(s.id));
  return (
    <div className="anim-fade space-y-2.5 px-2.5 pb-3 pt-0.5">
      <div className="text-xs font-medium leading-relaxed text-ink-900">{s.title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={s.trigger === '定时调度' ? 'rule' : s.trigger === '自动衔接' ? 'agent' : s.trigger === '外部提交' ? 'neutral' : 'primary'} icon={s.trigger === '定时调度' ? 'clock' : s.trigger === '自动衔接' ? 'zap' : s.trigger === '外部提交' ? 'globe' : 'cursor'}>
          {s.trigger}
        </Badge>
        <span className="num text-2xs text-ink-500">时点 {s.when}</span>
        <span className="text-2xs text-ink-500">· 演示角色：{USERS[s.role].roleName}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink-600">{s.narration}</p>
      {s.necessity ? (
        <div className={cx('rounded-[10px] px-2.5 py-2 text-xs leading-relaxed', s.necessity === 'required' ? 'bg-ink-900/[0.05] text-ink-800' : 'border border-dashed border-ink-300 text-ink-600')}>
          <NecessityTag n={s.necessity} className="mr-1.5 align-[1px]" />
          {s.basis}
        </div>
      ) : null}
      <DepLinks s={s} f={f} />
      <ol className="space-y-1 rounded-[10px] bg-surface/80 px-2.5 py-2 ring-1 ring-ink-950/[0.05]">
        {s.subs.map((x, k) => {
          const st = !active ? 'idle' : finishedStep || k < f.sub ? 'done' : k === f.sub ? 'cur' : 'todo';
          return (
            <li key={k} className="flex items-center gap-2 text-xs leading-5">
              <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {st === 'done' ? <Icon name="check" size={12} strokeWidth={2.4} className="text-pine-500" /> : st === 'cur' ? <Spinner size={11} /> : <ActorDot actor={x.actor} />}
              </span>
              <span className={cx('min-w-0 flex-1', st === 'cur' ? 'font-medium text-ink-900' : st === 'todo' ? 'text-ink-400' : 'text-ink-700')}>{x.title}</span>
              <span className="shrink-0 text-2xs" style={{ color: ACTORS[x.actor].color }}>
                {ACTORS[x.actor].short}
              </span>
            </li>
          );
        })}
      </ol>
      {s.inputs.length || s.outputs.length ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-2xs text-ink-500">数据</span>
          {s.inputs.length ? s.inputs.map((k) => <DataChip key={`i-${k}`} k={k} onOpen={onData} />) : <span className="text-2xs text-ink-400">外部来源</span>}
          <Icon name="arrowRight" size={12} className="mx-0.5 text-ink-300" />
          {s.outputs.map((k) => (
            <DataChip key={`o-${k}`} k={k} onOpen={onData} tone="out" />
          ))}
        </div>
      ) : null}
      {s.machine ? (
        <p className="flex gap-1.5 text-xs leading-relaxed text-agent-700">
          <Icon name="cpu" size={13} className="mt-[3px] shrink-0" />
          <span>系统：{s.machine}</span>
        </p>
      ) : null}
      {s.human ? (
        <p className="flex gap-1.5 text-xs leading-relaxed text-primary-700">
          <Icon name="user" size={13} className="mt-[3px] shrink-0" />
          <span>人工把关：{s.human}</span>
        </p>
      ) : null}
      {!active ? (
        <div className="flex gap-1.5 pt-0.5">
          <Button size="sm" icon="play" onClick={() => void startFlow({ mode: 'auto', reset: false, from: s.id })}>
            从此环节开始演示
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** 播放控制已集中到底部“流程 · 数据”窗口 */
function PlaybackHint() {
  return (
    <p className="flex items-center gap-1.5 text-2xs leading-relaxed text-ink-500">
      <Icon name="play" size={12} className="shrink-0 text-ink-400" />
      播放控制在底部“流程 · 数据”窗口；空格 暂停 / 继续，[ ] 调速度
    </p>
  );
}

function SpeedRow() {
  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-ink-600">
        <Icon name="clock" size={13} className="text-ink-400" />
        播放速度
        <span className="text-2xs text-ink-400">快捷键 [ ]</span>
      </span>
      <SpeedControl />
    </div>
  );
}

const STATE_TONE: Record<StepState, string> = {
  idle: 'text-ink-700',
  running: 'text-primary-600',
  done: 'text-pine-600',
  assumed: 'text-ink-400',
  ready: 'text-primary-600',
  waiting: 'text-ink-500',
};

/** 上游依赖（必须先完成）与下游（等待本环节） */
function DepLinks({ s, f }: { s: FlowStep; f: FlowState }) {
  const ups = depsOf(s.id);
  const downs = succOf(s.id);
  const row = (label: string, ids: StepId[], dir: 'up' | 'down') => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-8 shrink-0 text-2xs text-ink-500">{label}</span>
      {ids.length ? (
        ids.map((id) => {
          const e = EDGES.find((x) => (dir === 'up' ? x.from === id && x.to === s.id : x.from === s.id && x.to === id))!;
          return (
            <button
              key={id}
              type="button"
              onClick={() => goToStep(id)}
              title={`${e.label}${e.data ? '' : '（时序依赖）'}`}
              className={cx('inline-flex h-[20px] items-center gap-1 rounded-full bg-surface px-1.5 text-2xs ring-1 ring-ink-950/[0.06] hover:ring-primary-300', STATE_TONE[stepStateOf(f, id)])}
            >
              <span className="num font-semibold">{STEP_INDEX[id] + 1}</span>
              {stepById(id).short}
              <span className="text-ink-400">· {e.label}</span>
            </button>
          );
        })
      ) : (
        <span className="text-2xs text-ink-400">{dir === 'up' ? '无（可直接启动）' : '无（流程终点）'}</span>
      )}
    </div>
  );
  return (
    <div className="space-y-1">
      {row('上游', ups, 'up')}
      {row('下游', downs, 'down')}
    </div>
  );
}

/** 逐步演示 / 暂停时：列出全部可执行环节（并行分支），由人选择 */
function ReadyChoices({ f }: { f: FlowState }) {
  if (f.status !== 'step-done' || (f.mode === 'auto' && !f.paused)) return null;
  const ready = readyNow(f);
  if (!ready.length) return null;
  return (
    <div className="mt-2.5 rounded-[12px] bg-primary-50/70 px-2.5 py-2">
      <div className="text-2xs font-medium text-primary-700">可执行的环节（上游已完成，可任选分支）</div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {ready.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => goToStep(id)}
            className={cx('inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition-colors', i === 0 ? 'bg-primary-500 text-white hover:bg-primary-600' : 'bg-surface text-ink-800 ring-1 ring-ink-950/[0.08] hover:bg-ink-50')}
          >
            <span className="num">{STEP_INDEX[id] + 1}</span>
            {stepById(id).short}
            {i === 0 ? <span className="text-2xs opacity-80">推荐</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Elapsed({ f }: { f: FlowState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (f.status === 'finished') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [f.status]);
  const ms = (f.status === 'finished' ? f.finishedAt : now) - f.startedAt;
  const sec = Math.max(0, Math.round(ms / 1000));
  return <span>用时 {`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`}</span>;
}

function Finished({ f }: { f: FlowState }) {
  return (
    <div className="mt-2.5 rounded-[12px] bg-pine-50 px-3 py-2.5 text-xs leading-relaxed text-pine-700">
      <div className="flex items-center gap-1.5 font-semibold">
        <Icon name="checkCircle" size={14} />
        完整流程演示完成：执行 {f.completed.length} 个环节{f.assumed.length ? `，视为完成 ${f.assumed.length} 个` : ''}，共 {STEPS.length} 个
      </div>
      <p className="mt-1 text-pine-700/90">
        点击依赖图或上方列表中的任一环节可单独重放，放完回到“已完成”。回看各环节的操作方与数据变化，可打开
        <a href={href('/flow')} className="mx-1 font-medium underline">
          全流程总览
        </a>
        查看依赖图、泳道时序与数据流转。
      </p>
    </div>
  );
}

/* ---------------- 开始弹窗 ---------------- */

function FlowStartModal({ open }: { open: boolean }) {
  const [mode, setMode] = useState<FlowMode>('auto');
  const [reset, setReset] = useState(true);
  const [scenario, setScen] = useState<ScenarioKey>(() => liveStore.get().scenario);
  useEffect(() => {
    if (open) setScen(liveStore.get().scenario);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={closeFlowStart}
      width={640}
      title="一键运行完整流程"
      footer={
        <>
          <Button onClick={closeFlowStart}>取消</Button>
          <Button
            variant="primary"
            icon="play"
            onClick={() => {
              closeFlowStart();
              if (scenario !== liveStore.get().scenario) setScenario(scenario);
              void startFlow({ mode, reset });
            }}
          >
            开始演示
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-700">
          按依赖关系自动执行 {STEPS.length} 个环节：自动切换演示角色、打开对应页面，由演示光标在三台手机和后台上完成人工操作，平台服务、智能调度、定时任务与支付网关的部分自动运行。左下角导航实时显示当前环节、子步骤、操作方与数据输入输出。1× 速度全程约 2.5 分钟。
        </p>
        <ol className="grid grid-cols-2 gap-2">
          {PHASES.map((p, i) => (
            <li key={p.key} className="rounded-[12px] bg-ink-50 px-3 py-2">
              <div className="text-xs font-semibold text-ink-900">
                {i + 1}. {p.title}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-1">
                {[...new Set(STEPS.filter((s) => s.phase === p.key).flatMap((s) => [s.actor, ...s.with]))].map((a) => (
                  <ActorChip key={a} actor={a} size="xs" short />
                ))}
              </div>
            </li>
          ))}
        </ol>
        <div>
          <div className="mb-1.5 text-sm font-medium text-ink-800">情景</div>
          <div className="grid grid-cols-3 gap-1.5">
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScen(s.key)}
                aria-pressed={scenario === s.key}
                title={s.story}
                className={cx('rounded-[10px] px-2.5 py-1.5 text-left text-xs transition-colors', scenario === s.key ? 'bg-primary-50 font-medium text-primary-700 ring-1 ring-primary-300' : 'bg-ink-50 text-ink-700 hover:bg-ink-100')}
              >
                <div className="truncate">{s.title}</div>
                <div className="truncate text-2xs text-ink-500">{s.tag}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-ink-800">演示方式</span>
          <Segmented<FlowMode>
            value={mode}
            onChange={setMode}
            items={[
              { value: 'auto', label: '自动连播' },
              { value: 'step', label: '逐步（每个环节后手动继续）' },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-ink-800">
            播放速度<span className="ml-2 text-xs font-normal text-ink-500">演示中可随时调整（快捷键 [ ]）</span>
          </span>
          <SpeedControl size="md" />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-ink-700">
          <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} className="mt-[3px] h-4 w-4 accent-primary-500" />
          <span>
            从初始状态开始
            <span className="block text-xs text-ink-500">重置本机浏览器中的演示进度：券配置、开店状态、订单与三端界面回到开店前（情景保留）。</span>
          </span>
        </label>
        <p className="flex gap-1.5 rounded-[12px] bg-primary-50 px-3 py-2 text-xs leading-relaxed text-primary-700">
          <Icon name="help" size={14} className="mt-[2px] shrink-0" />
          自动演示不会下载任何文件；演示途中点击左侧菜单离开当前页面会自动暂停，可随时“继续”或“结束”。
        </p>
      </div>
    </Modal>
  );
}

/* ---------------- 高亮当前子步骤对应的页面区域 ---------------- */

function useSpotlight() {
  const key = useFlow((s) => (s.active ? `${s.nonce}:${s.sub}` : ''));
  useEffect(() => {
    if (!key) {
      hideCursor(true);
      return;
    }
    const s = flowStore.get();
    const step = STEPS[s.idx];
    const sub = step?.subs[s.sub];
    // 机器执行的子步骤（平台服务、智能调度、定时任务、支付网关）不显示人的光标
    if (sub && !HUMAN.includes(sub.actor)) hideCursor();
    const anchor = sub?.anchor;
    if (!anchor) return;
    let tries = 0;
    let el: HTMLElement | null = null;
    let t = 0;
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-flow-anchor="${anchor}"]`);
      if (el) {
        const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
        el.scrollIntoView({ behavior: 'smooth', block: tall ? 'start' : 'center' });
        el.classList.add('flow-spotlight');
        // 导演推进的环节（walk）没有页面脚本操作光标：由“人”查看时光标移到对应区域
        if (step.drive === 'walk' && sub && HUMAN.includes(sub.actor)) cursorHover(el, sub.actor);
      } else if (tries++ < 16) t = window.setTimeout(find, 250);
    };
    t = window.setTimeout(find, 120);
    return () => {
      window.clearTimeout(t);
      el?.classList.remove('flow-spotlight');
    };
  }, [key]);
}
