import { describe, expect, it } from 'vitest';
import { VirtualClock } from './clock';

function setup() {
  let now = 0;
  const clock = new VirtualClock(() => now);
  const advance = (ms: number) => {
    now += ms;
    clock.tick();
  };
  return { clock, advance };
}

describe('演示虚拟时钟', () => {
  it('1× 按真实时间触发，2× 提前一半', () => {
    const { clock, advance } = setup();
    const hits: string[] = [];
    clock.setTimeout(() => hits.push('a'), 1000);
    advance(999);
    expect(hits).toEqual([]);
    advance(1);
    expect(hits).toEqual(['a']);
    clock.setSpeed(2);
    clock.setTimeout(() => hits.push('b'), 1000);
    advance(499);
    expect(hits).toEqual(['a']);
    advance(1);
    expect(hits).toEqual(['a', 'b']);
  });

  it('等待中途调速立即生效（已过去的部分按旧速度计）', () => {
    const { clock, advance } = setup();
    let fired = false;
    clock.setTimeout(() => (fired = true), 1000);
    advance(400); // 已走 400
    clock.setSpeed(4); // 剩余 600 按 4× → 150ms
    advance(149);
    expect(fired).toBe(false);
    advance(1);
    expect(fired).toBe(true);
  });

  it('冻结（暂停）期间不推进，解冻后继续', () => {
    const { clock, advance } = setup();
    let fired = false;
    clock.setTimeout(() => (fired = true), 500);
    advance(200);
    clock.setFrozen(true);
    advance(10_000);
    expect(fired).toBe(false);
    clock.setFrozen(false);
    advance(299);
    expect(fired).toBe(false);
    advance(1);
    expect(fired).toBe(true);
  });

  it('按到期先后触发，取消的延时不触发', () => {
    const { clock, advance } = setup();
    const hits: number[] = [];
    clock.setTimeout(() => hits.push(2), 200);
    const id = clock.setTimeout(() => hits.push(9), 150);
    clock.setTimeout(() => hits.push(1), 100);
    clock.clearTimeout(id);
    advance(300);
    expect(hits).toEqual([1, 2]);
  });

  it('peekV 只读时间、不触发回调；冻结时不前进', () => {
    let now = 0;
    const clock = new VirtualClock(() => now);
    let fired = false;
    clock.setTimeout(() => (fired = true), 100);
    now = 150;
    expect(clock.peekV()).toBe(150);
    expect(fired).toBe(false);
    clock.tick();
    expect(fired).toBe(true);
    clock.setSpeed(2);
    now = 200;
    expect(clock.peekV()).toBe(250);
    clock.setFrozen(true);
    now = 400;
    expect(clock.peekV()).toBe(250);
  });
});
