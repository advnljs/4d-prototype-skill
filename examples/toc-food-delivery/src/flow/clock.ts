/**
 * 演示虚拟时钟：所有演示动画与全流程导演的延时都走这里。
 * - 播放速度（0.25× / 0.5× / 1× / 2×）随时可调，已在等待中的延时立即按新速度推进；
 * - 全流程演示暂停时冻结时钟，页面内的流水线、RPA 回放、导演脚本一起停住。
 * 实现：虚拟时间 = Σ(真实流逝 × 速度)；到期回调由一个轻量 ticker 触发。
 */
import { useSyncExternalStore } from 'react';

export const SPEEDS = [0.25, 0.5, 1, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export class VirtualClock {
  private v = 0;
  private last: number;
  private speed = 1;
  private frozen = false;
  private seq = 0;
  private timers = new Map<number, { due: number; fn: () => void }>();

  constructor(private now: () => number) {
    this.last = now();
  }

  /** 推进虚拟时间并触发到期回调（由 ticker 或测试调用） */
  tick() {
    const t = this.now();
    if (!this.frozen) this.v += (t - this.last) * this.speed;
    this.last = t;
    const due = [...this.timers].filter(([, x]) => x.due <= this.v).sort((a, b) => a[1].due - b[1].due);
    for (const [id, x] of due) {
      if (!this.timers.has(id)) continue;
      this.timers.delete(id);
      x.fn();
    }
  }

  setTimeout(fn: () => void, ms: number) {
    this.tick();
    const id = ++this.seq;
    this.timers.set(id, { due: this.v + Math.max(0, ms), fn });
    return id;
  }

  clearTimeout(id: number) {
    this.timers.delete(id);
  }

  setSpeed(s: number) {
    this.tick();
    this.speed = s;
  }

  getSpeed() {
    return this.speed;
  }

  setFrozen(f: boolean) {
    this.tick();
    this.frozen = f;
  }

  isFrozen() {
    return this.frozen;
  }

  pending() {
    return this.timers.size;
  }

  nowV() {
    this.tick();
    return this.v;
  }

  /** 只读当前虚拟时间，不触发到期回调（渲染期间调用必须用它，避免在渲染中改状态） */
  peekV() {
    return this.frozen ? this.v : this.v + (this.now() - this.last) * this.speed;
  }
}

const hasWindow = typeof window !== 'undefined';
const clock = new VirtualClock(() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
let ticking = 0;
const listeners = new Set<() => void>();

function loop() {
  ticking = 0;
  clock.tick();
  if (clock.pending()) ticking = window.setTimeout(loop, 16);
}

function ensureTicking() {
  if (hasWindow && !ticking && clock.pending()) ticking = window.setTimeout(loop, 16);
}

/** 按播放速度缩放的延时（演示用） */
export function vSetTimeout(fn: () => void, ms: number) {
  const id = clock.setTimeout(fn, ms);
  ensureTicking();
  return id;
}

export function vClearTimeout(id: number) {
  clock.clearTimeout(id);
}

export function getSpeed(): number {
  return clock.getSpeed();
}

export function setClockSpeed(s: number) {
  clock.setSpeed(s);
  listeners.forEach((l) => l());
}

export function freezeClock(f: boolean) {
  if (clock.isFrozen() === f) return;
  clock.setFrozen(f);
  listeners.forEach((l) => l());
  ensureTicking();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSpeed() {
  return useSyncExternalStore(subscribe, getSpeed, getSpeed);
}

export function useClockFrozen() {
  return useSyncExternalStore(subscribe, () => clock.isFrozen(), () => false);
}

/** 当前虚拟时间（毫秒）：动画按它计算进度，暂停（冻结）时自动停住；只读，不触发回调 */
export function vNow() {
  return clock.peekV();
}
