import { describe, expect, it } from 'vitest';
import { USERS, ruleLibOrgOf, USER_ORG } from '@/domain/orgs';
import { proposeChanges, EXAMPLES } from '@/agent/ruleAuthor';
import { libOf, libRules, publishVersion, versionAt } from './ruleLibs';
import { checkSetupFor } from './useCheckSetup';

describe('区域规则库', () => {
  it('按工号匹配规则库：子公司 → 所属区域，区域 → 本区域，集团 → 集团', () => {
    expect(ruleLibOrgOf(USERS.checker.empNo)).toBe('110000');
    expect(ruleLibOrgOf(USERS.reviewer.empNo)).toBe('110000');
    expect(ruleLibOrgOf(USERS.tier2.empNo)).toBe('110000');
    expect(ruleLibOrgOf(USERS.tier1.empNo)).toBe('100000');
    expect(ruleLibOrgOf('F0030456')).toBe('120000');
    for (const u of USER_ORG) expect(ruleLibOrgOf(u.empNo), u.empNo).toBeTruthy();
  });

  it('各区域规则库独立：华东有区域规则，华南时限从严，华北停用用途说明笔统规则', () => {
    const ids = (org: string) => libRules(libOf(org)).map((r) => r.id);
    expect(ids('110000')).toEqual(expect.arrayContaining(['R701', 'R702', 'R705']));
    expect(ids('100000')).not.toContain('R702');
    expect(libOf('120000').items.R601.params.days).toBe(4);
    expect(ids('130000')).not.toContain('R102');
    expect(checkSetupFor('F0030456').ctx.params.R601.days).toBe(4);
  });

  it('发布版本只应用已确认的变更，未确认的留痕，且只影响本区域', () => {
    const before = libOf('110000');
    const p = proposeChanges(EXAMPLES[0], before, USERS.tier2);
    const [add, level, param] = p.changes;
    const v = publishVersion('110000', { who: '测试', via: 'nl', instruction: EXAMPLES[0], confirmed: [add, level], rejected: [param] });
    const after = libOf('110000');
    expect(v).toBe('v2026.10.4');
    expect(after.items.R706.enabled).toBe(true);
    expect(after.items.R405.level).toBe('error');
    expect(after.items.R601.params.days).toBe(5);
    expect(after.versions[0]).toMatchObject({ version: 'v2026.10.4', via: 'nl' });
    expect(after.versions[0].rejected.map((c) => c.ruleId)).toEqual(['R601']);
    expect(libOf('120000').items.R706).toBeUndefined();
    expect(versionAt(after, '2026-10-12 00:00')).toBe('v2026.10.3');
  });
});

describe('自然语言维护（智能体拆解变更）', () => {
  const lib = () => libOf('110000');
  const who = USERS.tier2;

  it('一句话拆成多条变更：新增规则（参数取自原话）、类别调整、参数调整', () => {
    const p = proposeChanges(EXAMPLES[0], libOf('140000'), who);
    expect(p.changes.map((c) => [c.kind, c.ruleId])).toEqual([
      ['add', 'R706'],
      ['level', 'R405'],
      ['param', 'R601'],
    ]);
    expect(p.changes[0].patch.params).toEqual({ threshold: 50000 });
    expect(p.changes[1]).toMatchObject({ before: '疑问数据', after: '错误数据' });
    expect(p.changes[2]).toMatchObject({ before: '5 个工作日', after: '4 个工作日' });
  });

  it('按本区域规则库判断：华南区域时限已是 4 个工作日，不重复变更', () => {
    const p = proposeChanges(EXAMPLES[0], libOf('120000'), who);
    expect(p.changes.some((c) => c.ruleId === 'R601')).toBe(false);
    expect(p.notes.some((n) => n.kind === 'duplicate' && n.text.includes('R601'))).toBe(true);
  });

  it('停用集团制度刚性规则会被拦下；重复、不可实现、信息不全分别处理', () => {
    const stop = proposeChanges(EXAMPLES[2], lib(), who);
    expect(stop.changes.find((c) => c.ruleId === 'R102')?.blocked).toBeUndefined();
    expect(stop.changes.find((c) => c.ruleId === 'R101')?.blocked).toContain('刚性');
    expect(proposeChanges(EXAMPLES[3], lib(), who).notes[0].kind).toBe('duplicate');
    expect(proposeChanges(EXAMPLES[4], lib(), who).notes[0].kind).toBe('infeasible');
    expect(proposeChanges(EXAMPLES[5], lib(), who).questions?.length).toBe(4);
  });
});
