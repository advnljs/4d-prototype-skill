import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mockLedger, SCENARIOS } from '@/mock/ledger';
import { checkRecord, hitsByMajor, runChecks, traceRule } from './engine';
import { RULES, RULE_MAP } from './catalog';
import { MAJORS } from './types';
import { buildBatchIndex, inconsistentGroups } from '@/agent/batchCountry';
import { buildXlsx } from '@/lib/xlsx/writer';
import { readXlsx } from '@/lib/xlsx/reader';
import { parseWorkbook } from '@/lib/docFile';
import { USERS } from '@/domain/orgs';
import type { BizType } from '@/domain/docs';
import { checkSetupFor } from '@/state/useCheckSetup';

const setup = checkSetupFor(USERS.checker.empNo);
const ALL = (['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b));
const run = runChecks(ALL, setup.rules, setup.ctx);

describe('三类演示台账合并为一个批次 × 华东区域规则库', () => {
  it('每个疑点情景恰好命中预期规则', () => {
    const scenarioRecs = run.results.filter((r) => SCENARIOS[r.rec.key]);
    expect(scenarioRecs.length).toBeGreaterThan(40);
    for (const res of scenarioRecs) {
      const got = res.findings.map((f) => f.ruleId).sort();
      expect({ title: SCENARIOS[res.rec.key].title, rules: got }).toEqual({ title: SCENARIOS[res.rec.key].title, rules: [...SCENARIOS[res.rec.key].rules].sort() });
    }
  });

  it('合规记录没有误报', () => {
    const bad = run.results
      .filter((r) => !SCENARIOS[r.rec.key] && r.findings.length)
      .map((r) => ({ key: r.rec.key, remark: r.rec.f.remark1, findings: r.findings.map((f) => `${f.ruleId} ${f.message}`) }));
    expect(bad).toEqual([]);
  });

  it('单据编号唯一，三类单据都在批次里', () => {
    expect(new Set(ALL.map((r) => r.key)).size).toBe(ALL.length);
    expect(new Set(ALL.map((r) => r.biz)).size).toBe(3);
  });

  it('误报拦截情景被记录为 cleared（用途说明含运费、子公司、平台多站点）', () => {
    const cleared = (t: string) => run.results.find((r) => SCENARIOS[r.rec.key]?.title === t)!.cleared.map((c) => c.ruleId);
    expect(cleared('误报拦截：货款中含少量运费')).toContain('R101');
    expect(cleared('误报拦截：客户在越南的子公司')).toContain('R406');
    expect(cleared('平台多站点收款（美国站）')).toContain('R405');
  });

  it('智能体规则可输出完整推理轨迹', () => {
    const rec = ALL.find((r) => SCENARIOS[r.key]?.title === '物流公司把海运费录成货款')!;
    const j = traceRule(rec, RULE_MAP.get('R101')!, run.ctx);
    expect(j.verdict).toBe('fail');
    expect(j.suggestion).toContain('210101');
    expect(j.steps!.map((s) => s.kind)).toEqual(expect.arrayContaining(['perceive', 'tool', 'retrieve', 'reason', 'reflect', 'verdict']));
  });

  it('跑批统计：语义组合数少于交易行数；疑点按大类统计，国别为一个大类', () => {
    expect(run.stats.total).toBe(ALL.length);
    expect(run.stats.semantic.uniqueCombos).toBeLessThan(run.stats.semantic.lines);
    expect(run.stats.estMs.batch).toBeLessThan(run.stats.estMs.online);
    const by = hitsByMajor(run.results);
    expect(by.country).toBeGreaterThanOrEqual(8);
    expect(Object.keys(by).length).toBeGreaterThanOrEqual(9);
  });

  it('规则编号唯一；每条规则都有大类与依据；每个大类都有规则', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) {
      expect(MAJORS.some((m) => m.key === r.major), r.id).toBe(true);
      expect(r.refs.length, r.id).toBeGreaterThan(0);
    }
    for (const m of MAJORS) expect(RULES.some((r) => r.major === m.key), m.key).toBe(true);
    // 国别规则至少 n 项，其中包含批次级“同一交易对方国别唯一”
    const country = RULES.filter((r) => r.major === 'country');
    expect(country.length).toBeGreaterThanOrEqual(5);
    expect(country.filter((r) => r.batchLevel).map((r) => r.id)).toEqual(['R405', 'R406']);
  });

  it('单笔核查没有批次信息时，批次级规则不适用', () => {
    const rec = ALL.find((r) => SCENARIOS[r.key]?.title === '同一交易对方国家/地区不唯一')!;
    expect(checkRecord(rec, [RULE_MAP.get('R405')!], setup.ctx).findings).toEqual([]);
  });
});

