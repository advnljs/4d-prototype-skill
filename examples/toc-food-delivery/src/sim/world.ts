/**
 * 模拟后端：一单外卖的“世界状态”与一组纯函数动作（World → World）。
 * 页面、4D 编排、格式样例、数据流转与测试都调用同一套动作，结果完全确定、可复现。
 * advanceTo(world, stage) 把世界推进到指定阶段：任一环节单独执行时，页面用它“自备上游”。
 * 业务时钟 clock 是自 0 点起的分钟数；次日的时刻 ≥ 1440。
 */
import { CUSTOMER, DEMO_DATE, MERCHANT, RIDERS, RIDER_MAP, ROUTE_STORE_TO_CUSTOMER, pointAt, routeLength, type Pt } from '@/domain/catalog';
import { ACCEPT_DELAY, HANDOVER, LAST_MILE, STUCK_ALERT_MIN, WAIT_ALERT_MIN, capacityForecast, decide, travelMin, type CapacityForecast, type DispatchDecision } from '@/domain/dispatch';
import { applyOrder, applyRider, createOrder, orderNo, type Order, type Who } from '@/domain/orderMachine';
import { handleCallback, payCallback, payRequest, refundCallback, refundRequest, tradeNoOf, type CallbackResult, type PayCallback, type PayRequest, type RefundCallback, type RefundRequest } from '@/domain/payment';
import { LUNCH_COUPON, deliveryFee, prepMinutes, price, type CartLine, type CouponTpl, type Pricing } from '@/domain/pricing';
import { payoutBatch, reconcile, refundCalc, riderPay, settleOrder, summarize, type Payout, type ReconResult, type RefundCalc, type SettleLine, type SettleSummary } from '@/domain/settlement';
import { seedSettleLines } from '@/domain/seed';
import { hms, hm } from '@/lib/format';
import { REFUND_ITEM, SCENARIO_MAP, type ScenarioKey } from './scenarios';

export const STAGES = [
  'init',
  'coupon',
  'store',
  'online',
  'cart',
  'ordered',
  'paid',
  'accepted',
  'dispatched',
  'riderAccepted',
  'reassigned',
  'arrived',
  'ready',
  'picked',
  'delivered',
  'confirmed',
  'rated',
  'reconciled',
  'settled',
  'paidOut',
  'refundApplied',
  'refundApproved',
  'refunded',
  'offset',
] as const;

export type Stage = (typeof STAGES)[number];

export const stageIdx = (s: Stage) => STAGES.indexOf(s);
export const reached = (w: World, s: Stage) => stageIdx(w.stage) >= stageIdx(s);

export type EventKind = 'info' | 'ok' | 'warn' | 'error';

export interface SysEvent {
  at: number;
  who: Who;
  kind: EventKind;
  title: string;
  detail?: string;
}

export interface Push {
  at: number;
  to: 'user' | 'merchant' | 'rider';
  title: string;
  body: string;
}

export interface Leg {
  riderId: string;
  path: Pt[];
  start: number;
  end: number;
  kind: 'toStore' | 'toCustomer';
  /** 中途停下（车辆故障） */
  stuckAt?: number;
}

export interface Plan {
  legs: Leg[];
  arriveAt: number;
  readyAt: number;
  pickupAt: number;
  deliverAt: number;
  waitMin: number;
  stuck: { at: number; alertAt: number; reassignAt: number; acceptAt: number; pos: Pt } | null;
}

export interface TrackPoint {
  at: number;
  riderId: string;
  x: number;
  y: number;
  speed: number;
  phase: '取餐途中' | '等餐' | '配送中' | '原地不动';
}

export interface Review {
  at: number;
  stars: number;
  riderStars: number;
  tags: string[];
  text: string;
}

/** 下一结算周期的退款冲减 */
export interface OffsetEntry {
  at: number;
  /** 被冲减的结算周期（订单日期） */
  cycle: string;
  orderNo: string;
  refundNo: string;
  refund: number;
  merchantAdj: number;
  platformAdj: number;
}

export interface World {
  scenario: ScenarioKey;
  stage: Stage;
  clock: number;
  coupon: CouponTpl;
  claimed: boolean;
  storeOpen: boolean;
  onShelf: string[];
  /** 骑手上线与午高峰运力预测 */
  pool: { at: number; forecast: CapacityForecast; riders: string[] } | null;
  cart: CartLine[];
  pricing: Pricing | null;
  order: Order | null;
  payReq: PayRequest | null;
  callbacks: { at: number; cb: PayCallback; result: CallbackResult }[];
  processed: string[];
  dispatch: DispatchDecision | null;
  reassign: { at: number; from: string; to: string; reason: string; decision: DispatchDecision } | null;
  plan: Plan | null;
  track: TrackPoint[];
  late: number;
  compensation: number;
  review: Review | null;
  recon: ReconResult | null;
  settle: { line: SettleLine; batch: SettleLine[]; summary: SettleSummary } | null;
  payout: Payout | null;
  offset: OffsetEntry | null;
  refund: { calc: RefundCalc; reason: string; appliedAt: number; req?: RefundRequest; approvedAt?: number; cb?: RefundCallback; doneAt?: number } | null;
  events: SysEvent[];
  pushes: Push[];
}

