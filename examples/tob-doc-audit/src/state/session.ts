import { createStore, useStore } from '@/lib/store';
import { PERMS, USERS, ruleLibOrgOf, type PermKey, type RoleKey } from '@/domain/orgs';

/**
 * 当前登录用户（系统集成：正式环境由统一认证带入工号，后台按 doc_user_org 确定组织、岗位与规则库；
 * 原型用顶栏“演示角色”切换模拟）。
 */
interface SessionState {
  role: RoleKey;
}

export const sessionStore = createStore<SessionState>('session', () => ({ role: 'checker' }));

/** 旧版本保存过已取消的岗位（如 teller）：回到子公司财务核查岗 */
if (!(sessionStore.get().role in USERS)) sessionStore.set({ role: 'checker' });

export function useRole(): RoleKey {
  return useStore(sessionStore, (s) => s.role);
}

export function useUser() {
  const role = useRole();
  return USERS[role];
}

/** 当前用户使用的规则库所属区域（按工号匹配） */
export function useRuleLibOrg(): string {
  const user = useUser();
  return ruleLibOrgOf(user.empNo) ?? user.orgCode;
}

export function useCan(perm: PermKey): boolean {
  const role = useRole();
  return PERMS[perm][role];
}

export function setRole(role: RoleKey) {
  sessionStore.set({ role });
}

/** 统一认证（模拟）：只携带工号，组织与岗位由后台查 doc_user_org */
export function portalCookie(empNo: string) {
  return `SSO_TOKEN=…; EMP_NO=${empNo}`;
}
