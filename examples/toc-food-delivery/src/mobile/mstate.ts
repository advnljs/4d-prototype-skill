/**
 * 手机版的界面状态：当前打开的 App、用户端底部页签、状态栏颜色、演示面板等。
 * 业务状态（模拟世界）与 PC 版共用 state/live.ts。
 */
import { createStore, useStore } from '@/lib/store';

export type AppKey = 'home' | 'user' | 'merchant' | 'rider' | 'ops';
export type UserTab = 'home' | 'orders' | 'mine';
export type OpsTab = 'board' | 'coupon' | 'settle';

interface MUi {
  app: AppKey;
  tab: UserTab;
  /** 用户在订单进行中返回了首页（演示中忽略） */
  detached: boolean;
  /** 状态栏文字颜色（深色背景用 light） */
  tone: 'light' | 'dark';
  panel: boolean;
  panelTab: 'ctl' | 'flow' | 'data' | 'events';
  start: boolean;
  toast: { id: number; text: string } | null;
}

export const mUi = createStore<MUi>(
  'm-ui',
  () => ({ app: 'home', tab: 'home', detached: false, tone: 'light', panel: false, panelTab: 'ctl', start: false, toast: null }),
  { persist: false },
);

export function useM<S>(sel: (s: MUi) => S): S {
  return useStore(mUi, sel);
}

export function openApp(app: AppKey) {
  mUi.set({ app, detached: false });
}

export function goHome() {
  mUi.set({ app: 'home' });
}

let toastSeq = 0;
export function mToast(text: string) {
  const id = ++toastSeq;
  mUi.set({ toast: { id, text } });
  window.setTimeout(() => {
    if (mUi.get().toast?.id === id) mUi.set({ toast: null });
  }, 2200);
}
