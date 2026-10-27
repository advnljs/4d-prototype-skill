import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner, cx } from '@/components/ui/primitives';
import { ActorChip, NecessityTag } from '@/components/flow/ActorChip';
import { MiniDag } from '@/components/flow/FlowDag';
import { BigControls, ModeControl, SpeedControl, usePlaybackHotkeys } from '@/components/flow/PlaybackControls';
import { ACTORS } from '@/flow/actors';
import { useClockFrozen, useSpeed } from '@/flow/clock';
import { HUMAN, cursorHover, cursorStore, cursorTarget, hideCursor } from '@/flow/cursor';
import { DATA_OBJECTS, type DataKey } from '@/flow/dataObjects';
import { flowStore, goToStep, readyNow, startFlow, stepStateOf, togglePlay, useFlow, type FlowMode } from '@/flow/director';
import { STEPS, STEP_INDEX } from '@/flow/workflow';
import { useStore } from '@/lib/store';
import { RIDER_MAP } from '@/domain/catalog';
import { SCENARIOS, type ScenarioKey } from '@/sim/scenarios';
import { clockLabel } from '@/sim/world';
import { liveStore, setScenario, useScenario, useWorld } from '@/state/live';
import { USERS } from '@/state/session';
import { Btn, Seg, Sheet } from './kit';
import { goHome, mUi, useM } from './mstate';

const FormatSamplesView = lazy(() => import('@/components/flow/FormatPreview').then((m) => ({ default: m.FormatSamplesView })));

/** 手机上的 4D 演示层：边缘入口、开始弹层、顶部演示胶囊、控制面板、触点光标、子步骤聚光灯 */
export function DemoLayer({ app }: { app: string }) {
  const f = useFlow((s) => s);
  const start = useM((s) => s.start);
  const panel = useM((s) => s.panel);
  usePlaybackHotkeys(f.active);
  useSpotlight();
  return (
    <>
      {!f.active ? <EdgeTab app={app} /> : <Capsule />}
      <StartSheet open={start} />
      <PanelSheet open={panel && f.active} />
      <TouchCursor />
    </>
  );
}

/* ---------------- 未演示：右侧边缘入口 ---------------- */