describe('批次级国别一致性（三类单据合并）', () => {
  const idx = run.ctx.batch!;

  it('名称完全相同与写法不同的国别不唯一都被找出，且以多数国别为建议', () => {
    const bad = Object.fromEntries(inconsistentGroups(idx).map((g) => [g.name, g.majority]));
    expect(bad).toMatchObject({ 'BLUEWAVE TEXTILE': 'HKG', 'ORIENT PACIFIC SHIPPING': 'SGP', 'SAKURA FINE CHEMICAL': 'JPN', 'HELVETIA PRECISION TOOLS': 'CHE' });
    const orient = idx.groups.find((g) => g.name === 'ORIENT PACIFIC SHIPPING')!;
    expect(orient.variants.length).toBe(2);
  });

  it('含地区限定词的子公司不合并，平台多站点被排除', () => {
    expect(idx.merges.some((m) => m.decision === 'keep-apart' && m.b.includes('VIETNAM'))).toBe(true);
    const amazon = idx.groups.find((g) => g.name.startsWith('AMAZON'))!;
    expect(amazon.exclude?.kind).toBe('platform');
    expect(inconsistentGroups(idx).some((g) => g.name.startsWith('AMAZON'))).toBe(false);
  });

  it('平局时没有多数国别', () => {
    const recs = mockLedger('receipt').filter((r) => r.f.counterparty.includes('BLUEWAVE')).slice(0, 2);
    const tie = buildBatchIndex([recs[0], { ...recs[1], key: 'x', f: { ...recs[1].f, country: 'SGP' } }]);
    expect(tie.groups[0].majority).toBeNull();
  });
});

describe('上传：三类工作表自动识别', () => {
  it('一个文件含三个工作表，按表头识别类别并合并；非标准工作表跳过', () => {
    const sheets = (['receipt', 'payment', 'settlement'] as BizType[]).map((b, i) => ({ name: ['收款', '付款', '进口结算'][i], rows: [[b], Object.keys(mockLedger(b)[0].raw), ...mockLedger(b).slice(0, 5).map((r) => Object.values(r.raw))] }));
    const r = parseWorkbook([...sheets, { name: 'Sheet1', rows: [['日期', '金额', '摘要', '对方']] }]);
    expect(r.ok).toBe(true);
    expect(r.sheets.filter((x) => x.ok).map((x) => x.biz)).toEqual(['receipt', 'payment', 'settlement']);
    expect(r.sheets.find((x) => x.name === 'Sheet1')?.ok).toBe(false);
    expect(r.records.length).toBe(15);
  });
});

describe('xlsx 读写', () => {
  it('写入后可读回（含中文、数字、空单元格）', async () => {
    const bytes = buildXlsx([
      { name: '测试', rows: [{ cells: ['总核查笔数', 3, '疑点笔数', 1], style: 'summary' }, { cells: ['疑点类型', '单据编号', null, '金额'], style: 'header' }, { cells: ['类别编码与用途说明不匹配', 'SK110102202610130001', '', 18650.5], style: 'flag' }] },
    ]);
    const sheets = await readXlsx(bytes.slice().buffer as ArrayBuffer);
    expect(sheets[0].name).toBe('测试');
    expect(sheets[0].rows[0]).toEqual(['总核查笔数', '3', '疑点笔数', '1']);
    expect(sheets[0].rows[2]).toEqual(['类别编码与用途说明不匹配', 'SK110102202610130001', '', '18650.5']);
  });
});

describe('文档同步', () => {
  it('docs/原型说明与待确认事项.md 包含页面中的全部假设与待确认编号', async () => {
    const { NOTE_GROUPS } = await import('@/content/notes');
    const doc = readFileSync('docs/原型说明与待确认事项.md', 'utf-8');
    const missing = NOTE_GROUPS.flatMap((g) => g.items.map((i) => i.id)).filter((id) => !doc.includes(`| ${id} |`));
    expect(missing).toEqual([]);
  });
});
