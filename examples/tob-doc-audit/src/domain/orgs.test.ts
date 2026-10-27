import { describe, expect, it } from 'vitest';
import { ORGS, USERS, orgByCode, tier2Of } from './orgs';

describe('演示组织', () => {
  it('演示角色的子公司与区域都在华东', () => {
    expect(orgByCode(USERS.checker.orgCode)?.name).toBe('杭州子公司');
    expect(tier2Of(USERS.checker.orgCode)?.name).toBe('华东区域财务中心');
    expect(orgByCode(USERS.tier2.orgCode)?.name).toBe('华东区域财务中心');
    expect(orgByCode(USERS.tier2.orgCode)?.level).toBe('tier2');
  });

  it('组织编码唯一，子公司都挂在已存在的区域下', () => {
    expect(new Set(ORGS.map((o) => o.code)).size).toBe(ORGS.length);
    for (const o of ORGS.filter((x) => x.level === 'sub')) expect(tier2Of(o.code), o.name).toBeDefined();
    expect(ORGS.filter((o) => o.parent === USERS.tier2.orgCode).map((o) => o.short)).toEqual(['上海', '杭州', '宁波', '合肥', '温州']);
  });
});
