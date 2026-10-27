/**
 * 流程定义的不变量：保证流程定义与页面接入、锚点、数据对象、依赖图布局、调度、文档始终一致。
 * 每次改流程（加环节、改依赖、重排）都跑；任何一条失败都说明某个视图会显示错或演示会卡住。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTORS } from './actors';
import { DATA_OBJECTS, DATA_ORDER } from './dataObjects';
import { formatSamples } from './formats';
import { moneyLineage, orderLineage } from './lineage';
import { DAG_COLS, DAG_MAX_ROW, DAG_POS, EDGES, PHASES, STEPS, STEP_INDEX, ancestorsOf, depsOf, levelOf, orderReady, pathOf, readySteps, stepById, stepsForRoute, type StepId } from './workflow';
import { NOTE_GROUPS } from '@/content/notes';
import { SCENARIOS } from '@/sim/scenarios';
import { runScenario } from '@/sim/world';

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('流程定义', () => {
  const all = sources(SRC).join('\n');
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');

  it('环节按阶段顺序排列，id 唯一', () => {
    const order = STEPS.map((s) => PHASES.findIndex((p) => p.key === s.phase));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
  });

  it('每个环节的页面路由、操作方、数据对象都存在，子步骤不为空', () => {
    for (const s of STEPS) {
      expect(app, `${s.id} → ${pathOf(s.route)}`).toContain(`case '${pathOf(s.route)}'`);
      for (const a of [s.actor, ...s.with, ...s.subs.map((x) => x.actor)]) expect(ACTORS[a], `${s.id} ${a}`).toBeTruthy();
      for (const k of [...s.inputs, ...s.outputs]) expect(DATA_OBJECTS[k], `${s.id} ${k}`).toBeTruthy();
      expect(s.subs.length, s.id).toBeGreaterThan(0);
      expect(s.with, s.id).not.toContain(s.actor);
    }
  });

  it('每个子步骤的数据对象属于该环节的输入或产出', () => {
    for (const s of STEPS) for (const x of s.subs) expect([...s.inputs, ...s.outputs], `${s.id} ${x.title} → ${x.data}`).toContain(x.data);
  });

  it('页面驱动的环节都有页面接入 useFlowStep；walk 型环节的页面也接入（自备上游）', () => {
    for (const s of STEPS) expect(all, s.id).toContain(`useFlowStep('${s.id}'`);
  });

  it('子步骤引用的高亮锚点在页面中存在', () => {
    for (const s of STEPS)
      for (const x of s.subs)
        if (x.anchor) expect(all.includes(`data-flow-anchor="${x.anchor}"`) || all.includes(`anchor="${x.anchor}"`), `${s.id} → ${x.anchor}`).toBe(true);
  });

  it('演示光标点击的目标在页面中存在', () => {
    const targets = [...all.matchAll(/c\.click\('\[data-demo="([^"$]+)"\]'/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(10);
    for (const t of targets) expect(all.includes(`data-demo="${t}"`), t).toBe(true);
  });

  it('自动衔接只发生在同一页面的前序环节', () => {
    for (const s of STEPS.filter((x) => x.chain)) {
      const prev = STEPS[STEP_INDEX[s.id] - 1];
      expect(pathOf(prev.route), s.id).toBe(pathOf(s.route));
      expect(depsOf(s.id), s.id).toContain(prev.id);
    }
  });

  it('按路由与页签识别当前环节', () => {
    expect(stepsForRoute('/ops', null).filter((x) => x.exact).map((x) => x.step.id)).toEqual(['ops']);
    expect(stepsForRoute('/ops', 'coupon').filter((x) => x.exact).map((x) => x.step.id)).toEqual(['coupon']);
    expect(stepsForRoute('/live', null).map((x) => x.step.id)).toEqual(['menu', 'shift', 'order', 'pay', 'accept', 'dispatch', 'arrive', 'cook', 'deliver', 'confirm', 'refund']);
    expect(stepsForRoute('/settle', null).map((x) => x.step.id)).toEqual(['reconcile', 'settle', 'payout', 'offset']);
    expect(stepsForRoute('/notes', null)).toEqual([]);
  });
});

describe('流程依赖图（DAG）', () => {
  it('依赖边引用有效环节，无重复、无自环', () => {
    const ids = new Set(STEPS.map((s) => s.id));
    const keys = EDGES.map((e) => `${e.from}>${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of EDGES) {
      expect(ids.has(e.from) && ids.has(e.to), `${e.from}>${e.to}`).toBe(true);
      expect(e.from).not.toBe(e.to);
    }
  });

  it('无环，且 STEPS 顺序是一种拓扑序', () => {
    for (const e of EDGES) expect(STEP_INDEX[e.from], `${e.from}>${e.to}`).toBeLessThan(STEP_INDEX[e.to]);
    for (const s of STEPS) expect(ancestorsOf(s.id).has(s.id)).toBe(false);
  });

  it('沿边传递的数据与两端环节的产出、输入一致', () => {
    for (const e of EDGES.filter((x) => x.data)) {
      expect(stepById(e.from).outputs, `${e.from} outputs ${e.data}`).toContain(e.data);
      expect(stepById(e.to).inputs, `${e.to} inputs ${e.data}`).toContain(e.data);
    }
  });

  it('布局从左到右：下游所在列大于全部上游，且不重叠、不超出列数与行数', () => {
    for (const e of EDGES) expect(DAG_POS[e.to].col, `${e.from}>${e.to}`).toBeGreaterThan(DAG_POS[e.from].col);
    const cells = STEPS.map((s) => `${DAG_POS[s.id].col}:${DAG_POS[s.id].row}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const s of STEPS) {
      expect(DAG_POS[s.id].col).toBeLessThan(DAG_COLS);
      expect(DAG_POS[s.id].row).toBeLessThanOrEqual(DAG_MAX_ROW);
    }
    expect(Math.max(...STEPS.map((s) => levelOf(s.id)))).toBeLessThanOrEqual(DAG_COLS - 1);
  });

  it('商家一支（接单 → 备餐出餐）与调度一支（运力 + 支付 → 派单 → 骑手到店）并行，在取餐配送汇合', () => {
    expect(ancestorsOf('accept').has('dispatch')).toBe(false);
    expect(ancestorsOf('dispatch').has('accept')).toBe(false);
    expect(ancestorsOf('cook').has('arrive')).toBe(false);
    expect(ancestorsOf('arrive').has('cook')).toBe(false);
    expect(depsOf('dispatch').sort()).toEqual(['pay', 'shift']);
    expect(depsOf('deliver').sort()).toEqual(['arrive', 'cook']);
  });

  it('资金一支：渠道对账只依赖支付流水；结算等对账与已完成订单；冲减在退款与结算汇合', () => {
    expect(depsOf('reconcile')).toEqual(['pay']);
    expect(depsOf('settle').sort()).toEqual(['confirm', 'reconcile']);
    expect(depsOf('payout')).toEqual(['settle']);
    expect(depsOf('offset').sort()).toEqual(['refund', 'settle']);
  });

  it('从头运行按业务时间推进：11:53 派单在 12:05 出餐之前，骑手到店在出餐之前', () => {
    const order = STEPS.map((s) => s.id);
    expect(order.indexOf('dispatch')).toBeLessThan(order.indexOf('cook'));
    expect(order.indexOf('arrive')).toBeLessThan(order.indexOf('cook'));
  });

  it('按“可执行环节中排序最靠前”调度，恰好走完全部环节', () => {
    const done: StepId[] = [];
    while (done.length < STEPS.length) {
      const ready = readySteps(done);
      expect(ready.length).toBeGreaterThan(0);
      done.push(ready[0]);
    }
    expect(done).toEqual(STEPS.map((s) => s.id));
  });

  function simulate(start: StepId[], assumed: StepId[]) {
    const done: StepId[] = [...assumed];
    const order: StepId[] = [];
    const run = (id: StepId) => {
      expect(depsOf(id).every((d) => done.includes(d)), id).toBe(true);
      done.push(id);
      order.push(id);
    };
    start.forEach(run);
    while (done.length < STEPS.length) run(orderReady(done)[0]);
    return order;
  }

  it('从头运行与 STEPS 顺序一致', () => {
    expect(simulate([], [])).toEqual(STEPS.map((s) => s.id));
  });

  it('从任一环节开始：上游视为完成，其余环节都能走完', () => {
    for (const s of STEPS) {
      const assumed = [...ancestorsOf(s.id)];
      expect(simulate([s.id], assumed).length + assumed.length, s.id).toBe(STEPS.length);
    }
  });
});

describe('环节的需求地位', () => {
  it('结算为需求必需、售后与下期冲减为原型补充 · 可选，都写明依据', () => {
    expect(stepById('settle').necessity).toBe('required');
    expect(stepById('refund').necessity).toBe('optional');
    expect(stepById('offset').necessity).toBe('optional');
    for (const s of STEPS.filter((x) => x.necessity)) expect(s.basis, s.id).toBeTruthy();
  });

  it('非可选环节不依赖任何可选环节（去掉可选环节不影响主流程）', () => {
    const optional = new Set(STEPS.filter((s) => s.necessity === 'optional').map((s) => s.id));
    for (const s of STEPS.filter((x) => x.necessity !== 'optional')) expect([...ancestorsOf(s.id)].filter((a) => optional.has(a)), s.id).toEqual([]);
  });
});

describe('数据格式样例与数据流转', () => {
  it('每种数据对象在每个情景下都有格式样例', () => {
    for (const k of DATA_ORDER) expect(formatSamples(k).length, k).toBeGreaterThan(0);
  });

  it('结算对账文件：标题、汇总、表头，演示订单高亮，汇总勾稽', () => {
    const s = formatSamples('settlement')[0];
    if (s.kind !== 'sheet') throw new Error('应为表格');
    expect(s.sheet.rows[2].cells[0]).toBe('订单号');
    expect(s.sheet.rows.length).toBe(3 + 24);
    expect(s.sheet.rows.filter((r) => r.style === 'summary')).toHaveLength(2);
    expect(s.sheet.rows[1].cells[13]).toBe('全部平衡');
  });

  it('订单流转覆盖从加购到结算的阶段，状态迁移与订单轨迹一致', () => {
    for (const sc of SCENARIOS) {
      const w = runScenario(sc.key);
      const st = orderLineage(w);
      expect(st.map((x) => x.key)).toEqual(['cart', 'pricing', 'order', 'pay', 'accept', 'dispatch', 'deliver', 'review', 'settle', 'refund']);
      expect(st.find((x) => x.key === 'pay')!.fields.find((f) => f.k === 'trade_no')!.v).toBe(w.order!.tradeNo);
      expect(st.find((x) => x.key === 'settle')!.fields.some((f) => f.change === 'drop')).toBe(true);
    }
  });

  it('钱的流转：四方之和等于实付', () => {
    const w = runScenario('standard');
    const split = moneyLineage(w).find((x) => x.key === 'split')!;
    expect(split.fields.find((f) => f.k === '勾稽')!.v).toBe('¥49.00 = 实付');
  });
});

describe('文档同步', () => {
  it('docs/原型说明与待确认事项.md 包含页面中的全部假设与待确认编号', () => {
    const doc = readFileSync(join(SRC, '..', 'docs', '原型说明与待确认事项.md'), 'utf8');
    for (const g of NOTE_GROUPS) for (const it of g.items) expect(doc, it.id).toContain(`| ${it.id} | ${it.title} |`);
  });

  it('流程与代码中引用的假设编号都在清单里', () => {
    const ids = new Set(NOTE_GROUPS.flatMap((g) => g.items.map((i) => i.id)));
    const text = sources(SRC).join('\n');
    const refs = new Set([...text.matchAll(/\b([ABCDQ]-\d{2})\b/g)].map((m) => m[1]));
    for (const r of refs) expect(ids.has(r), r).toBe(true);
  });
});
