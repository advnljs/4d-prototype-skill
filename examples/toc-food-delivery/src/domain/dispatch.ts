/**
 * 智能调度（算法模拟，可解释）：召回 3 公里内未满载的骑手，按四个因子加权打分，给出 ETA。
 *   得分 = 距离分 × w距离 + 负载分 × w负载 + 顺路分 × w顺路 + 服务分 × w服务
 *   距离分 = max(0, 1 − 到店距离 / 3 公里)；负载分 = 1 − 手上单量 / 满载上限；顺路分 = 顺路度；服务分 = (评分 − 4) / 1
 * 权重是原型假设（见 B-04），方案讨论页可调整并实时重排。
 */
import { RIDER_CAPACITY, RIDERS, ROUTE_STORE_TO_CUSTOMER, SPEED_M_PER_MIN, routeKm, type Rider } from './catalog';
import { clamp, round2 } from '@/lib/format';
import type { Weather } from './pricing';

export interface Weights {
  distance: number;
  load: number;
  align: number;
  rating: number;
}

export const DEFAULT_WEIGHTS: Weights = { distance: 0.4, load: 0.25, align: 0.2, rating: 0.15 };

export const WEIGHT_LABEL: Record<keyof Weights, string> = { distance: '距离', load: '负载', align: '顺路', rating: '服务分' };

export interface Candidate {
  riderId: string;
  name: string;
  /** 到店距离（公里） */
  km: number;
  load: number;
  align: number;
  rating: number;
  parts: Record<keyof Weights, number>;
  score: number;
  /** 不参与派单的原因 */
  excluded?: string;
  /** 预计到店（业务时钟分钟） */
  arriveAt: number;
}

export interface DispatchDecision {
  at: number;
  weights: Weights;
  candidates: Candidate[];
  chosen: string;
  /** 预计到店 / 出餐 / 取餐 / 送达 */
  eta: { arrive: number; ready: number; pickup: number; deliver: number };
  promisedAt: number;
  deliveryKm: number;
  reason: string;
}

/** 接单确认 + 起步的耗时（分钟） */
export const ACCEPT_DELAY = 0.4;
/** 取餐交接（分钟） */
export const HANDOVER = 0.5;
/** 上楼与交付（分钟） */
export const LAST_MILE = 2;

export function travelMin(km: number, weather: Weather) {
  return (km * 1000) / SPEED_M_PER_MIN[weather];
}

function normalize(w: Weights): Weights {
  const s = w.distance + w.load + w.align + w.rating || 1;
  return { distance: w.distance / s, load: w.load / s, align: w.align / s, rating: w.rating / s };
}

export function scoreRider(r: Rider, at: number, weather: Weather, w: Weights = DEFAULT_WEIGHTS): Candidate {
  const nw = normalize(w);
  const km = routeKm(r.toStore);
  const parts = {
    distance: clamp(1 - km / 3, 0, 1),
    load: clamp(1 - r.load / RIDER_CAPACITY, 0, 1),
    align: clamp(r.align, 0, 1),
    rating: clamp(r.rating - 4, 0, 1),
  };
  const score = round2(parts.distance * nw.distance + parts.load * nw.load + parts.align * nw.align + parts.rating * nw.rating);
  return {
    riderId: r.id,
    name: r.short,
    km,
    load: r.load,
    align: r.align,
    rating: r.rating,
    parts,
    score,
    excluded: r.load >= RIDER_CAPACITY ? '已满载' : km > 3.5 ? '超出召回半径' : undefined,
    arriveAt: at + ACCEPT_DELAY + travelMin(km, weather),
  };
}

/** 五分钟向上取整 */
export const ceil5 = (m: number) => Math.ceil(m / 5) * 5;

export function decide(p: { at: number; acceptedAt: number; prepMin: number; weather: Weather; weights?: Weights; exclude?: string[]; riders?: Rider[] }): DispatchDecision {
  const w = p.weights ?? DEFAULT_WEIGHTS;
  const candidates = (p.riders ?? RIDERS)
    .map((r) => {
      const c = scoreRider(r, p.at, p.weather, w);
      return p.exclude?.includes(r.id) ? { ...c, excluded: c.excluded ?? '已改派' } : c;
    })
    .sort((a, b) => (a.excluded ? 1 : 0) - (b.excluded ? 1 : 0) || b.score - a.score);
  const best = candidates.find((c) => !c.excluded) ?? candidates[0];
  const deliveryKm = routeKm(ROUTE_STORE_TO_CUSTOMER);
  const ready = p.acceptedAt + p.prepMin;
  const pickup = Math.max(best.arriveAt, ready) + HANDOVER;
  const deliver = pickup + travelMin(deliveryKm, p.weather) + LAST_MILE;
  const second = candidates.filter((c) => !c.excluded)[1];
  return {
    at: p.at,
    weights: w,
    candidates,
    chosen: best.riderId,
    eta: { arrive: best.arriveAt, ready, pickup, deliver },
    promisedAt: ceil5(deliver + 2),
    deliveryKm,
    reason: second
      ? `${best.name}得分 ${best.score.toFixed(2)}，高于${second.name}（${second.score.toFixed(2)}）：${best.parts.align > second.parts.align ? '更顺路' : best.parts.distance > second.parts.distance ? '更近' : '负载更低'}`
      : `${best.name}是唯一可用骑手`,
  };
}

/** 骑手原地不动超过该时长（分钟）触发超时预警 */
export const STUCK_ALERT_MIN = 3;
/** 骑手到店后等餐超过该时长（分钟）触发等餐预警，并给骑手等餐补贴 */
export const WAIT_ALERT_MIN = 10;

/* ---------------- 午高峰运力预测（骑手上线环节） ---------------- */

export interface CapacityForecast {
  /** 高峰窗口 */
  window: string;
  /** 片区预计订单量 */
  orders: number;
  /** 每名骑手在高峰窗口内可完成的单量 */
  perRider: number;
  /** 需要的在线骑手数 */
  need: number;
  /** 10:50 已上线骑手数 */
  online: number;
  gap: number;
  /** 补运力动作 */
  action: string;
}

/** 片区午高峰运力预测：按天气与历史同期估算（参数为原型假设，见 A-07） */
export function capacityForecast(weather: Weather): CapacityForecast {
  const orders = weather === 'rain' ? 640 : 560;
  const perRider = weather === 'rain' ? 2.4 : 2.6;
  const need = Math.ceil(orders / perRider);
  const online = 198;
  const gap = Math.max(0, need - online);
  return {
    window: '11:30–13:00',
    orders,
    perRider,
    need,
    online,
    gap,
    action: gap ? `向片区内 ${gap * 3} 名未上线骑手推送冲单奖励（高峰每单 +1 元），预计 11:20 前补足` : '运力充足，无需补充',
  };
}