/** 关键时刻（业务时钟，分钟） */
export const T = {
  coupon: 10 * 60 + 30,
  store: 10 * 60 + 45,
  online: 10 * 60 + 50,
  cart: 11 * 60 + 51,
  order: 11 * 60 + 52,
  pay: 11 * 60 + 52.3,
  dup: 11 * 60 + 52.8,
  accept: 11 * 60 + 53,
  dispatch: 11 * 60 + 53.2,
  riderAccept: 11 * 60 + 53.6,
  recon: 1440 + 60,
  settle: 1440 + 2 * 60,
  payout: 1440 + 8 * 60,
  refundApply: 1440 + 9 * 60 + 30,
  refundApprove: 1440 + 9 * 60 + 35,
  refundDone: 1440 + 9 * 60 + 35.4,
  /** 下一结算周期：后天 02:00 */
  offset: 2 * 1440 + 2 * 60,
};

export function initWorld(scenario: ScenarioKey = 'standard'): World {
  return {
    scenario,
    stage: 'init',
    clock: 10 * 60 + 20,
    coupon: { ...LUNCH_COUPON },
    claimed: false,
    storeOpen: false,
    onShelf: [],
    pool: null,
    cart: [],
    pricing: null,
    order: null,
    payReq: null,
    callbacks: [],
    processed: [],
    dispatch: null,
    reassign: null,
    plan: null,
    track: [],
    late: 0,
    compensation: 0,
    review: null,
    recon: null,
    settle: null,
    payout: null,
    offset: null,
    refund: null,
    events: [],
    pushes: [],
  };
}

/** 业务时钟所在的日期：0 = 演示当天，1 = 次日，2 = 后天 */
export const dayOf = (min: number) => Math.floor(min / 1440);

const DATES = [DEMO_DATE, '2026-10-19', '2026-10-20'];

/** 网关报文里的时间串 */
export const stamp = (min: number) => `${DATES[dayOf(min)]} ${hms(min % 1440)}`;

/** “后天 02:00” / “次日 02:00” / “11:52” */
export const clockLabel = (min: number) => (dayOf(min) >= 2 ? `后天 ${hm(min % 1440)}` : dayOf(min) === 1 ? `次日 ${hm(min - 1440)}` : hm(min));

const scen = (w: World) => SCENARIO_MAP[w.scenario];

type NewEvent = Omit<SysEvent, 'at'> & { at?: number };
type NewPush = Omit<Push, 'at'> & { at?: number };

/** 进入新阶段：事件与推送默认记在本阶段时刻，也可以各自指定更早的时刻 */
function step(w: World, stage: Stage, at: number, patch: Partial<World>, events: NewEvent[] = [], pushes: NewPush[] = []): World {
  return {
    ...w,
    ...patch,
    stage,
    clock: Math.max(w.clock, at),
    events: [...w.events, ...events.map((e) => ({ ...e, at: e.at ?? at }))],
    pushes: [...w.pushes, ...pushes.map((p) => ({ ...p, at: p.at ?? at }))],
  };
}

function need(w: World, s: Stage) {
  if (stageIdx(w.stage) !== stageIdx(s) - 1) throw new Error(`当前阶段 ${w.stage}，不能执行 ${s}`);
}

const yuan = (fen: number) => `${(fen / 100).toFixed(2)} 元`;

/* ---------------- 动作 ---------------- */

export function publishCoupon(w: World): World {
  need(w, 'coupon');
  const coupon: CouponTpl = { ...w.coupon, status: 'published', version: w.coupon.version + 1, publishedAt: T.coupon };
  return step(w, 'coupon', T.coupon, { coupon }, [{ who: 'ops', kind: 'ok', title: `平台券「${coupon.name}」v${coupon.version} 已发布`, detail: `门槛 ${yuan(coupon.threshold)}（按商家优惠后金额），面额 ${yuan(coupon.off)}，限量 ${coupon.quota} 张，${coupon.window} 可用，平台承担` }]);
}

export function openStore(w: World): World {
  need(w, 'store');
  return step(w, 'store', T.store, { storeOpen: true, onShelf: ['D01', 'D02', 'D03', 'D04', 'D05'] }, [{ who: 'merchant', kind: 'ok', title: `${MERCHANT.short}开店营业`, detail: '上架 5 个菜品，设置库存与出餐时长；满 30 减 3、满 50 减 6 活动生效' }]);
}

