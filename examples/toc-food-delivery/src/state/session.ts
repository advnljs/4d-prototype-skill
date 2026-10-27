import { createStore, useStore } from '@/lib/store';
import { PEOPLE } from '@/domain/catalog';

/**
 * 演示角色：顶栏切换。toC 场景没有统一认证，四个角色分别对应用户端、商家端、骑手端与运营后台的登录账号。
 * 三端联动页同时展示三台手机，当前角色对应的手机高亮。
 */
export type RoleKey = 'user' | 'merchant' | 'rider' | 'ops';

export const ROLE_ORDER: RoleKey[] = ['user', 'merchant', 'rider', 'ops'];

export const USERS: Record<RoleKey, { role: RoleKey; name: string; full: string; roleName: string; app: string }> = {
  user: { role: 'user', name: PEOPLE.user.name, full: PEOPLE.user.full, roleName: '用户', app: '橙子到家 App' },
  merchant: { role: 'merchant', name: PEOPLE.merchant.name, full: PEOPLE.merchant.full, roleName: '商家', app: '橙子商家版' },
  rider: { role: 'rider', name: PEOPLE.rider.name, full: PEOPLE.rider.full, roleName: '骑手', app: '橙子骑手' },
  ops: { role: 'ops', name: PEOPLE.ops.name, full: PEOPLE.ops.full, roleName: '城市运营', app: '运营后台' },
};

export const sessionStore = createStore<{ role: RoleKey }>('session', () => ({ role: 'user' }));

if (!(sessionStore.get().role in USERS)) sessionStore.set({ role: 'user' });

export function useRole(): RoleKey {
  return useStore(sessionStore, (s) => s.role);
}

export function setRole(role: RoleKey) {
  sessionStore.set({ role });
}
