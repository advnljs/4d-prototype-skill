import { describe, expect, it } from 'vitest';
import { USERS } from '@/domain/orgs';
import { batchFindings, batchRun, seedBatches, visibleBatches } from './results';

describe('核查结果留存与可见范围', () => {
  const all = seedBatches();

  it('近 30 天各组织都有批次，含界面上传与 RPA 接口上传', () => {
    expect(all.length).toBeGreaterThan(120);
    expect(all.some((b) => b.source === 'api')).toBe(true);
    expect(new Set(all.map((b) => b.orgCode.slice(0, 4))).size).toBeGreaterThan(4);
    expect(all.every((b) => b.time >= '2026-09-14' && b.time < '2026-10-14')).toBe(true);
  });

  it('批次统计与明细一致（明细按需重算）', () => {
    for (const b of all.slice(0, 15)) {
      const run = batchRun(b)!;
      expect(run.stats.total).toBe(b.total);
      expect(run.stats.suspicious).toBe(b.suspicious);
      expect(new Set(batchFindings(b).map((f) => f.docNo)).size).toBe(b.suspicious);
    }
  });

  it('子公司岗位只看本公司，区域看辖内，集团看全部', () => {
    const sub = visibleBatches(all, USERS.checker);
    const t2 = visibleBatches(all, USERS.tier2);
    const t1 = visibleBatches(all, USERS.tier1);
    expect(sub.every((b) => b.orgCode === USERS.checker.orgCode)).toBe(true);
    expect(t2.every((b) => b.orgCode.startsWith('11'))).toBe(true);
    expect(t2.length).toBeGreaterThan(sub.length);
    expect(t1.length).toBe(all.length);
  });
});