/** 骑手上线：调度先做片区午高峰运力预测，有缺口时推送冲单奖励；商家附近 4 名骑手上线听单 */
export function ridersOnline(w: World): World {
  need(w, 'online');
  const forecast = capacityForecast(scen(w).params.weather);
  const riders = RIDERS.map((r) => r.id);
  return step(w, 'online', T.online, { pool: { at: T.online, forecast, riders } }, [
    { at: T.online - 2, who: 'dispatch', kind: forecast.gap ? 'warn' : 'info', title: `午高峰运力预测：${forecast.window} 预计 ${forecast.orders} 单，需 ${forecast.need} 名骑手`, detail: `已上线 ${forecast.online} 名${forecast.gap ? `，缺口 ${forecast.gap} 名：${forecast.action}` : '，运力充足'}` },
    { who: 'rider', kind: 'ok', title: `商家附近 ${riders.length} 名骑手上线听单`, detail: RIDERS.map((r) => `${r.short}（手上 ${r.load} 单）`).join('、') },
  ]);
}

export function distanceKm() {
  return Math.round((routeLength(ROUTE_STORE_TO_CUSTOMER) * 5) / 100) / 10;
}

export function fillCart(w: World): World {
  need(w, 'cart');
  const cart = scen(w).params.cart;
  const pricing = price({ lines: cart, coupon: w.coupon, distanceKm: distanceKm(), weather: scen(w).params.weather });
  return step(w, 'cart', T.cart, { cart, claimed: true, pricing }, [
    { who: 'user', kind: 'info', title: '领取平台券并加购', detail: cart.map((l) => `${l.dishId}×${l.qty}`).join('、') },
    { who: 'platform', kind: pricing.couponApplied ? 'ok' : 'warn', title: `价格试算：实付 ${yuan(pricing.payable)}`, detail: pricing.couponApplied ? `商家满减 ${yuan(pricing.merchantOff)} + 平台券 ${yuan(pricing.couponOff)}` : pricing.couponHint ?? undefined },
  ]);
}

export function submitOrder(w: World): World {
  need(w, 'ordered');
  const pr = w.pricing!;
  const no = orderNo(DEMO_DATE, T.order, 12);
  const order = createOrder(no, { merchantId: MERCHANT.id, customerId: CUSTOMER.id, lines: w.cart, pricing: pr, at: T.order });
  const payReq = payRequest(no, pr.payable, `${MERCHANT.short} · ${pr.lines.length} 件商品`);
  return step(w, 'ordered', T.order, { order, payReq }, [
    { who: 'platform', kind: 'info', title: `创建订单 ${no}（待支付）`, detail: `锁定价格与库存 15 分钟；调起收银台，向网关下单 ${yuan(pr.payable)}` },
  ]);
}

export function payOrder(w: World): World {
  need(w, 'paid');
  const req = w.payReq!;
  let order = w.order!;
  let processed = [...w.processed];
  const callbacks: World['callbacks'] = [];
  const events: NewEvent[] = [];
  const cb1 = payCallback(req, stamp(T.pay), 1);
  const r1 = handleCallback(cb1, order.pricing.payable, processed);
  callbacks.push({ at: T.pay, cb: cb1, result: r1 });
  events.push({ who: 'gateway', kind: 'info', title: '支付网关异步回调（第 1 次）', detail: `trade_no ${cb1.trade_no}，金额 ${yuan(cb1.total_amount)}` });
  if (r1.result === 'processed') {
    processed.push(cb1.trade_no);
    order = applyOrder(order, 'pay_success', 'platform', T.pay, '验签通过，金额一致', { tradeNo: cb1.trade_no });
    events.push({ who: 'platform', kind: 'ok', title: '验签通过，订单已支付', detail: '推送新订单给商家，同时提交调度' });
  }
  if (scen(w).params.dupCallback) {
    const cb2 = payCallback(req, stamp(T.pay), 2);
    const r2 = handleCallback(cb2, order.pricing.payable, processed);
    callbacks.push({ at: T.dup, cb: cb2, result: r2 });
    events.push({ at: T.dup, who: 'gateway', kind: 'warn', title: '网关未收到 ack，重发回调（第 2 次）', detail: `同一 trade_no ${cb2.trade_no}` });
    events.push({ at: T.dup, who: 'platform', kind: 'ok', title: '幂等：重复回调已忽略', detail: r2.result === 'ignored' ? r2.reason : '' });
  }
  return {
    ...step(w, 'paid', T.pay, { order, callbacks: [...w.callbacks, ...callbacks], processed }, events, [
      { to: 'user', title: '支付成功', body: `已支付 ${yuan(order.pricing.payable)}，等待商家接单` },
      { to: 'merchant', title: '您有新订单 #12', body: `${order.pricing.lines.map((l) => `${l.name}×${l.qty}`).join('、')}，请尽快接单` },
    ]),
  };
}

