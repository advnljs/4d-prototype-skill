/**
 * 三端联动页的演示状态：当前情景 + 模拟世界（持久化，刷新后保留）+ 界面临时状态（手机屏幕、骑行动画、推送横幅）。
 * 页面按钮与 4D 编排脚本调用同一组函数；世界的推进全部交给 sim/world.ts 的纯函数，结果确定。
 */
import { useStore, createStore } from '@/lib/store';
import { vNow, vSetTimeout } from '@/flow/clock';
import { SCENARIO_MAP, type ScenarioKey } from '@/sim/scenarios';
import { STAGES, advanceTo, initWorld, next, stageIdx, type Push, type Stage, type World } from '@/sim/world';
import { clamp } from '@/lib/format';

export type UserScreen = 'home' | 'shop' | 'cart' | 'cashier' | 'order' | 'rate' | 'refund';

export interface Anim {
  /** world.plan.legs 的下标 */
  leg: number;
  startV: number;
  durV: number;
}

export interface Banner extends Push {
  id: number;
}

interface LiveUi {
  /** 用户端屏幕覆盖（null = 按阶段自动） */
  userScreen: UserScreen | null;
  /** 浏览菜单时已加购的件数（下单前的界面状态） */
  picked: Record<string, number>;
  anim: Anim | null;
  banners: Banner[];
  /** 派单打分是否在地图上显示 */
  scores: boolean;
  /** 召回半径动画 */
  radar: number;
}

export const liveStore = createStore<{ scenario: ScenarioKey; world: World }>('live', () => ({ scenario: 'standard', world: initWorld('standard') }), { version: 3 });

// 本机保存的数据不完整或来自旧版本（阶段名已不存在）时，按情景回到初始状态
{
  const s = liveStore.get();
  if (!SCENARIO_MAP[s.scenario]) liveStore.reset();
  else if (!s.world || !STAGES.includes(s.world.stage) || s.world.scenario !== s.scenario) liveStore.set({ world: initWorld(s.scenario) });
}

const UI_INIT = (): LiveUi => ({ userScreen: null, picked: {}, anim: null, banners: [], scores: false, radar: 0 });
export const liveUi = createStore<LiveUi>('live-ui', UI_INIT, { persist: false });

export function useWorld(): World {
  return useStore(liveStore, (s) => s.world);
}

export function useScenario(): ScenarioKey {
  return useStore(liveStore, (s) => s.scenario);
}

export function useLiveUi<S>(sel: (s: LiveUi) => S): S {
  return useStore(liveUi, sel);
}

let bannerSeq = 0;

/** 推送横幅：在对应手机顶部滑入，约 3.6 秒（虚拟时间）后收起 */
function showBanners(pushes: Push[]) {
  if (!pushes.length) return;
  const items = pushes.map((p) => ({ ...p, id: ++bannerSeq }));
  liveUi.set((s) => ({ banners: [...s.banners.filter((b) => !items.some((x) => x.to === b.to)), ...items] }));
  for (const it of items) vSetTimeout(() => liveUi.set((s) => ({ banners: s.banners.filter((b) => b.id !== it.id) })), 3600);
}

/** 把世界设置到“刚好处于 stage”的状态（回退或快进，都从初始状态确定性重算） */
export function prepareAt(stage: Stage) {
  const { world, scenario } = liveStore.get();
  if (world.stage === stage) return world;
  const base = stageIdx(world.stage) < stageIdx(stage) ? world : initWorld(scenario);
  const w = advanceTo(base, stage);
  liveStore.set({ world: w });
  liveUi.set({ userScreen: null, picked: {}, anim: null, banners: [], scores: false });
  return w;
}

/** 执行到 stage（当前正好在它前一个阶段时只执行一步；落后则先快进） */
export function advance(stage: Stage) {
  const { world } = liveStore.get();
  if (stageIdx(world.stage) >= stageIdx(stage)) return world;
  const before = stageIdx(world.stage) < stageIdx(stage) - 1 ? advanceTo(world, STAGES[stageIdx(stage) - 1]) : world;
  const w = next(before);
  liveStore.set({ world: w });
  showBanners(w.pushes.slice(before.pushes.length));
  return w;
}

export function setScenario(key: ScenarioKey) {
  liveStore.set({ scenario: key, world: initWorld(key) });
  liveUi.reset();
}

export function resetLive() {
  const { scenario } = liveStore.get();
  liveStore.set({ world: initWorld(scenario) });
  liveUi.reset();
}

export function setUserScreen(s: UserScreen | null) {
  liveUi.set({ userScreen: s });
}

export function pickDish(id: string, delta = 1) {
  liveUi.set((s) => ({ picked: { ...s.picked, [id]: Math.max(0, (s.picked[id] ?? 0) + delta) } }));
}

/** 开始一段骑行动画（地图上的骑手沿路线平滑移动，速度随播放速度缩放，暂停即停） */
export function ride(leg: number, durMs: number) {
  liveUi.set({ anim: { leg, startV: vNow(), durV: durMs } });
}

export function animProgress(a: Anim | null) {
  if (!a) return 0;
  return clamp((vNow() - a.startV) / a.durV, 0, 1);
}

export function setScores(on: boolean) {
  liveUi.set({ scores: on });
}

export function pulseRadar() {
  liveUi.set((s) => ({ radar: s.radar + 1 }));
}

/** 骑行动画的时长（毫秒，1× 时）：按路段业务分钟数压缩，保证看得清又不拖沓 */
export function legDuration(w: World, leg: number) {
  const l = w.plan?.legs[leg];
  if (!l) return 0;
  const min = l.end - l.start;
  return Math.round(clamp(900 + min * 330, 1600, 6200));
}
