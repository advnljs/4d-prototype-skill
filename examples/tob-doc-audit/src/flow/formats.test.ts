import { describe, expect, it } from 'vitest';
import { HEADERS } from '@/domain/docs';
import { DATA_ORDER } from './dataObjects';
import { formatSamples } from './formats';

const cellText = (c: unknown) => (c !== null && typeof c === 'object' ? String((c as { v: unknown }).v ?? '') : String(c ?? ''));

describe('文件 / 数据格式样例', () => {
  it('每种数据对象都有格式样例', () => {
    for (const k of DATA_ORDER) expect(formatSamples(k).length, k).toBeGreaterThan(0);
  });

  it('三类单据：一个文件三个工作表，第二行为各自的标准表头', () => {
    const ss = formatSamples('docFile');
    expect(ss.map((x) => (x.kind === 'sheet' ? x.sheet.name : ''))).toEqual(['收款', '付款', '进口结算']);
    const s = ss[0];
    if (s.kind !== 'sheet') throw new Error('应为表格');
    expect(s.sheet.rows[1].cells.map(cellText)).toEqual(HEADERS.receipt);
  });

  it('结果文件：各类疑点工作表首行汇总、第一列疑点类型、整行标红；国别疑点单独一张', () => {
    const ss = formatSamples('resultXlsx');
    const names = ss.map((x) => (x.kind === 'sheet' ? x.sheet.name : ''));
    expect(names).toEqual(['收款疑点', '付款疑点', '进口结算疑点', '国别疑点']);
    const s = ss[0];
    if (s.kind !== 'sheet') throw new Error('应为表格');
    expect(cellText(s.sheet.rows[0].cells[0])).toBe('总核查笔数');
    expect(cellText(s.sheet.rows[1].cells[0])).toBe('疑点类型');
    expect(s.sheet.rows.slice(2).every((r) => r.style === 'flag')).toBe(true);
    expect(s.naming).toContain('核查结果-核查日期-员工编号-流水号');
    const c = ss[3];
    if (c.kind !== 'sheet') throw new Error('应为表格');
    expect(c.sheet.rows[1].cells.map(cellText).slice(0, 4)).toEqual(['疑点类型', '交易对方（清洗后）', '本批次国别分布', '建议国别']);
    expect(c.sheet.rows.length).toBeGreaterThan(4);
  });

  it('用户组织表、规则库表、版本表都给出库表结构与样例行', () => {
    for (const k of ['userOrg', 'ruleLib', 'ruleDiff', 'batchRecord'] as const) {
      const t = formatSamples(k)[0];
      expect(t.kind, k).toBe('table');
      if (t.kind === 'table') expect(t.rows.length, k).toBeGreaterThan(0);
    }
  });
});