export function merchantAccept(w: World): World {
  need(w, 'accepted');
  const order = applyOrder(w.order!, 'merchant_accept', 'merchant', T.accept);
  const prep = scen(w).params.prepMin ?? prepMinutes(w.cart);
  return step(w, 'accepted', T.accept, { order }, [{ who: 'merchant', kind: 'ok', title: '商家接单，开始备餐', detail: `预计出餐 ${hm(T.accept + prepMinutes(w.cart))}${prep !== prepMinutes(w.cart) ? `（后厨积压，实际需 ${prep} 分钟）` : ''}` }], [{ to: 'user', title: '商家已接单', body: `${MERCHANT.short}正在为你备餐` }]);
}

export function runDispatch(w: World): World {
  need(w, 'dispatched');
  const d = decide({ at: T.dispatch, acceptedAt: T.accept, prepMin: prepMinutes(w.cart), weather: scen(w).params.weather });
  const order = applyRider(w.order!, 'offer', 'dispatch', T.dispatch, d.reason, { riderId: d.chosen });
  const usable = d.candidates.filter((c) => !c.excluded);
  return step(w, 'dispatched', T.dispatch, { order, dispatch: d }, [
    { who: 'dispatch', kind: 'info', title: `召回候选骑手 ${d.candidates.length} 名`, detail: d.candidates.map((c) => `${c.name} ${c.km.toFixed(1)}km/${c.load}单${c.excluded ? `（${c.excluded}）` : ''}`).join('，') },
    { who: 'dispatch', kind: 'ok', title: `派给${RIDER_MAP[d.chosen].short}（得分 ${usable[0].score.toFixed(2)}）`, detail: `${d.reason}；预计 ${clockLabel(d.eta.deliver)} 送达，承诺 ${clockLabel(d.promisedAt)} 前` },
  ], [{ to: 'rider', title: '新派单', body: `${MERCHANT.short} → ${CUSTOMER.address.replace('滨湖区', '')}，${d.deliveryKm.toFixed(1)} 公里` }]);
}

/** 根据情景生成到店 / 出餐 / 取餐 / 送达的时间线与骑行路段 */
export function makePlan(w: World): Plan {
  const s = scen(w).params;
  const d = w.dispatch!;
  const speed = travelMin(1, s.weather);
  const readyAt = T.accept + (s.prepMin ?? prepMinutes(w.cart));
  const r1 = RIDER_MAP[d.chosen];
  const start1 = T.riderAccept + ACCEPT_DELAY;
  const legs: Leg[] = [];
  let arriveAt: number;
  let stuck: Plan['stuck'] = null;
  if (s.stuck) {
    const stuckAt = 11 * 60 + 57;
    const total = routeLength(r1.toStore);
    const frac = Math.min(0.9, (((stuckAt - start1) / speed) * 1000) / 5 / total);
    const pos = pointAt(r1.toStore, frac);
    legs.push({ riderId: r1.id, path: r1.toStore, start: start1, end: stuckAt, kind: 'toStore', stuckAt: frac });
    const alertAt = stuckAt + STUCK_ALERT_MIN;
    const reassignAt = alertAt + 0.5;
    const d2 = decide({ at: reassignAt, acceptedAt: T.accept, prepMin: prepMinutes(w.cart), weather: s.weather, exclude: [r1.id] });
    const r2 = RIDER_MAP[d2.chosen];
    const acceptAt = reassignAt + 0.4;
    const start2 = acceptAt + ACCEPT_DELAY;
    arriveAt = start2 + travelMin((routeLength(r2.toStore) * 5) / 1000, s.weather);
    legs.push({ riderId: r2.id, path: r2.toStore, start: start2, end: arriveAt, kind: 'toStore' });
    stuck = { at: stuckAt, alertAt, reassignAt, acceptAt, pos };
  } else {
    arriveAt = start1 + travelMin((routeLength(r1.toStore) * 5) / 1000, s.weather);
    legs.push({ riderId: r1.id, path: r1.toStore, start: start1, end: arriveAt, kind: 'toStore' });
  }
  const pickupAt = Math.max(arriveAt, readyAt) + HANDOVER;
  const ride = travelMin(d.deliveryKm, s.weather);
  const finalRider = legs[legs.length - 1].riderId;
  legs.push({ riderId: finalRider, path: ROUTE_STORE_TO_CUSTOMER, start: pickupAt, end: pickupAt + ride, kind: 'toCustomer' });
  return { legs, arriveAt, readyAt, pickupAt, deliverAt: pickupAt + ride + LAST_MILE, waitMin: Math.max(0, readyAt - arriveAt), stuck };
}

