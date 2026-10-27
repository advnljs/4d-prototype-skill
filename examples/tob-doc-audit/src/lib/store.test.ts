import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from './store';

function fakeStorage(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return {
    map: m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('createStore 本机演示数据版本', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('未声明版本时沿用原存储键', () => {
    const ls = fakeStorage({ 'doc-audit:t': JSON.stringify({ n: 5 }) });
    vi.stubGlobal('window', { localStorage: ls });
    expect(createStore('t', () => ({ n: 0 })).get().n).toBe(5);
  });

  it('版本升级后旧数据作废并清除，新数据写入新键', () => {
    const ls = fakeStorage({ 'doc-audit:t': JSON.stringify({ n: 5 }), 'doc-audit:other': '{}' });
    vi.stubGlobal('window', { localStorage: ls });
    const s = createStore('t', () => ({ n: 0 }), { version: 2 });
    expect(s.get().n).toBe(0);
    expect(ls.map.has('doc-audit:t')).toBe(false);
    expect(ls.map.has('doc-audit:other')).toBe(true);
    s.set({ n: 7 });
    expect(JSON.parse(ls.map.get('doc-audit:t@2')!)).toEqual({ n: 7 });
    // 同一版本再次加载时读到已保存的数据
    expect(createStore('t', () => ({ n: 0 }), { version: 2 }).get().n).toBe(7);
  });
});
