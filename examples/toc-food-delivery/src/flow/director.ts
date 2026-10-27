/**
 * 全流程演示“导演”：按 workflow.ts 的依赖图（DAG）调度环节——上游全部完成的环节才可执行，
 * 切换角色、跳转页面，并让页面执行该环节的动作。
 *
 * - 页面通过 useFlowStep(stepId, onEnter) 接入：当前环节轮到自己时收到 ctl，
 *   用 ctl.sub(i) 汇报子步骤进度、ctl.done() 宣告完成；walk 型环节由导演按子步骤时长推进。
 * - 自动连播：环节完成后停留片刻，进入可执行环节中排序最靠前的一个；
 *   逐步演示：列出全部可执行环节（并行分支），由人选择走哪个分支。
 * - 跳到某个环节时，尚未完成的上游环节视为“已完成（使用演示中已有数据）”，以保持依赖关系成立。
 * - 演示途中手动离开当前页面会自动暂停，避免导演和人“抢方向盘”。
 * 状态只在内存中（不持久化），刷新即结束演示。
 */
import { useEffect, useMemo, useRef } from 'react';
import { createStore, useStore } from '@/lib/store';
import { navigate } from '@/lib/router';
import { sessionStore, setRole } from '@/state/session';
import type { ActorKey } from './actors';
import { SPEEDS, freezeClock, setClockSpeed, vClearTimeout, vSetTimeout, type Speed } from './clock';
import { HUMAN, cursorClick, cursorHover, hideCursor } from './cursor';
import { STEPS, STEP_INDEX, ancestorsOf, depsOf, orderReady, pathOf, readySteps, stepById, type StepId } from './workflow';

export type FlowMode = 'auto' | 'step';
export type FlowStatus = 'idle' | 'running' | 'step-done' | 'finished';

export interface FlowState {
  active: boolean;
  mode: FlowMode;
  idx: number;
  sub: number;
  status: FlowStatus;
  nonce: number;
  paused: boolean;
  /** 演示途中手动离开了当前环节的页面 */
  left: boolean;
  completed: StepId[];
  /** 跳转时视为已完成的上游环节（使用演示中已有或预置的数据，未实际执行） */
  assumed: StepId[];
  /** 实际进入过的环节顺序（“上一环节”使用） */
  trail: StepId[];
  startedAt: number;
  finishedAt: number;
  /** 未在演示时，导航面板中展开查看的环节 */
  focus: StepId | null;
  startOpen: boolean;
}

const INIT: FlowState = {
  active: false,
  mode: 'auto',
  idx: 0,
  sub: 0,
  status: 'idle',
  nonce: 0,
  paused: false,
  left: false,
  completed: [],
  assumed: [],
  trail: [],
  startedAt: 0,
  finishedAt: 0,
  focus: null,
  startOpen: false,
};

export const flowStore = createStore<FlowState>('flow', () => INIT, { persist: false });

/** 导航面板展开状态与播放速度（个人偏好，可持久化） */
export const flowPrefs = createStore<{ panel: 'open' | 'compact'; speed: Speed; dock: 'open' | 'min'; dockH: number }>('flow-prefs', () => ({
  panel: 'compact',
  speed: 1,
  dock: 'open',
  dockH: 250,
}));
// 旧版本保存过 4× 等已取消的档位：落到最近的可用档位
if (!SPEEDS.includes(flowPrefs.get().speed)) flowPrefs.set({ speed: 2 });
setClockSpeed(flowPrefs.get().speed);

/** 调整播放速度：立即生效（包括正在等待的延时、流水线与 RPA 回放） */
export function setFlowSpeed(speed: Speed) {
  flowPrefs.set({ speed });
  setClockSpeed(speed);
}

export function useFlow<S>(sel: (s: FlowState) => S): S {
  return useStore(flowStore, sel);
}

/* ---------------- 计时器 ---------------- */

const DWELL = 1600; // 自动连播：环节之间的停留
const WALK_DEFAULT = 2600; // walk 型子步骤默认停留
const FALLBACK = 30000; // 页面长时间没有汇报进度时自动跳过，避免卡死

let walkTimer = 0;
let advanceTimer = 0;
let fallbackTimer = 0;
let expectedPath: string | null = null;
/** 暂停状态下进入的 walk 型环节：继续时才开始推进 */
let pendingWalk = 0;
/** 页面通过 ctl.later 注册的延时（属于当前环节，环节切换时清除） */
let stepTimers: number[] = [];

function clearAll() {
  vClearTimeout(walkTimer);
  vClearTimeout(advanceTimer);
  vClearTimeout(fallbackTimer);
  stepTimers.forEach((t) => vClearTimeout(t));
  stepTimers = [];
}