/** 每分钟一个轨迹点（平台约每 5 秒收到一次上报，这里按分钟抽样展示；坐标为示意平面坐标，单位米） */
export function makeTrack(plan: Plan): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (const leg of plan.legs) {
    const dur = Math.max(0.01, leg.end - leg.start);
    const reach = leg.stuckAt ?? 1;
    const kmh = Math.round(((routeLength(leg.path) * reach * 5) / 1000 / dur) * 60 * 10) / 10;
    for (let t = Math.ceil(leg.start); t <= leg.end + 1e-6; t++) {
      const p = pointAt(leg.path, ((t - leg.start) / dur) * reach);
      pts.push({ at: t, riderId: leg.riderId, x: Math.round(p.x * 5), y: Math.round(p.y * 5), speed: kmh, phase: leg.kind === 'toStore' ? '取餐途中' : '配送中' });
    }
  }
  if (plan.stuck) {
    const s = plan.stuck;
    for (let t = Math.floor(s.at) + 1; t <= s.reassignAt; t++) pts.push({ at: t, riderId: plan.legs[0].riderId, x: Math.round(s.pos.x * 5), y: Math.round(s.pos.y * 5), speed: 0, phase: '原地不动' });
  }
  const waiter = plan.legs.filter((l) => l.kind === 'toStore').pop()!.riderId;
  for (let t = Math.floor(plan.arriveAt) + 1; t < plan.pickupAt; t++) pts.push({ at: t, riderId: waiter, x: MERCHANT.pos.x * 5, y: MERCHANT.pos.y * 5, speed: 0, phase: '等餐' });
  return pts.sort((a, b) => a.at - b.at);
}

export function riderAccept(w: World): World {
  need(w, 'riderAccepted');
  const d = w.dispatch!;
  const order = applyRider(w.order!, 'rider_accept', 'rider', T.riderAccept, undefined, { promisedAt: d.promisedAt });
  const plan = makePlan({ ...w, order });
  return step(w, 'riderAccepted', T.riderAccept, { order, plan, track: makeTrack(plan) }, [{ who: 'rider', kind: 'ok', title: `${RIDER_MAP[d.chosen].short}接单`, detail: `承诺 ${clockLabel(d.promisedAt)} 前送达` }], [{ to: 'user', title: '骑手已接单', body: `${RIDER_MAP[d.chosen].short}正赶往商家，预计 ${clockLabel(d.promisedAt)} 前送达` }]);
}

/** 改派（只在首选骑手中途故障时生效；其他情景是空操作） */
export function reassignRider(w: World): World {
  need(w, 'reassigned');
  const plan = w.plan!;
  if (!plan.stuck) return step(w, 'reassigned', w.clock, {});
  let order = w.order!;
  const from = order.riderId!;
  const d2 = decide({ at: plan.stuck.reassignAt, acceptedAt: T.accept, prepMin: prepMinutes(w.cart), weather: scen(w).params.weather, exclude: [from] });
  order = applyRider(order, 'reassign', 'dispatch', plan.stuck.reassignAt, `${RIDER_MAP[from].short}车辆故障`, { riderId: d2.chosen });
  order = applyRider(order, 'rider_accept', 'rider', plan.stuck.acceptAt);
  const reassign = { at: plan.stuck.reassignAt, from, to: d2.chosen, reason: `${RIDER_MAP[from].short}车辆故障，${STUCK_ALERT_MIN} 分钟未移动`, decision: d2 };
  return step(
    w,
    'reassigned',
    plan.stuck.acceptAt,
    { order, reassign },
    [
      { at: plan.stuck.at, who: 'rider', kind: 'error', title: `${RIDER_MAP[from].short}电动车故障，原地停留`, detail: `${clockLabel(plan.stuck.at)} 起位置不再变化` },
      { at: plan.stuck.alertAt, who: 'dispatch', kind: 'warn', title: `超时预警：${RIDER_MAP[from].short} ${STUCK_ALERT_MIN} 分钟未移动`, detail: `按当前位置预测将晚于承诺时间 ${clockLabel(order.promisedAt!)}` },
      { at: plan.stuck.reassignAt, who: 'dispatch', kind: 'ok', title: `改派给${RIDER_MAP[d2.chosen].short}（得分 ${d2.candidates[0].score.toFixed(2)}）`, detail: `排除${RIDER_MAP[from].short}后重新打分；${d2.reason}` },
    ],
    [
      { at: plan.stuck.reassignAt, to: 'rider', title: '改派通知', body: `订单 #12 已改派给你：${MERCHANT.short}` },
      { at: plan.stuck.reassignAt, to: 'user', title: '已为你更换骑手', body: `原骑手车辆故障，${RIDER_MAP[d2.chosen].short}接手，仍预计按时送达` },
    ],
  );
}

