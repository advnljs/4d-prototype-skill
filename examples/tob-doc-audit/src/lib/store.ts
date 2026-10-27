import { useSyncExternalStore } from 'react';

/**
 * 轻量全局状态：useSyncExternalStore + localStorage。
 * localStorage 只用于让演示数据（历史核查记录、规则调整、基准库维护）在刷新后保留；
 * 读写全部包裹 try/catch，在隐私模式或存储被禁用时退化为纯内存。
 */
/** 演示示例数据版本（核查结果、判例库、规则库等）：示例数据有不兼容调整时递增 */
export const DEMO_DATA_VERSION = 2;

export function createStore<T extends object>(key: string, initial: () => T, opts: { persist?: boolean; version?: number } = {}) {
  // version：示例数据有不兼容调整时递增，换用新的存储键；本机保存的旧版本数据作废并清除
  const version = opts.version ?? 1;
  const storageKey = version > 1 ? `doc-audit:${key}@${version}` : `doc-audit:${key}`;
  const keep = opts.persist ?? true;
  let state: T = load();
  const listeners = new Set<() => void>();

  function load(): T {
    if (!keep) return initial();
    try {
      for (let v = 1; v < version; v++) window.localStorage.removeItem(v > 1 ? `doc-audit:${key}@${v}` : `doc-audit:${key}`);
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return { ...initial(), ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      /* 存储不可用时使用初始值 */
    }
    return initial();
  }

  function persist() {
    if (!keep) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* 存储不可用时仅保留内存状态 */
    }
  }

  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...next };
      persist();
      listeners.forEach((l) => l());
    },
    reset() {
      state = initial();
      persist();
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type Store<T extends object> = ReturnType<typeof createStore<T>>;

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}
