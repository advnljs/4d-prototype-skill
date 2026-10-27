/**
 * 全流程演示的“鼠标”：移动到要操作的元素上，播放点击动画后再执行动作。
 * 光标颜色与标签表示“谁在操作”（用户 / 商家 / 骑手 / 运营）；机器执行的子步骤（平台服务、智能调度、定时任务、支付网关）隐藏光标。
 * 时间走演示虚拟时钟，随播放速度缩放。
 */
import { createStore } from '@/lib/store';
import { HUMAN, type ActorKey } from './actors';
import { vSetTimeout } from './clock';

export interface CursorState {
  visible: boolean;
  actor: ActorKey;
  /** 点击次数（变化时播放点击涟漪） */
  clicks: number;
}

export const cursorStore = createStore<CursorState>('cursor', () => ({ visible: false, actor: HUMAN[0], clicks: 0 }), { persist: false });

export { HUMAN };

/** 移动到目标的虚拟时长、按下与执行动作的时刻（毫秒，随播放速度缩放） */
export const CURSOR_MOVE = 700;
const ACT_DELAY = 180;

let target: Element | null = null;
let pending = 0;
let hideAfter = false;

export function cursorTarget() {
  return target;
}

type Target = string | Element;

/** 查找元素：页面状态刚变化时元素可能还没渲染，最多重试约 2 秒 */
function resolve(t: Target, cb: (el: Element | null) => void) {
  if (typeof t !== 'string') {
    cb(t);
    return;
  }
  let n = 0;
  const find = () => {
    const el = document.querySelector(t);
    if (el || n++ >= 20) cb(el);
    else window.setTimeout(find, 100);
  };
  find();
}

function bringIntoView(el: Element) {
  const r = el.getBoundingClientRect();
  // 正文内的元素以正文滚动区为准（底部可能停靠了“流程 · 数据”窗口），抽屉 / 弹窗内的以窗口为准
  const main = document.getElementById('main');
  const dock = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--flow-dock-h')) || 0;
  const box = main && main.contains(el) ? main.getBoundingClientRect() : { top: 0, bottom: window.innerHeight - dock };
  if (r.top < box.top + 64 || r.bottom > box.bottom - 24) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** 光标移到元素上（悬停，不点击） */
export function cursorHover(t: Target, actor: ActorKey, then?: () => void) {
  resolve(t, (el) => {
    if (!el) {
      then?.();
      return;
    }
    target = el;
    bringIntoView(el);
    hideAfter = false;
    cursorStore.set({ visible: true, actor });
    if (then) vSetTimeout(then, CURSOR_MOVE);
  });
}

/** 光标移到元素 → 点击动画 → 执行动作；找不到元素时直接执行 */
export function cursorClick(t: Target, actor: ActorKey, fn?: () => void, guard: () => boolean = () => true) {
  pending++;
  hideAfter = false;
  const finish = () => {
    pending = Math.max(0, pending - 1);
    if (!pending && hideAfter) {
      hideAfter = false;
      cursorStore.set({ visible: false });
    }
  };
  resolve(t, (el) => {
    if (!guard()) {
      finish();
      return;
    }
    if (!el) {
      fn?.();
      finish();
      return;
    }
    target = el;
    bringIntoView(el);
    cursorStore.set({ visible: true, actor });
    vSetTimeout(() => {
      if (guard()) cursorStore.set((s) => ({ clicks: s.clicks + 1 }));
    }, CURSOR_MOVE);
    vSetTimeout(() => {
      if (guard()) fn?.();
      finish();
    }, CURSOR_MOVE + ACT_DELAY);
  });
}

/** 隐藏光标（若有点击尚未完成，等点击结束后再隐藏） */
export function hideCursor(force = false) {
  if (pending && !force) {
    hideAfter = true;
    return;
  }
  pending = 0;
  hideAfter = false;
  cursorStore.set({ visible: false });
}