export function riderArrive(w: World): World {
  need(w, 'arrived');
  const plan = w.plan!;
  const order = applyRider(w.order!, 'arrive', 'rider', plan.arriveAt);
  return step(w, 'arrived', plan.arriveAt, { order }, [{ who: 'rider', kind: 'info', title: `${RIDER_MAP[order.riderId!].short}到店`, detail: plan.waitMin > 0.1 ? `面还没出锅，预计等 ${Math.round(plan.waitMin)} 分钟` : '餐已备好' }]);
}

export function mealReady(w: World): World {
  need(w, 'ready');
  const plan = w.plan!;
  const order = applyOrder(w.order!, 'meal_ready', 'merchant', plan.readyAt);
  const events: NewEvent[] = [];
  const pushes: NewPush[] = [];
  if (plan.waitMin > WAIT_ALERT_MIN) {
    const at = plan.arriveAt + WAIT_ALERT_MIN;
    events.push({ at, who: 'platform', kind: 'warn', title: `等餐预警：骑手已等 ${WAIT_ALERT_MIN} 分钟`, detail: '向商家发送催单提醒；骑手记等餐补贴 2 元' });
    pushes.push({ at, to: 'merchant', title: '催单提醒', body: `骑手已到店等待 ${WAIT_ALERT_MIN} 分钟，请尽快出餐` });
  }
  events.push({ who: 'merchant', kind: 'ok', title: '出餐完成', detail: `出餐用时 ${Math.round(plan.readyAt - T.accept)} 分钟` });
  pushes.push({ to: 'rider', title: '商家已出餐', body: '请到取餐口扫码取餐' });
  return step(w, 'ready', plan.readyAt, { order }, events, pushes);
}

export function pickup(w: World): World {
  need(w, 'picked');
  const plan = w.plan!;
  let order = applyRider(w.order!, 'pick', 'rider', plan.pickupAt);
  order = applyOrder(order, 'pickup', 'rider', plan.pickupAt, '扫码核对订单号');
  return step(w, 'picked', plan.pickupAt, { order }, [{ who: 'rider', kind: 'ok', title: '取餐出发', detail: `配送 ${w.dispatch!.deliveryKm.toFixed(1)} 公里，约 ${Math.round(plan.deliverAt - plan.pickupAt)} 分钟` }], [{ to: 'user', title: '骑手已取餐', body: '正在火速赶来，可在订单页查看骑手位置' }]);
}

export function deliver(w: World): World {
  need(w, 'delivered');
  const plan = w.plan!;
  let order = applyRider(w.order!, 'finish', 'rider', plan.deliverAt);
  order = applyOrder(order, 'deliver', 'rider', plan.deliverAt);
  const late = Math.max(0, Math.round(plan.deliverAt - order.promisedAt!));
  const events: NewEvent[] = [{ who: 'rider', kind: late ? 'warn' : 'ok', title: late ? `已送达，超时 ${late} 分钟` : '准时送达', detail: `下单到送达 ${Math.round(plan.deliverAt - T.order)} 分钟（承诺 ${clockLabel(order.promisedAt!)} 前）` }];
  const pushes: NewPush[] = [{ to: 'user', title: '订单已送达', body: '餐已放在门口，祝你用餐愉快' }];
  if (late) {
    events.push({ who: 'platform', kind: 'info', title: '超时赔付：发放 3 元无门槛券', detail: '超时原因：商家出餐慢；赔付券下次下单可用（成本归属待确认 Q-05）' });
    pushes.push({ to: 'user', title: '超时赔付', body: '本单超时送达，已发放 3 元无门槛券' });
  }
  return step(w, 'delivered', plan.deliverAt, { order, late, compensation: late ? 300 : 0 }, events, pushes);
}

export function confirmReceipt(w: World): World {
  need(w, 'confirmed');
  const at = w.plan!.deliverAt + 1.5;
  const order = applyOrder(w.order!, 'confirm', 'user', at);
  return step(w, 'confirmed', at, { order }, [{ who: 'user', kind: 'ok', title: '用户确认收货' }]);
}

export function rate(w: World): World {
  need(w, 'rated');
  const at = w.clock + 0.6;
  const review: Review = w.late
    ? { at, stars: 4, riderStars: 5, tags: ['面很筋道', '骑手辛苦了'], text: '面很好吃，就是这次出餐慢了点，骑手一直在帮忙催。' }
    : { at, stars: 5, riderStars: 5, tags: ['面很筋道', '送餐快', '包装严实'], text: '牛肉炖得很烂，汤没洒，下次还点。' };
  return step(w, 'rated', at, { review }, [{ who: 'user', kind: 'info', title: `评价：商家 ${review.stars} 星，骑手 ${review.riderStars} 星`, detail: review.tags.join('、') }], [{ to: 'merchant', title: '收到新评价', body: `${review.stars} 星：${review.text}` }]);
}

