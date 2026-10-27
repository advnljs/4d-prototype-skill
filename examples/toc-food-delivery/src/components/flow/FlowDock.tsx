import { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner, cx } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import { DATA_OBJECTS, type DataKey } from '@/flow/dataObjects';
import { flowPrefs, goToStep, readyNow, useFlow, type FlowState } from '@/flow/director';
import { EDGES, STEPS, STEP_INDEX, stepById } from '@/flow/workflow';
import { useStore } from '@/lib/store';
import { ActorChip, NecessityTag } from './ActorChip';
import { DagDetail } from './FlowDag';
import { BigControls, ModeControl, SpeedControl } from './PlaybackControls';

// 格式样例依赖规则引擎与演示数据，按需加载
const FormatSamplesView = lazy(() => import('./FormatPreview').then((m) => ({ default: m.FormatSamplesView })));


/** 依赖图下方：当前环节的上游 / 下游以及沿边传递的数据 */
function EdgeCaption({ id }: { id: (typeof STEPS)[number]['id'] }) {
  const ins = EDGES.filter((e) => e.to === id);
  const outs = EDGES.filter((e) => e.from === id);
  const item = (n: number, label: string, short: string, data: boolean) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="num font-semibold text-ink-700">{n}</span>
      <span className="text-ink-600">{short}</span>
      <span className={cx('rounded-full px-1.5 leading-[16px]', data ? 'bg-primary-50 text-primary-700' : 'bg-ink-950/[0.04] text-ink-500')}>{label}</span>
    </span>
  );
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-2 overflow-hidden text-2xs">
      <span className="shrink-0 text-ink-400">上游</span>
      {ins.length ? ins.map((e) => <span key={e.from}>{item(STEP_INDEX[e.from] + 1, e.label, stepById(e.from).short, !!e.data)}</span>) : <span className="text-ink-400">无</span>}
      <Icon name="arrowRight" size={12} className="shrink-0 text-ink-300" />
      <span className="shrink-0 text-ink-400">下游</span>
      {outs.length ? outs.map((e) => <span key={e.to}>{item(STEP_INDEX[e.to] + 1, e.label, stepById(e.to).short, !!e.data)}</span>) : <span className="text-ink-400">无（终点）</span>}
    </div>
  );
}

const DOCK_MIN = 180;
const dockMax = () => Math.max(DOCK_MIN + 40, Math.round(window.innerHeight * 0.68));

/**
 * 演示播放时的“流程 · 数据”浮动窗口：
 * - 顶部是大号播放控制条（上一环节 / 暂停·继续 / 下一环节 / 结束、速度、演示方式、进度），收起后仍保留；
 * - 左侧详细依赖图（当前环节与上下游、传递的数据），右侧当前子步骤正在产生 / 使用的文件、库表或数据格式，随演示自动切换；
 * - 停靠在正文底部、作为布局的一部分（不遮挡页面），拖动上沿调整高度，可最大化 / 还原 / 收起。
 */