const st = () => flowStore.get();
const stale = (nonce: number) => !st().active || st().nonce !== nonce;

function armFallback(nonce: number) {
  vClearTimeout(fallbackTimer);
  fallbackTimer = vSetTimeout(() => {
    if (!stale(nonce) && st().status === 'running') complete(nonce);
  }, FALLBACK);
}

/* ---------------- 依赖状态 ---------------- */

export type StepState = 'idle' | 'running' | 'done' | 'assumed' | 'ready' | 'waiting';

const doneOf = (s: FlowState) => [...s.completed, ...s.assumed];

/** 环节在本次演示中的状态：运行中 / 已完成 / 视为完成 / 可执行（上游已齐）/ 等待上游 */
export function stepStateOf(s: FlowState, id: StepId): StepState {
  if (!s.active) return 'idle';
  if (STEPS[s.idx]?.id === id && s.status === 'running') return 'running';
  if (s.completed.includes(id)) return 'done';
  if (s.assumed.includes(id)) return 'assumed';
  const done = new Set(doneOf(s));
  return depsOf(id).every((d) => done.has(d)) ? 'ready' : 'waiting';
}

/** 当前可执行的环节（不含正在执行的），按优先顺序（STEPS 顺序，可选环节最后） */
export function readyNow(s: FlowState = st()): StepId[] {
  const cur = STEPS[s.idx]?.id;
  return orderReady(doneOf(s)).filter((id) => !(s.status === 'running' && id === cur));
}

/* ---------------- 环节推进 ---------------- */

/** keepPaused：暂停状态下点击环节（依赖图节点、上一 / 下一环节）时，切过去但仍保持暂停 */
function enter(i: number, opts: { keepPaused?: boolean } = {}) {
  clearAll();
  const keep = !!opts.keepPaused;
  freezeClock(keep);
  pendingWalk = 0;
  const step = STEPS[i];
  const s = st();
  const nonce = s.nonce + 1;
  flowStore.set({
    idx: i,
    sub: 0,
    status: 'running',
    nonce,
    paused: keep,
    left: false,
    focus: null,
    // 重新执行某环节时，它不再算作已完成
    completed: s.completed.filter((x) => x !== step.id),
    assumed: s.assumed.filter((x) => x !== step.id),
    trail: s.trail[s.trail.length - 1] === step.id ? s.trail : [...s.trail, step.id],
  });
  if (sessionStore.get().role !== step.role) setRole(step.role);
  expectedPath = pathOf(step.route);
  navigate(step.route);
  if (step.drive === 'walk') {
    if (keep) pendingWalk = nonce;
    else walkTimer = vSetTimeout(() => walk(nonce, 0), 900);
  } else if (!keep) armFallback(nonce);
}

function walk(nonce: number, k: number) {
  if (stale(nonce) || st().paused) return;
  const step = STEPS[st().idx];
  if (k >= step.subs.length) {
    complete(nonce);
    return;
  }
  flowStore.set({ sub: k });
  walkTimer = vSetTimeout(() => walk(nonce, k + 1), step.subs[k].ms ?? WALK_DEFAULT);
}

function complete(nonce: number) {
  if (stale(nonce) || st().status !== 'running') return;
  vClearTimeout(fallbackTimer);
  const s = st();
  const step = STEPS[s.idx];
  const completed = s.completed.includes(step.id) ? s.completed : [...s.completed, step.id];
  const finished = readySteps([...completed, ...s.assumed]).length === 0;
  flowStore.set({ completed, status: finished ? 'finished' : 'step-done', sub: step.subs.length - 1, finishedAt: finished ? Date.now() : 0 });
  if (!finished) scheduleAdvance();
}

function scheduleAdvance() {
  const s = st();
  if (s.paused || s.status !== 'step-done') return;
  const ready = readyNow(s);
  if (!ready.length) return;
  const cur = STEPS[s.idx].id;
  // 同一个后台任务的延续（如 RPA 抓取完成后自动进入批量核查），不论演示方式都立即衔接
  const chained = ready.find((id) => stepById(id).chain && depsOf(id).includes(cur));
  const nonce = s.nonce;
  if (chained) advanceTimer = vSetTimeout(() => !stale(nonce) && enter(STEP_INDEX[chained]), 500);
  else if (s.mode === 'auto') advanceTimer = vSetTimeout(() => !stale(nonce) && enter(STEP_INDEX[ready[0]]), DWELL);
}

/**
 * 直接进入目标环节（任何环节都可单独执行：页面状态不在时，由页面用演示数据自行准备上游产物）；
 * 目标的上游若尚未完成，记为“视为完成”（使用已有数据），保持 DAG 依赖成立。
 */