function EdgeTab({ app }: { app: string }) {
  const [open, setOpen] = useState(false);
  if (app === 'home') return null;
  return (
    <div className="absolute right-0 top-[44%] z-40 flex items-center">
      {open ? (
        <div className="anim-fade mr-1.5 flex flex-col overflow-hidden rounded-[16px] bg-[#1f2329]/90 text-white shadow-pop ring-1 ring-white/10 backdrop-blur-xl">
          <button type="button" onClick={() => (setOpen(false), mUi.set({ start: true }))} className="m-press flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold">
            <Icon name="play" size={15} strokeWidth={2.2} className="text-[#ffb067]" />
            一键演示
          </button>
          <span className="mx-3 h-px bg-white/10" />
          <button type="button" onClick={() => (setOpen(false), goHome())} className="m-press flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-semibold">
            <Icon name="grid" size={15} strokeWidth={2} />
            回到桌面
          </button>
        </div>
      ) : null}
      <button type="button" aria-label="演示与桌面" aria-expanded={open} onClick={() => setOpen(!open)} className="m-press flex h-14 w-[18px] items-center justify-center rounded-l-[10px] bg-[#1f2329]/70 text-white/90 shadow-raise backdrop-blur">
        <Icon name={open ? 'chevronRight' : 'chevronLeft'} size={13} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/* ---------------- 开始弹层 ---------------- */

function StartSheet({ open }: { open: boolean }) {
  const current = useScenario();
  const [scenario, setScen] = useState<ScenarioKey>(current);
  const [mode, setMode] = useState<FlowMode>('auto');
  const [reset, setReset] = useState(true);
  useEffect(() => {
    if (open) setScen(liveStore.get().scenario);
  }, [open]);
  const close = () => mUi.set({ start: false });
  return (
    <Sheet open={open} onClose={close} dark>
      <div className="m-scroll max-h-[78vh] px-5 pb-5 pt-3">
        <div className="text-[20px] font-bold">一键演示一单外卖</div>
        <p className="mt-1 text-[13px] leading-[19px] text-white/60">{STEPS.length} 个环节按依赖关系自动执行：手机会在用户、商家、骑手、运营四个 App 之间自动切换，触点代替手指完成操作。</p>
        <div className="mt-4 text-[13px] font-semibold text-white/80">情景</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {SCENARIOS.map((s) => (
            <button key={s.key} type="button" onClick={() => setScen(s.key)} aria-pressed={scenario === s.key} className={cx('m-press rounded-[16px] px-3 py-2.5 text-left ring-1 transition-colors', scenario === s.key ? 'bg-[#e25507]/25 ring-[#ff8a3c]' : 'bg-white/[0.06] ring-white/[0.06]')}>
              <div className="truncate text-[13.5px] font-semibold">{s.title}</div>
              <div className="truncate text-[11.5px] text-white/50">{s.tag}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-white/80">方式</span>
          <div className="w-[210px]">
            <Seg
              dark
              value={mode}
              onChange={setMode}
              items={[
                { value: 'auto', label: '自动连播' },
                { value: 'step', label: '逐步' },
              ]}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-white/80">速度</span>
          <div className="rounded-full bg-white p-0.5">
            <SpeedControl />
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2.5 text-[13px] text-white/75">
          <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} className="h-4 w-4 accent-[#e25507]" />
          从开店前开始（重置演示数据）
        </label>
        <Btn
          className="mt-5"
          icon="play"
          onClick={() => {
            close();
            if (scenario !== liveStore.get().scenario) setScenario(scenario);
            void startFlow({ mode, reset });
          }}
        >
          开始演示
        </Btn>
      </div>
    </Sheet>
  );
}

/* ---------------- 演示中：顶部胶囊 ---------------- */

function Capsule() {
  const f = useFlow((s) => s);
  const toast = useM((s) => s.toast);
  const step = STEPS[f.idx];
  const sub = step?.subs[Math.min(f.sub, step.subs.length - 1)];
  const total = STEPS.length;
  const done = f.completed.length + f.assumed.length;
  const finished = f.status === 'finished';
  const waiting = f.status === 'step-done' && (f.mode === 'step' || f.paused);
  const ready = waiting ? readyNow(f) : [];
  return (
    <div className="pointer-events-none absolute inset-x-0 z-40 flex flex-col items-center gap-1.5 px-3" style={{ top: 'calc(var(--sat-base) + 4px)' }}>
      <div role="toolbar" aria-label="演示播放控制" className="anim-capsule pointer-events-auto flex w-full max-w-[360px] items-center gap-2.5 rounded-full bg-[#14161a]/90 py-1.5 pl-1.5 pr-1.5 text-white shadow-[0_12px_30px_-12px_rgb(0_0_0/0.7)] ring-1 ring-white/10 backdrop-blur-xl">
        <button type="button" onClick={() => mUi.set({ panel: true })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
          <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold" style={{ background: ACTORS[step.actor].color }}>
            {finished ? <Icon name="check" size={15} strokeWidth={3} /> : STEP_INDEX[step.id] + 1}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold">{finished ? `完整流程已演示 ${done}/${total}` : step.short}</span>
            {toast ? (
              <span key={toast.id} className="anim-fade flex items-center gap-1 truncate text-[11.5px] font-semibold text-[#ffb067]">
                <Icon name="phone" size={11} strokeWidth={2.4} />
                {toast.text}
              </span>
            ) : (
              <span className="block truncate text-[11.5px] text-white/60">{finished ? '点节点可单独重放' : f.paused ? '已暂停 · 点开查看流程与数据' : waiting ? '本环节完成 · 选择下一步' : sub?.title}</span>
            )}
          </span>
          <span className="num shrink-0 text-[11.5px] text-white/50">
            {done}/{total}
          </span>
        </button>
        <button type="button" aria-label={finished ? '重新运行' : f.paused ? '继续' : '暂停'} onClick={finished ? () => void startFlow({ mode: f.mode, reset: true }) : togglePlay} className="m-press brand-grad flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
          <Icon name={finished ? 'refresh' : f.paused || waiting ? 'play' : 'pause'} size={16} strokeWidth={2.4} />
        </button>
      </div>
      {ready.length ? (
        <div className="anim-rise pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-full bg-[#14161a]/85 p-1 text-[12px] text-white backdrop-blur-xl">
          {ready.map((id, i) => (
            <button key={id} type="button" onClick={() => goToStep(id)} className={cx('m-press shrink-0 rounded-full px-3 py-1.5 font-semibold', i === 0 ? 'brand-grad' : 'bg-white/10')}>
              <span className="num mr-1">{STEP_INDEX[id] + 1}</span>
              {STEPS[STEP_INDEX[id]].short}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 演示控制面板 ---------------- */

function PanelSheet({ open }: { open: boolean }) {
  const f = useFlow((s) => s);
  const tab = useM((s) => s.panelTab);
  const w = useWorld();
  const [pinned, setPinned] = useState<DataKey | null>(null);
  const step = STEPS[f.idx];
  useEffect(() => setPinned(null), [f.idx]);
  if (!step) return null;
  const sub = step.subs[Math.min(f.sub, step.subs.length - 1)];
  const dataKeys = [...new Set([...step.inputs, ...step.outputs])];
  const cur = pinned ?? sub?.data ?? step.outputs[0];
  return (
    <Sheet open={open} onClose={() => mUi.set({ panel: false })} dark>
      <div className="flex max-h-[80vh] flex-col">
        <div className="shrink-0 px-5 pt-3">
          <div className="flex items-center gap-2">
            <span className="num flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold" style={{ background: ACTORS[step.actor].color }}>
              {STEP_INDEX[step.id] + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[17px] font-bold">{step.short}</span>
            <NecessityTag n={step.necessity} />
            <ActorChip actor={step.actor} size="xs" short />
          </div>
          <p className="mt-2 line-clamp-3 text-[13px] leading-[19px] text-white/65">{step.narration}</p>
          <div className="mt-3 flex items-center justify-center rounded-[22px] bg-white py-2.5">
            <BigControls f={f} />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="rounded-full bg-white p-0.5">
              <SpeedControl />
            </div>
            <div className="rounded-full bg-white p-0.5">
              <ModeControl f={f} />
            </div>
          </div>
          <div className="mt-3">
            <Seg
              dark
              value={tab}
              onChange={(v) => mUi.set({ panelTab: v })}
              items={[
                { value: 'ctl', label: '子步骤' },
                { value: 'flow', label: '依赖图' },
                { value: 'data', label: '数据' },
                { value: 'events', label: '事件' },
              ]}
            />
          </div>
        </div>
        <div className="m-scroll min-h-0 flex-1 px-5 pb-5 pt-3">
          {tab === 'ctl' ? (
            <ol className="space-y-2">
              {step.subs.map((x, k) => {
                const st = f.status !== 'running' || k < f.sub ? 'done' : k === f.sub ? 'cur' : 'todo';
                return (
                  <li key={k} className={cx('flex items-center gap-3 rounded-[14px] px-3 py-2.5', st === 'cur' ? 'bg-white/[0.1]' : 'bg-white/[0.04]')}>
                    <span className="flex h-5 w-5 items-center justify-center">{st === 'done' ? <Icon name="check" size={15} strokeWidth={2.6} className="text-[#5ee39a]" /> : st === 'cur' ? <Spinner size={14} /> : <span className="h-2 w-2 rounded-full" style={{ background: ACTORS[x.actor].color }} />}</span>
                    <span className={cx('min-w-0 flex-1 text-[14px]', st === 'todo' ? 'text-white/45' : 'text-white')}>{x.title}</span>
                    <span className="text-[12px]" style={{ color: ACTORS[x.actor].color }}>
                      {ACTORS[x.actor].short}
                    </span>
                  </li>
                );
              })}
              {step.machine ? <p className="pt-1 text-[12.5px] leading-[18px] text-[#c9a8f0]">系统：{step.machine}</p> : null}
              {step.human ? <p className="text-[12.5px] leading-[18px] text-[#ffc08a]">人工把关：{step.human}</p> : null}
            </ol>
          ) : tab === 'flow' ? (
            <div>
              <div className="rounded-[16px] bg-white p-2">
                <MiniDag f={f} current={step.id} width={318} height={84} />
              </div>
              <ul className="mt-3 space-y-1">
                {STEPS.map((s, i) => {
                  const st = stepStateOf(f, s.id);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => goToStep(s.id)} className={cx('m-press flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left', s.id === step.id ? 'bg-white/[0.12]' : 'hover:bg-white/[0.05]')}>
                        <span className={cx('num flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold', st === 'done' ? 'bg-[#1c8c50]' : st === 'running' ? 'brand-grad' : st === 'assumed' ? 'border border-dashed border-white/40' : 'bg-white/10')}>{st === 'done' || st === 'assumed' ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-[14px]">{s.short}</span>
                        <NecessityTag n={s.necessity} short />
                        <span className="num text-[11.5px] text-white/45">{s.when}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : tab === 'data' ? (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {dataKeys.map((k) => (
                  <button key={k} type="button" onClick={() => setPinned(k)} className={cx('m-press rounded-full px-3 py-1.5 text-[12.5px] font-medium', k === cur ? 'bg-white text-ink-900' : 'bg-white/[0.08] text-white/80')}>
                    {DATA_OBJECTS[k].name}
                  </button>
                ))}
              </div>
              <div className="mt-3 overflow-hidden rounded-[16px] bg-white p-3 text-ink-900">
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
          ) : (
            <ol className="space-y-1.5">
              {[...w.events]
                .sort((a, b) => b.at - a.at)
                .map((e) => (
                  <li key={`${e.at}-${e.title}`} className="rounded-[12px] bg-white/[0.05] px-3 py-2">
                    <div className="flex items-center gap-2 text-[13px]">
                      <span className={cx('h-1.5 w-1.5 rounded-full', e.kind === 'warn' ? 'bg-amber-500' : e.kind === 'error' ? 'bg-seal-500' : e.kind === 'ok' ? 'bg-[#5ee39a]' : 'bg-white/40')} />
                      <span className="num text-[11.5px] text-white/45">{clockLabel(e.at)}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                    </div>
                    {e.detail ? <p className="mt-0.5 line-clamp-2 pl-3.5 text-[12px] text-white/50">{e.detail}</p> : null}
                  </li>
                ))}
            </ol>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- 触点光标 ---------------- */

const NAME: Record<string, string> = { user: USERS.user.name, merchant: USERS.merchant.name, rider: USERS.rider.name, ops: USERS.ops.name };

function nameOf(actor: string) {
  if (actor === 'rider') {
    const id = liveStore.get().world.order?.riderId;
    return id ? RIDER_MAP[id].short : NAME.rider;
  }
  return NAME[actor];
}

/** 手机上的“手指”：半透明圆点平滑移到目标，点击时按下并扩散涟漪（顶层 popover，不拦截触摸） */
function TouchCursor() {
  const c = useStore(cursorStore, (s) => s);
  const active = useFlow((s) => s.active);
  const speed = useSpeed();
  const frozen = useClockFrozen();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const pos = useRef({ x: 0, y: 0, init: false });
  useEffect(() => {
    try {
      (root.current as HTMLDivElement & { showPopover?: () => void })?.showPopover?.();
    } catch {
      /* 不支持 popover 时退化为普通固定层 */
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      const node = body.current;
      const el = cursorTarget();
      if (node) {
        if (!pos.current.init) pos.current = { x: window.innerWidth / 2, y: window.innerHeight * 0.66, init: true };
        if (el && el.isConnected) {
          const r = el.getBoundingClientRect();
          const gx = r.left + r.width / 2;
          const gy = r.top + Math.min(r.height / 2, 26);
          const k = frozenRef.current ? 0 : 1 - Math.exp(-dt * 0.0105 * speedRef.current);
          pos.current.x += (gx - pos.current.x) * k;
          pos.current.y += (gy - pos.current.y) * k;
        }
        node.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  const a = ACTORS[c.actor];
  const shown = active && c.visible;
  const flipX = pos.current.x > window.innerWidth - 130;
  return (
    <div ref={root} popover="manual" aria-hidden="true" style={{ position: 'fixed', inset: 'auto', left: 0, top: 0, width: 0, height: 0, margin: 0, padding: 0, border: 0, background: 'transparent', overflow: 'visible', pointerEvents: 'none', zIndex: 9999 }}>
      <div ref={body} className="absolute left-0 top-0" style={{ opacity: shown ? 1 : 0, transition: 'opacity 220ms ease-out', willChange: 'transform' }}>
        {c.clicks ? <span key={c.clicks} className="absolute -left-6 -top-6 h-12 w-12 rounded-full" style={{ background: `color-mix(in srgb, ${a.color} 45%, transparent)`, animation: `touch-ripple ${Math.round(700 / speed)}ms ease-out both` }} /> : null}
        <span
          key={`p-${c.clicks}`}
          className="absolute -left-[17px] -top-[17px] h-[34px] w-[34px] rounded-full"
          style={{ background: 'rgb(255 255 255 / 0.55)', boxShadow: `0 0 0 2.5px ${a.color}, 0 6px 16px rgb(0 0 0 / 0.35)`, backdropFilter: 'blur(2px)', animation: c.clicks ? `touch-press ${Math.round(280 / speed)}ms ease-out both` : undefined }}
        />
        <span className="absolute top-[22px] whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-[0_2px_6px_rgb(0_0_0/0.25)]" style={{ background: a.color, left: flipX ? 'auto' : 10, right: flipX ? 10 : 'auto' }}>
          {a.short}
          {nameOf(c.actor) ? ` · ${nameOf(c.actor)}` : ''}
        </span>
      </div>
    </div>
  );
}

/* ---------------- 子步骤聚光灯 ---------------- */

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
    if (sub && !HUMAN.includes(sub.actor)) hideCursor();
    const anchor = sub?.anchor;
    if (!step || !sub || !anchor || anchor.startsWith('phone-')) return;
    let tries = 0;
    let el: HTMLElement | null = null;
    let t = 0;
    const find = () => {
      el = document.querySelector<HTMLElement>(`[data-flow-anchor="${anchor}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('flow-spotlight');
        if (step.drive === 'walk' && HUMAN.includes(sub.actor)) cursorHover(el, sub.actor);
      } else if (tries++ < 16) t = window.setTimeout(find, 250);
    };
    t = window.setTimeout(find, 160);
    return () => {
      window.clearTimeout(t);
      el?.classList.remove('flow-spotlight');
    };
  }, [key]);
}
