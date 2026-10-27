import { useMemo } from 'react';
import { ruleLibOrgOf, type DemoUser } from '@/domain/orgs';
import { buildContext } from './context';
import { libName, libOf, libParams, libRules, useRuleLib } from './ruleLibs';
import { useUser } from './session';

/** 按工号匹配规则库：工号 → doc_user_org → 所属区域规则库（非 React 场景，如种子数据、测试） */
export function checkSetupFor(empNo: string, fallbackOrg = '100000') {
  const libOrg = ruleLibOrgOf(empNo) ?? fallbackOrg;
  const lib = libOf(libOrg);
  return { libOrg, lib, rules: libRules(lib), ctx: buildContext(libParams(lib)), libLabel: `${libName(libOrg)} ${lib.version}` };
}

/** 页面使用的核查配置：当前用户 → 所属区域规则库（规则库更新后实时生效） */
export function useCheckSetup() {
  const user: DemoUser = useUser();
  const libOrg = ruleLibOrgOf(user.empNo) ?? user.orgCode;
  const lib = useRuleLib(libOrg);
  const rules = useMemo(() => libRules(lib), [lib]);
  const ctx = useMemo(() => buildContext(libParams(lib)), [lib]);
  return { user, libOrg, lib, rules, ctx, version: lib.version, libLabel: `${libName(libOrg)} ${lib.version}`, libTitle: libName(libOrg) };
}
