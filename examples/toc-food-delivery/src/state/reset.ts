import { resetLive } from './live';
import { sessionStore } from './session';
import { couponDraft } from './ops';

/**
 * 清空演示过程中产生的数据，恢复初始状态（“假设与待确认”页的重置按钮、开始演示时“从初始状态开始”都调用它）。
 * 当前情景保留不变；只通过动态 import 使用，不进首屏。
 */
export function resetDemo() {
  resetLive();
  couponDraft.reset();
  sessionStore.reset();
}
