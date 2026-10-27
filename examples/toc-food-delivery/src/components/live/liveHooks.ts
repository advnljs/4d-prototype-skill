import { useEffect, useState } from 'react';
import { MERCHANT, CUSTOMER, RIDERS, ROUTE_STORE_TO_CUSTOMER, pointAt, type Pt } from '@/domain/catalog';
import { useClockFrozen } from '@/flow/clock';
import { animProgress, useLiveUi, type Anim } from '@/state/live';
import { reached, type World } from '@/sim/world';

/** 骑行动画进行中时逐帧刷新，返回进度 0–1；没有动画时返回 null。暂停（时钟冻结）时停在原地。 */
export function useAnimTick(): { anim: Anim | null; p: number } {
  const a = useLiveUi((s) => s.anim);
  const frozen = useClockFrozen();
  const [, setT] = useState(0);
  useEffect(() => {
    if (!a || frozen) return;
    let raf = 0;
    const loop = () => {
      setT((x) => x + 1);
      if (animProgress(a) < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [a, frozen]);
  return { anim: a, p: animProgress(a) };
}

export type RiderMood = 'idle' | 'candidate' | 'moving' | 'waiting' | 'stuck' | 'delivering' | 'done' | 'off';

export interface RiderView {
  id: string;
  pt: Pt;
  mood: RiderMood;
  /** 是否当前订单的骑手 */
  mine: boolean;
}

/** 根据世界状态与当前动画，算出每个骑手在地图上的位置与状态 */
export function riderViews(w: World, anim: Anim | null, p: number): RiderView[] {
  const plan = w.plan;
  const cur = w.order?.riderId ?? null;
  const offered = reached(w, 'dispatched');
  return RIDERS.map((r) => {
    const mine = r.id === cur;
    if (!plan) return { id: r.id, pt: r.pos, mood: !reached(w, 'online') ? 'off' : offered ? (mine ? 'candidate' : 'idle') : 'idle', mine };
    const legs = plan.legs.map((l, i) => ({ ...l, i })).filter((l) => l.riderId === r.id);
    if (!legs.length) return { id: r.id, pt: r.pos, mood: 'off', mine };
    // 正在播放的路段
    const playing = anim ? legs.find((l) => l.i === anim.leg) : undefined;
    if (playing) {
      const reach = playing.stuckAt ?? 1;
      const pt = pointAt(playing.path, p * reach);
      const mood: RiderMood = playing.stuckAt !== undefined && p >= 1 ? 'stuck' : playing.kind === 'toCustomer' ? 'delivering' : 'moving';
      return { id: r.id, pt, mood, mine };
    }
    const toStore = legs.find((l) => l.kind === 'toStore')!;
    const toCustomer = legs.find((l) => l.kind === 'toCustomer');
    if (toStore.stuckAt !== undefined) {
      // 中途故障的骑手：改派后停在故障点
      const animLeg = anim?.leg ?? -1;
      if (reached(w, 'reassigned') || animLeg > toStore.i) return { id: r.id, pt: plan.stuck!.pos, mood: 'stuck', mine: false };
      return { id: r.id, pt: r.pos, mood: 'candidate', mine };
    }
    if (reached(w, 'delivered')) return toCustomer ? { id: r.id, pt: CUSTOMER.pos, mood: 'done', mine } : { id: r.id, pt: MERCHANT.pos, mood: 'idle', mine };
    if (reached(w, 'picked')) return { id: r.id, pt: MERCHANT.pos, mood: 'delivering', mine };
    if (reached(w, 'arrived')) return { id: r.id, pt: MERCHANT.pos, mood: 'waiting', mine };
    // 已接单、还没出发 / 动画已结束但世界尚未推进
    if (anim && anim.leg === toStore.i) return { id: r.id, pt: MERCHANT.pos, mood: 'waiting', mine };
    return { id: r.id, pt: r.pos, mood: 'candidate', mine };
  });
}

/** 配送途中，骑手距离用户还有多远（公里） */
export function remainingKm(w: World, anim: Anim | null, p: number) {
  const plan = w.plan;
  if (!plan) return null;
  const leg = plan.legs.length - 1;
  if (reached(w, 'delivered')) return 0;
  if (anim?.leg === leg) return Math.max(0, w.dispatch!.deliveryKm * (1 - p));
  if (reached(w, 'picked')) return w.dispatch!.deliveryKm;
  return null;
}

export const ROUTE = ROUTE_STORE_TO_CUSTOMER;

/** 业务时钟：动画进行中按进度在路段起止时刻之间插值 */
export function displayClock(w: World, anim: Anim | null, p: number) {
  const leg = anim && w.plan?.legs[anim.leg];
  if (!leg) return w.clock;
  return Math.max(w.clock, leg.start + (leg.end - leg.start) * p);
}
