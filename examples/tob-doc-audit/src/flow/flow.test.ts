import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mockLedger } from '@/mock/ledger';
import { runChecks } from '@/rules/engine';
import { USERS } from '@/domain/orgs';
import type { BizType } from '@/domain/docs';
import { checkSetupFor } from '@/state/useCheckSetup';
import { ACTORS } from './actors';
import { DATA_OBJECTS } from './dataObjects';
import { counterpartyLineage, recordLineage } from './lineage';
import { DAG_COLS, DAG_POS, EDGES, PHASES, STEPS, STEP_INDEX, ancestorsOf, depsOf, levelOf, orderReady, pathOf, readySteps, stepById, stepsForRoute, type StepId } from './workflow';

const SRC = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [readFileSync(p, 'utf8')] : [];
  });
}

describe('全流程定义', () => {
  const all = sources(SRC).join('\n');
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');

  it('环节按阶段顺序排列，阶段内连续', () => {
    const order = STEPS.map((s) => PHASES.findIndex((p) => p.key === s.phase));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(STEPS.map((s) => s.id)).size).toBe(STEPS.length);
  });

  it('每个环节的页面、操作方、数据对象都存在', () => {
    for (const s of STEPS) {
      expect(app, s.id).toContain(`case '${pathOf(s.route)}':`);
      for (const a of [s.actor, ...s.with, ...s.subs.map((x) => x.actor)]) expect(ACTORS[a], `${s.id} ${a}`).toBeTruthy();
      for (const k of [...s.inputs, ...s.outputs]) expect(DATA_OBJECTS[k], `${s.id} ${k}`).toBeTruthy();
      expect(s.subs.length, s.id).toBeGreaterThan(0);
      expect(s.with, s.id).not.toContain(s.actor);
    }
  });

  it('每个子步骤都标注了正在使用的数据对象，且属于该环节的输入或产出', () => {
    for (const s of STEPS)
      for (const x of s.subs) {
        expect(DATA_OBJECTS[x.data], `${s.id} ${x.title}`).toBeTruthy();
        expect([...s.inputs, ...s.outputs], `${s.id} ${x.title} → ${x.data}`).toContain(x.data);
      }
  });

  it('页面驱动的环节都有页面接入 useFlowStep', () => {
    for (const s of STEPS.filter((x) => x.drive === 'page')) expect(all, s.id).toContain(`useFlowStep('${s.id}'`);
  });

  it('子步骤引用的高亮锚点在页面中存在', () => {
    for (const s of STEPS)
      for (const x of s.subs)
        if (x.anchor) expect(all.includes(`data-flow-anchor="${x.anchor}"`) || all.includes(`anchor="${x.anchor}"`), `${s.id} → ${x.anchor}`).toBe(true);
  });

  it('自动衔接只发生在同一页面的前序环节', () => {
    for (const s of STEPS) {
      if (s.chain) {
        const prev = STEPS[STEP_INDEX[s.id] - 1];
        expect(pathOf(prev.route)).toBe(pathOf(s.route));
        expect(depsOf(s.id)).toContain(prev.id);
      }
    }
  });

  it('按路由与页签识别当前环节', () => {
    expect(stepsForRoute('/check', null).filter((x) => x.exact).map((x) => x.step.id)).toEqual(['upload-ui', 'check-run', 'auto-export']);
    // 没写页签的环节（界面上传那一支）在任何页签下都算本页
    expect(stepsForRoute('/check', 'api').filter((x) => x.exact).map((x) => x.step.id)).toEqual(['upload-api', 'writeback', 'upload-ui', 'check-run', 'auto-export']);
    expect(stepsForRoute('/rules', 'nl').filter((x) => x.exact).map((x) => x.step.id)).toEqual(['rule-nl', 'rule-tune']);
    expect(stepsForRoute('/rules', 'users').find((x) => x.exact)?.step.id).toBe('org-sync');
    expect(stepsForRoute('/rules', 'catalog').some((x) => x.exact)).toBe(false);
    expect(stepsForRoute('/results', null).map((x) => x.step.id)).toEqual(['review', 'rectify', 'branch-view']);
    expect(stepsForRoute('/notes', null)).toEqual([]);
  });
});