/** 渠道对账（次日 01:00）：下载网关对账单，与平台支付流水按 trade_no 逐笔核对；差异订单不进入当期结算 */
export function reconcileDay(w: World): World {
  need(w, 'reconciled');
  const o = w.order!;
  const orders = [...seedSettleLines().map((l) => ({ no: l.orderNo, time: l.time, payable: l.payable })), { no: o.no, time: hm(o.createdAt), payable: o.pricing.payable }];
  const processed: Record<string, number> = Object.fromEntries([...seedSettleLines().map((l) => [tradeNoOf(l.orderNo), l.payable] as const), ...w.processed.map((tn) => [tn, o.pricing.payable] as const)]);
  const dupIgnored = w.callbacks.filter((c) => c.result.result === 'ignored').length;
  const recon = reconcile({ date: DEMO_DATE, at: T.recon, orders, processed, dupIgnored });
  return step(w, 'reconciled', T.recon, { recon }, [
    { who: 'gateway', kind: 'info', title: `下载 ${DEMO_DATE} 渠道对账单：${MERCHANT.short}相关 ${recon.statement.length} 笔`, detail: `交易金额 ${yuan(recon.amount)}，通道费 ${yuan(recon.fee)}` },
    { who: 'scheduler', kind: recon.diffs.length ? 'error' : 'ok', title: recon.diffs.length ? `渠道对账：差异 ${recon.diffs.length} 笔，已挂账转人工` : `渠道对账：${recon.matched} 笔全部对平`, detail: `按 trade_no 与平台支付流水逐笔核对${dupIgnored ? `；重复回调 ${dupIgnored} 次已幂等忽略，未进入流水，不影响对账` : ''}` },
  ]);
}

export function settle(w: World): World {
  need(w, 'settled');
  const pr = w.order!.pricing;
  const fee = deliveryFee(pr.distanceKm, scen(w).params.weather);
  const line = settleOrder(w.order!.no, hm(w.order!.createdAt), pr, riderPay({ extraKm: fee.extraKm, rain: scen(w).params.weather === 'rain', waitMin: w.plan!.waitMin }));
  const batch = [...seedSettleLines(), line];
  const summary = summarize(batch);
  const order = applyOrder(w.order!, 'settle', 'scheduler', T.settle);
  return step(w, 'settled', T.settle, { order, settle: { line, batch, summary } }, [
    { who: 'scheduler', kind: 'info', title: `T+1 结算：汇总 ${DEMO_DATE} 已完成订单 ${batch.length} 笔`, detail: `用户实付合计 ${yuan(summary.payable)}` },
    { who: 'scheduler', kind: summary.unbalanced ? 'error' : 'ok', title: summary.unbalanced ? `勾稽不平 ${summary.unbalanced} 笔，转人工` : '分账勾稽全部平衡', detail: `商家应得 ${yuan(summary.merchantNet)}，骑手 ${yuan(summary.rider)}，通道费 ${yuan(summary.channelFee)}，平台净收入 ${yuan(summary.platformNet)}` },
    { who: 'platform', kind: 'ok', title: '生成结算单与对账文件', detail: `只结算渠道对账已对平的订单（${w.recon?.matched ?? batch.length} 笔）；08:00 发起打款` },
  ]);
}

/** 打款（次日 08:00）：商家应得打到对公账户，骑手收入打到骑手钱包；网关代付回执成功后通知到账 */
export function payout(w: World): World {
  need(w, 'paidOut');
  const st = w.settle!;
  const rider = RIDER_MAP[w.order!.riderId!].short;
  const po = payoutBatch({ date: DEMO_DATE, at: T.payout, batch: st.batch, demoNo: st.line.orderNo, merchant: MERCHANT.short, rider });
  const m = po.items.find((i) => i.kind === 'merchant')!;
  const r = po.items[1];
  return step(w, 'paidOut', T.payout, { payout: po }, [
    { who: 'platform', kind: 'info', title: `生成打款批次 ${po.batchNo}：${po.items.length} 笔，合计 ${yuan(po.total)}`, detail: po.items.map((i) => `${i.payee} ${yuan(i.amount)}`).join('；') },
    { at: T.payout + 0.5, who: 'gateway', kind: 'ok', title: '网关代付成功，回执已入账', detail: '商家对公账户与骑手钱包均已到账（模拟）' },
  ], [
    { at: T.payout + 0.5, to: 'merchant', title: '结算款已到账', body: `${DEMO_DATE} 结算 ${m.orders} 单，到账 ${yuan(m.amount)}` },
    { at: T.payout + 0.5, to: 'rider', title: '配送收入已到账', body: `订单 #12 配送收入 ${yuan(r.amount)} 已入钱包` },
  ]);
}