function enterTarget(id: StepId, opts: { keepPaused?: boolean } = {}) {
  const s = st();
  const done = new Set(doneOf(s));
  const assumed = [...s.assumed, ...[...ancestorsOf(id)].filter((a) => !done.has(a))];
  flowStore.set({ assumed });
  enter(STEP_INDEX[id], opts);
}

/* ---------------- 对外动作 ---------------- */

export function openFlowStart() {
  flowStore.set({ startOpen: true });
}

export function closeFlowStart() {
  flowStore.set({ startOpen: false });
}

export async function startFlow(opts: { mode: FlowMode; reset: boolean; from?: StepId }) {
  clearAll();
  // 按需加载：重置会牵出规则库、核查结果等较大的模块，不放进首屏
  if (opts.reset) (await import('@/state/reset')).resetDemo();
  flowStore.set({ ...INIT, active: true, mode: opts.mode, startedAt: Date.now(), nonce: st().nonce });
  flowPrefs.set({ panel: 'open' });
  if (opts.from) enterTarget(opts.from);
  else enter(STEP_INDEX[readySteps([])[0]]);
}

export function stopFlow() {
  clearAll();
  freezeClock(false);
  hideCursor(true);
  expectedPath = null;
  flowStore.set({ ...INIT, nonce: st().nonce + 1 });
}

/** 下一环节：可执行环节中排序最靠前的一个；正在执行的环节视为跳过完成 */
export function nextStep() {
  const s = st();
  if (!s.active || s.status === 'finished') return;
  const cur = STEPS[s.idx].id;
  const completed = s.status === 'running' && !s.completed.includes(cur) ? [...s.completed, cur] : s.completed;
  const ready = orderReady([...completed, ...s.assumed]);
  if (!ready.length) {
    clearAll();
    flowStore.set({ completed, status: 'finished', finishedAt: Date.now() });
    return;
  }
  flowStore.set({ completed });
  enter(STEP_INDEX[ready[0]], { keepPaused: s.paused });
}

/** 上一环节：回到上一个实际执行过的环节并重新执行 */
export function prevStep() {
  const s = st();
  if (!s.active || s.trail.length < 2) return;
  const prev = s.trail[s.trail.length - 2];
  flowStore.set({ trail: s.trail.slice(0, -1) });
  enterTarget(prev, { keepPaused: s.paused });
}

export function pauseFlow() {
  if (!st().active) return;
  vClearTimeout(walkTimer);
  vClearTimeout(advanceTimer);
  vClearTimeout(fallbackTimer);
  flowStore.set({ paused: true });
  freezeClock(true);
}

export function resumeFlow() {
  const s = st();
  if (!s.active) return;
  freezeClock(false);
  if (s.left && s.status === 'running') {
    enterTarget(STEPS[s.idx].id);
    return;
  }
  flowStore.set({ paused: false });
  if (s.status === 'step-done') scheduleAdvance();
  else if (s.status === 'running') {
    if (STEPS[s.idx].drive === 'walk') {
      if (pendingWalk === s.nonce) {
        pendingWalk = 0;
        walkTimer = vSetTimeout(() => walk(s.nonce, 0), 900);
      } else walk(s.nonce, s.sub);
    } else armFallback(s.nonce);
  }
}

/** 空格 / 大按钮：运行中→暂停；暂停→继续；逐步模式等待中→下一环节 */
export function togglePlay() {
  const s = st();
  if (!s.active || s.status === 'finished') return;
  if (s.paused) resumeFlow();
  else if (s.status === 'step-done' && s.mode === 'step') nextStep();
  else pauseFlow();
}

export function setFlowMode(mode: FlowMode) {
  flowStore.set({ mode });
  if (mode === 'auto') scheduleAdvance();
}

export function restartFlow() {
  void startFlow({ mode: st().mode, reset: true });
}

/**
 * 演示中（含整个流程已完成后）：切换到指定环节并执行它，暂停中则切过去仍保持暂停；
 * 完成后重放的环节执行完毕即回到“已完成”。未演示：切换角色并打开该环节所在页面（浏览模式）。
 */
export function goToStep(id: StepId) {
  const s = st();
  if (s.active) {
    // 因离开演示页面而自动暂停的不算“人为暂停”：点击环节后直接播放
    enterTarget(id, { keepPaused: s.paused && !s.left });
    return;
  }
  const step = stepById(id);
  if (sessionStore.get().role !== step.role) setRole(step.role);
  flowStore.set({ focus: id });
  navigate(step.route);
}

export function focusStep(id: StepId | null) {
  flowStore.set({ focus: id });
  if (id) flowPrefs.set({ panel: 'open' });
}

