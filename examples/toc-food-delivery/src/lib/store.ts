import { useSyncExternalStore } from 'react';

/**
 * 轻量全局状态：useSyncExternalStore + localStorage。
 * localStorage 只用于让演示数据（当前情景、券配置、演示进度、偏好）在刷新后保留；
 * 读写全部包裹 try/catch，在隐私模式或存储被禁用时退化为纯内存。
 * version：演示数据有不兼容调整时递增，换用新的存储键并清除旧键。
 */
const PREFIX = 'toc-delivery';

export function createStore<T extends object>(key: string, initial: () => T, opts: { persist?: boolean; version?: number } = {}) {
  const version = opts.version ?? 1;
  const keyOf = (v: number) => (v > 1 ? `${PREFIX}:${key}@${v}` : `${PREFIX}:${key}`);
  const storageKey = keyOf(version);
  const keep = opts.persist ?? true;
  let state: T = load();
  const listeners = new Set<() => void>();

  function load(): T {
    if (!keep || typeof window === 'undefined') return initial();
    try {
      for (let v = 1; v < version; v++) window.localStorage.removeItem(keyOf(v));
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return { ...initial(), ...(JSON.parse(raw) as Partial<T>) };
    } catch {
      /* 存储不可用时使用初始值 */
    }
    return initial();
  }

  function persist() {
    if (!keep || typeof window === 'undefined') return;
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