export function requestRefund(w: World): World {
  need(w, 'refundApplied');
  const calc = refundCalc(w.order!.pricing, REFUND_ITEM.dishId, REFUND_ITEM.qty);
  const order = applyOrder(w.order!, 'refund_apply', 'user', T.refundApply, REFUND_ITEM.reason);
  return step(w, 'refundApplied', T.refundApply, { order, refund: { calc, reason: REFUND_ITEM.reason, appliedAt: T.refundApply } }, [{ who: 'user', kind: 'info', title: `申请部分退款：${REFUND_ITEM.reason}`, detail: `试算可退 ${yuan(calc.refund)}（已按比例扣除优惠）` }], [{ to: 'merchant', title: '退款申请', body: `订单 #12：${REFUND_ITEM.reason}，申请退 ${yuan(calc.refund)}` }]);
}

export function approveRefund(w: World): World {
  need(w, 'refundApproved');
  const r = w.refund!;
  const req = refundRequest(w.order!.no, w.order!.tradeNo!, r.calc.refund, r.reason);
  return step(w, 'refundApproved', T.refundApprove, { refund: { ...r, req, approvedAt: T.refundApprove } }, [
    { who: 'merchant', kind: 'ok', title: '商家同意退款' },
    { who: 'platform', kind: 'info', title: '向网关发起原路退款', detail: `${req.out_refund_no}，${yuan(req.refund_amount)}` },
  ]);
}

export function refundDone(w: World): World {
  need(w, 'refunded');
  const r = w.refund!;
  const cb = refundCallback(r.req!, stamp(T.refundDone));
  const order = applyOrder(w.order!, 'refund_success', 'platform', T.refundDone, `退款 ${yuan(cb.refund_amount)}`);
  return step(w, 'refunded', T.refundDone, { order, refund: { ...r, cb, doneAt: T.refundDone } }, [
    { who: 'gateway', kind: 'ok', title: '网关退款回调成功', detail: `${cb.refund_no}，${yuan(cb.refund_amount)} 原路退回` },
    { who: 'platform', kind: 'info', title: '已结算订单：下一结算周期冲减', detail: `商家 ${yuan(r.calc.merchantAdj)}，平台 ${yuan(r.calc.platformAdj)}` },
  ], [{ to: 'user', title: '退款成功', body: `${yuan(cb.refund_amount)} 已原路退回` }]);
}

/** 下一结算周期冲减（后天 02:00）：已结算订单的退款，从商家本期结算款中扣减，其余由平台承担 */
export function offsetNext(w: World): World {
  need(w, 'offset');
  const r = w.refund!;
  const offset: OffsetEntry = { at: T.offset, cycle: '2026-10-19', orderNo: w.order!.no, refundNo: r.cb!.refund_no, refund: r.calc.refund, merchantAdj: r.calc.merchantAdj, platformAdj: r.calc.platformAdj };
  return step(w, 'offset', T.offset, { offset }, [
    { who: 'scheduler', kind: 'info', title: `下一周期冲减：订单 ${offset.orderNo} 退款 ${yuan(offset.refund)}`, detail: `商家冲减 ${yuan(-offset.merchantAdj)}，平台承担 ${yuan(-offset.platformAdj)}，从 ${offset.cycle} 结算款中扣减` },
  ], [{ to: 'merchant', title: '结算冲减通知', body: `订单 #12 部分退款，本期结算款扣减 ${yuan(-offset.merchantAdj)}` }]);
}

const ACTIONS: Record<Exclude<Stage, 'init'>, (w: World) => World> = {
  coupon: publishCoupon,
  store: openStore,
  online: ridersOnline,
  cart: fillCart,
  ordered: submitOrder,
  paid: payOrder,
  accepted: merchantAccept,
  dispatched: runDispatch,
  riderAccepted: riderAccept,
  reassigned: reassignRider,
  arrived: riderArrive,
  ready: mealReady,
  picked: pickup,
  delivered: deliver,
  confirmed: confirmReceipt,
  rated: rate,
  reconciled: reconcileDay,
  settled: settle,
  paidOut: payout,
  refundApplied: requestRefund,
  refundApproved: approveRefund,
  refunded: refundDone,
  offset: offsetNext,
};

/** 执行下一个阶段的动作 */
export function next(w: World): World {
  const n = STAGES[stageIdx(w.stage) + 1];
  if (!n) return w;
  return ACTIONS[n as Exclude<Stage, 'init'>](w);
}

/** 推进到指定阶段（已到达或超过则原样返回） */
export function advanceTo(w: World, s: Stage): World {
  let cur = w;
  while (stageIdx(cur.stage) < stageIdx(s)) cur = next(cur);
  return cur;
}

/** 跑完整个情景（测试、格式样例、数据流转使用） */
export function runScenario(key: ScenarioKey, until: Stage = 'offset'): World {
  return advanceTo(initWorld(key), until);
}