describe('环节的需求地位', () => {
  it('夜间跑批与误报回流为原型补充 · 可选，且写明依据', () => {
    expect(stepById('night-batch').necessity).toBe('optional');
    expect(stepById('rule-tune').necessity).toBe('optional');
    for (const s of STEPS.filter((x) => x.necessity)) expect(s.basis, s.id).toBeTruthy();
  });

  it('非可选环节不依赖任何可选环节（去掉可选环节不影响主流程）', () => {
    const optional = new Set(STEPS.filter((s) => s.necessity === 'optional').map((s) => s.id));
    for (const s of STEPS.filter((x) => x.necessity !== 'optional')) expect([...ancestorsOf(s.id)].filter((a) => optional.has(a)), s.id).toEqual([]);
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
      expect(stepById(e.from).outputs, `${e.from} 产出 ${e.data}`).toContain(e.data);
      expect(stepById(e.to).inputs, `${e.to} 输入 ${e.data}`).toContain(e.data);
    }
  });

  it('布局从左到右：下游所在列大于全部上游，且不重叠、不超出列数', () => {
    for (const e of EDGES) expect(DAG_POS[e.to].col, `${e.from}>${e.to}`).toBeGreaterThan(DAG_POS[e.from].col);
    const cells = STEPS.map((s) => `${DAG_POS[s.id].col}:${DAG_POS[s.id].row}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const s of STEPS) expect(DAG_POS[s.id].col).toBeLessThan(DAG_COLS);
    expect(Math.max(...STEPS.map((s) => levelOf(s.id)))).toBe(DAG_COLS - 1);
  });

  it('主数据、规则库与界面上传可并行启动，各分支最终汇合到区域与驾驶舱', () => {
    expect(readySteps([])).toEqual(['org-sync', 'policy', 'upload-ui']);
    const anc = ancestorsOf('cockpit');
    expect(STEPS.filter((s) => s.id !== 'cockpit' && !anc.has(s.id)).map((s) => s.id)).toEqual(['night-batch', 'rule-tune']);
    expect(ancestorsOf('branch-view').has('upload-api')).toBe(true);
    expect(ancestorsOf('branch-view').has('auto-export')).toBe(true);
  });

  it('组织主数据扇出到规则维护与两种上传的核查；回写与整改汇入驾驶舱', () => {
    expect(EDGES.filter((e) => e.from === 'org-sync').map((e) => e.to).sort()).toEqual(['check-run', 'rule-nl', 'upload-api']);
    expect(depsOf('cockpit').sort()).toEqual(['branch-view', 'rectify', 'writeback']);
    expect(depsOf('writeback')).toEqual(['upload-api']);
    expect(stepById('writeback').chain).toBe(true);
    expect(depsOf('rectify')).toEqual(['review']);
  });

  it('按“可执行环节中排序最靠前”调度，恰好走完全部环节且每步依赖已满足', () => {
    const done: StepId[] = [];
    while (done.length < STEPS.length) {
      const ready = readySteps(done);
      expect(ready.length).toBeGreaterThan(0);
      expect(depsOf(ready[0]).every((d) => done.includes(d))).toBe(true);
      done.push(ready[0]);
    }
    expect(done).toEqual(STEPS.map((s) => s.id));
    expect(readySteps(done)).toEqual([]);
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

  it('按 STEPS（业务时间）顺序调度：从头运行与 STEPS 顺序一致', () => {
    expect(simulate([], [])).toEqual(STEPS.map((s) => s.id));
  });

  it('直接从“复核岗在线查看”开始：上游全部视为完成，先补齐接口上传与回写，再整改、汇合，可选环节最后', () => {
    const assumed = [...ancestorsOf('review')];
    expect(assumed.sort()).toEqual(['auto-export', 'check-run', 'org-sync', 'policy', 'rule-nl', 'upload-ui']);
    const order = simulate(['review'], assumed);
    expect(order).toEqual(['review', 'upload-api', 'writeback', 'rectify', 'branch-view', 'cockpit', 'night-batch', 'rule-tune']);
    expect(order.length + assumed.length).toBe(STEPS.length);
  });
});

describe('数据流转（lineage）', () => {
  const setup = checkSetupFor(USERS.checker.empNo);
  const run = runChecks((['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b)), setup.rules, setup.ctx);

  it('界面上传的一笔：上传行 → 标准化 → 规则库 → 批次级国别 → 语义键 → 判定 → 结果 → 导出 → 留存', () => {
    const res = run.results.find((r) => r.findings.some((f) => f.ruleId === 'R406'))!;
    const stages = recordLineage(res, run.rules, run.ctx, { source: 'ui', libLabel: setup.libLabel, empNo: USERS.checker.empNo });
    expect(stages.map((s) => s.key).slice(0, 9)).toEqual(['raw', 'std', 'lib', 'batch', 'sem', 'judge', 'result', 'export', 'save']);
    expect(stages[0]).toMatchObject({ actor: 'checker' });
    expect(stages[1].fields.find((f) => f.k === 'f.code1')).toMatchObject({ change: 'map', note: '← 类别编码1' });
    expect(stages[3].fields.find((f) => f.k === '多数国别')?.v).toBe('SGP');
    const exp = stages.find((s) => s.key === 'export')!;
    expect(exp.fields.some((f) => f.k.startsWith('国别疑点'))).toBe(true);
    expect(stages.find((s) => s.key === 'save')!.fields.some((f) => f.change === 'drop')).toBe(true);
  });

  it('接口上传的一笔：第一步由 RPA 产生', () => {
    const res = run.results.find((r) => r.rec.biz === 'payment' && r.status === 'fail')!;
    expect(recordLineage(res, run.rules, run.ctx, { source: 'api' })[0]).toMatchObject({ key: 'raw', actor: 'rpa' });
  });

  it('一个交易对方：三类记录 → 清洗 → 归并 → 国别分布 → 国别疑点 → 国别疑点工作表', () => {
    const r = counterpartyLineage(run)!;
    expect(r.stages.map((s) => s.key)).toEqual(['rows', 'clean', 'group', 'dist', 'finding', 'sheet']);
    expect(r.subject).toBe('ORIENT PACIFIC SHIPPING');
    expect(r.stages[1].fields.length).toBeGreaterThan(3);
  });
});