/*
 * 演示途中手动离开当前环节页面：
 * - 环节正在执行 → 暂停（页面状态已丢失，继续时重新执行该环节）；
 * - 环节已完成、等待下一环节 → 不打断，只记下页面状态已丢失（后续环节进入页面时用演示数据自行准备）。
 */
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    const s = st();
    if (!s.active || s.status === 'finished' || !expectedPath) return;
    const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
    if (path === expectedPath || s.left) return;
    // 离开演示页面后用户可能手动操作其他页面：不能让暂停冻结的时钟影响它们
    freezeClock(false);
    if (s.status === 'running') {
      vClearTimeout(walkTimer);
      vClearTimeout(advanceTimer);
      vClearTimeout(fallbackTimer);
      flowStore.set({ paused: true, left: true });
    } else flowStore.set({ left: true });
  });
}

/* ---------------- 页面接入 ---------------- */

export interface FlowCtl {
  nonce: number;
  /** 汇报当前子步骤（序号对应 workflow 中的 subs） */
  sub: (i: number) => void;
  /** 本环节完成 */
  done: () => void;
  /** 延时执行；环节切换或页面卸载时自动取消 */
  later: (ms: number, fn: () => void) => void;
  /** 演示光标移到元素并点击，然后执行动作（环节已切换则不执行） */
  click: (target: string | Element, fn?: () => void, actor?: ActorKey) => void;
  /** 演示光标移到元素上（不点击），可在到达后执行 then */
  hover: (target: string | Element, then?: () => void, actor?: ActorKey) => void;
}

/** 当前操作的“人”：当前子步骤的操作方是人则用它，否则用环节主责方，再否则默认子公司核查岗 */
function operator(): ActorKey {
  const s = st();
  const step = STEPS[s.idx];
  const sub = step?.subs[s.sub]?.actor;
  if (sub && HUMAN.includes(sub)) return sub;
  if (step && HUMAN.includes(step.actor)) return step.actor;
  const h = step?.with.find((a) => HUMAN.includes(a));
  return h ?? HUMAN[0];
}

function cursorApi(nonce: number) {
  const ok = () => !stale(nonce);
  return {
    click: (target: string | Element, fn?: () => void, actor?: ActorKey) =>
      cursorClick(
        target,
        actor ?? operator(),
        () => {
          fn?.();
          // 点击后若轮到机器执行（如点“一键校验”后进入后台批量），光标在点击动画结束后隐藏
          const s = st();
          const sub = STEPS[s.idx]?.subs[s.sub];
          if (sub && !HUMAN.includes(sub.actor)) hideCursor();
        },
        ok,
      ),
    hover: (target: string | Element, then?: () => void, actor?: ActorKey) => cursorHover(target, actor ?? operator(), then && (() => ok() && then())),
  };
}

/**
 * 页面接入全流程演示：
 * - 返回值：当前环节轮到本页面时为 ctl（可在 effect 中汇报进度），否则为 null；
 * - onEnter：进入该环节时调用一次（可返回清理函数，环节切换或卸载时调用）。
 */
export function useFlowStep(id: StepId, onEnter?: (ctl: FlowCtl) => void | (() => void)): FlowCtl | null {
  const nonce = useFlow((s) => (s.active && STEPS[s.idx]?.id === id ? s.nonce : 0));
  const ctl = useMemo<FlowCtl | null>(() => {
    if (!nonce) return null;
    return {
      nonce,
      sub: (i) => {
        if (stale(nonce) || st().status !== 'running') return;
        if (st().sub !== i) flowStore.set({ sub: i });
        armFallback(nonce);
      },
      done: () => complete(nonce),
      later: (ms, fn) => {
        stepTimers.push(vSetTimeout(() => !stale(nonce) && fn(), ms));
      },
      ...cursorApi(nonce),
    };
  }, [nonce]);
  const ref = useRef(onEnter);
  ref.current = onEnter;
  useEffect(() => {
    if (!ctl || !ref.current) return;
    const timers: number[] = [];
    const scoped: FlowCtl = {
      ...ctl,
      later: (ms, fn) => {
        timers.push(vSetTimeout(() => !stale(ctl.nonce) && fn(), ms));
      },
    };
    let cleanup: void | (() => void);
    // 延后到下一轮执行：开发模式 StrictMode 的“挂载-卸载-再挂载”只会真正执行一次
    const t = window.setTimeout(() => {
      cleanup = ref.current?.(scoped);
    }, 0);
    return () => {
      window.clearTimeout(t);
      timers.forEach((x) => vClearTimeout(x));
      if (typeof cleanup === 'function') cleanup();
    };
  }, [ctl]);
  return ctl;
}

/** 非 React 场景：当前是否处于全流程演示 */
export function flowActive() {
  return st().active;
}