export function FlowDock() {
  const f = useFlow((s) => s);
  const open = useStore(flowPrefs, (p) => (p.dock ?? 'open') === 'open');
  const navOpen = useStore(flowPrefs, (p) => p.panel === 'open');
  const bodyH = useStore(flowPrefs, (p) => p.dockH ?? 250);
  const [pinned, setPinned] = useState<DataKey | null>(null);
  const [dragging, setDragging] = useState(false);
  const restoreH = useRef(250);
  const dagBox = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const chipRow = useRef<HTMLDivElement>(null);
  const [dagW, setDagW] = useState(680);

  // 换环节后恢复“跟随当前子步骤”
  useEffect(() => setPinned(null), [f.idx]);
  // 数据标签一行排不下时，保持当前数据的标签可见
  useEffect(() => {
    chipRow.current?.querySelector('[data-cur]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
  useLayoutEffect(() => {
    const el = dagBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDagW(el.clientWidth));
    ro.observe(el);
    setDagW(el.clientWidth);
    return () => ro.disconnect();
  }, [open, f.active]);

  // 把窗口高度告诉弹窗 / 抽屉 / 提示（它们止于窗口上方）
  useLayoutEffect(() => {
    const el = root.current;
    const set = (h: number) => document.documentElement.style.setProperty('--flow-dock-h', `${Math.round(h)}px`);
    if (!el) {
      set(0);
      return;
    }
    const ro = new ResizeObserver(() => set(el.getBoundingClientRect().height));
    // 观察 border-box：收起时只有内边距变化，content-box 不变
    ro.observe(el, { box: 'border-box' });
    set(el.getBoundingClientRect().height);
    return () => {
      ro.disconnect();
      set(0);
    };
  }, [f.active]);

  // 拖动上沿调整高度
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = open ? bodyH : DOCK_MIN;
    if (!open) flowPrefs.set({ dock: 'open' });
    setDragging(true);
    const move = (ev: PointerEvent) => flowPrefs.set({ dockH: Math.max(DOCK_MIN, Math.min(dockMax(), Math.round(h0 + (y0 - ev.clientY)))) });
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const maximized = bodyH >= dockMax() - 4;
  function toggleMax() {
    if (!open) flowPrefs.set({ dock: 'open' });
    if (maximized) flowPrefs.set({ dockH: Math.min(restoreH.current, dockMax() - 40) });
    else {
      restoreH.current = bodyH;
      flowPrefs.set({ dockH: dockMax() });
    }
  }

  if (!f.active) return null;
  const step = STEPS[f.idx];
  const sub = step.subs[Math.min(f.sub, step.subs.length - 1)];
  const auto = sub?.data ?? step.outputs[0];
  const cur = pinned ?? auto;
  const chips: { k: DataKey; dir: 'in' | 'out' }[] = [...step.inputs.map((k) => ({ k, dir: 'in' as const })), ...step.outputs.filter((k) => !step.inputs.includes(k)).map((k) => ({ k, dir: 'out' as const }))];
  const h = Math.max(DOCK_MIN, bodyH);
  const ready = readyNow(f);

  const showReady = f.status === 'step-done' && (f.mode === 'step' || f.paused) && ready.length > 0;

  // 居中悬浮的播放控制胶囊：展开时浮在窗口上沿之上，收起时浮在正文底部；两侧不占任何空间
  const capsule = (
    <div className="pointer-events-none absolute left-1/2 z-[46] flex w-max -translate-x-1/2 flex-col items-center gap-1.5 whitespace-nowrap" style={{ bottom: open ? 'calc(100% + 8px)' : 12 }}>
      {showReady ? (
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-surface/95 py-1 pl-3 pr-1 text-xs shadow-pop ring-1 ring-ink-950/[0.08] backdrop-blur-xl">
          <span className="shrink-0 text-primary-700">可执行</span>
          {ready.map((id, i) => (
            <button key={id} type="button" onClick={() => goToStep(id)} className={cx('inline-flex h-6 items-center gap-1 rounded-full px-2 font-medium', i === 0 ? 'bg-primary-500 text-white' : 'bg-ink-950/[0.05] text-ink-800 hover:bg-ink-950/[0.09]')}>
              <span className="num">{STEP_INDEX[id] + 1}</span>
              {stepById(id).short}
            </button>
          ))}
        </div>
      ) : null}
      <div role="toolbar" aria-label="演示播放控制" title="空格 暂停 / 继续 · [ ] 调速度" className="pointer-events-auto flex items-center gap-3 rounded-full bg-surface/95 py-1.5 pl-2 pr-2 shadow-pop ring-1 ring-ink-950/[0.08] backdrop-blur-xl">
        <span className="flex max-w-[200px] items-center gap-1.5 pl-1.5 text-sm">
          <span className="num flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-2xs font-semibold text-white" style={{ background: ACTORS[step.actor].color }}>
            {STEP_INDEX[step.id] + 1}
          </span>
          <span className="truncate font-semibold text-ink-900">{step.short}</span>
        </span>
        <BigControls f={f} />
        <span className="h-7 w-px bg-ink-950/[0.08]" />
        <SpeedControl />
        <ModeControl f={f} />
        <span className="h-7 w-px bg-ink-950/[0.08]" />
        <span className="num flex shrink-0 flex-col text-2xs leading-4">
          <StatusText f={f} />
          <span className="text-ink-500">
            {f.completed.length + f.assumed.length}/{STEPS.length}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {open ? <IconBtn icon={maximized ? 'chevronDown' : 'chevronUp'} label={maximized ? '还原窗口高度' : '最大化窗口'} onClick={toggleMax} /> : null}
          <IconBtn icon={open ? 'x' : 'layers'} label={open ? '收起窗口（只保留控制）' : '展开流程与数据窗口'} onClick={() => flowPrefs.set({ dock: open ? 'min' : 'open' })} />
        </span>
      </div>
    </div>
  );

  return (
    <section ref={root} aria-label="流程与数据" className={cx('relative shrink-0 pr-3 transition-[padding] duration-200', open ? 'pb-3' : 'pb-0', navOpen ? 'pl-[188px]' : 'pl-3')}>
      <div className="relative">
        {capsule}
        {open ? (
          <div className={cx('relative overflow-hidden rounded-[18px] bg-surface/95 shadow-pop ring-1 ring-ink-950/[0.06] backdrop-blur-xl', !dragging && 'anim-rise')}>
            {/* 上沿拖动条：上下拖动调整窗口高度，双击最大化 / 还原 */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="拖动调整“流程 · 数据”窗口高度"
              title="上下拖动调整高度，双击最大化 / 还原"
              onPointerDown={startDrag}
              onDoubleClick={toggleMax}
              className="group absolute inset-x-0 top-0 z-10 flex h-3 cursor-ns-resize justify-center"
            >
              <span className={cx('mt-1 h-1 w-12 rounded-full transition-colors', dragging ? 'bg-primary-500' : 'bg-ink-950/[0.1] group-hover:bg-ink-950/[0.25]')} />
            </div>
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 px-4 pb-3 pt-3.5">
              <div ref={dagBox} className="flex min-w-0 flex-col" style={{ height: h }}>
                <div className="flex h-6 min-w-0 shrink-0 items-center gap-1.5 text-xs">
                  <Icon name="layers" size={13} className="shrink-0 text-primary-500" />
                  <span className="shrink-0 font-semibold text-ink-900">{step.short}</span>
                  <NecessityTag n={step.necessity} />
                  {sub ? (
                    <>
                      <Icon name="chevronRight" size={12} className="shrink-0 text-ink-300" />
                      <span className="truncate text-ink-600">{sub.title}</span>
                      <ActorChip actor={sub.actor} size="xs" short />
                    </>
                  ) : null}
                  <span className="ml-auto shrink-0 pl-2 text-2xs text-ink-400">{f.status === 'finished' ? '点击节点可单独重放' : '点击节点切换环节'}</span>
                </div>
                <DagDetail f={f} width={Math.max(600, dagW)} height={h - 50} onPick={goToStep} />
                <EdgeCaption id={step.id} />
              </div>
              <div className="flex min-w-0 flex-col" style={{ height: h }}>
                <div ref={chipRow} className="flex h-6 shrink-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                  <span className="mr-0.5 shrink-0 text-2xs text-ink-500">当前数据</span>
                  {chips.map(({ k, dir }, i) => (
                    <span key={k} className="flex shrink-0 items-center gap-1">
                      {dir === 'out' && (i === 0 || chips[i - 1].dir === 'in') ? <Icon name="arrowRight" size={12} className="text-ink-300" /> : null}
                      <button
                        type="button"
                        data-cur={k === cur ? 'true' : undefined}
                        onClick={() => setPinned(k)}
                        title={`${DATA_OBJECTS[k].name}（${DATA_OBJECTS[k].type}）`}
                        className={cx(
                          'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[7px] px-1.5 text-2xs font-medium transition-colors',
                          k === cur ? 'bg-ink-900 text-surface' : dir === 'out' ? 'bg-pine-50 text-pine-700 ring-1 ring-inset ring-pine-100 hover:bg-pine-100/70' : 'bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-950/[0.06] hover:bg-ink-100',
                        )}
                      >
                        {k === auto && !pinned ? <span className="anim-pulse h-1.5 w-1.5 rounded-full bg-primary-400" /> : null}
                        {DATA_OBJECTS[k].name}
                      </button>
                    </span>
                  ))}
                  {pinned ? (
                    <button type="button" onClick={() => setPinned(null)} className="ml-1 shrink-0 rounded-full px-2 text-2xs leading-[22px] text-primary-600 hover:bg-primary-50">
                      恢复自动跟随
                    </button>
                  ) : null}
                </div>
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <Suspense
                    fallback={
                      <div className="flex h-24 items-center justify-center gap-2 text-sm text-ink-400">
                        <Spinner /> 生成样例…
                      </div>
                    }
                  >
                    <FormatSamplesView key={cur} k={cur} compact />
                  </Suspense>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StatusText({ f }: { f: FlowState }) {
  const [t, cls] =
    f.status === 'finished' ? ['已完成', 'text-pine-600'] : f.paused ? ['已暂停', 'text-amber-600'] : f.status === 'step-done' ? (f.mode === 'step' ? ['等待下一环节', 'text-primary-600'] : ['即将继续', 'text-primary-600']) : ['运行中', 'text-primary-600'];
  return <span className={cx('font-medium', cls)}>{t}</span>;
}

function IconBtn({ icon, label, onClick }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-950/[0.05] text-ink-600 hover:bg-ink-950/[0.09]">
      <Icon name={icon} size={14} strokeWidth={2} />
    </button>
  );
}
