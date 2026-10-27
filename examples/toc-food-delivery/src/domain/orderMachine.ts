/**
 * 订单状态机：订单主状态 + 配送子状态两条轨道。
 * 迁移表是唯一的修改入口：从哪个状态出发、由什么动作触发、需要什么条件、到哪个状态、谁可以执行；
 * 每次迁移写一条轨迹（时间、操作方、动作、说明）。非法迁移直接抛错，测试覆盖。
 */
import type { CartLine, Pricing } from './pricing';

export type OrderStatus = 'pending_pay' | 'paid' | 'accepted' | 'ready' | 'delivering' | 'delivered' | 'completed' | 'settled' | 'refunding' | 'refunded' | 'cancelled';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_pay: '待支付',
  paid: '已支付',
  accepted: '商家已接单',
  ready: '出餐完成',
  delivering: '配送中',
  delivered: '已送达',
  completed: '已完成',
  settled: '已结算',
  refunding: '退款中',
  refunded: '部分退款',
  cancelled: '已取消',
};

/** 主流程上的状态顺序（状态条展示用） */
export const MAIN_PATH: OrderStatus[] = ['pending_pay', 'paid', 'accepted', 'ready', 'delivering', 'delivered', 'completed', 'settled'];

export type RiderState = 'unassigned' | 'offered' | 'assigned' | 'arrived' | 'picked' | 'done';

export const RIDER_STATE_LABEL: Record<RiderState, string> = {
  unassigned: '待派单',
  offered: '已派单待确认',
  assigned: '骑手已接单',
  arrived: '骑手已到店',
  picked: '已取餐',
  done: '已送达',
};

export type Who = 'user' | 'merchant' | 'rider' | 'ops' | 'platform' | 'dispatch' | 'scheduler' | 'gateway';

export type OrderAction =
  | 'pay_success'
  | 'pay_timeout'
  | 'merchant_accept'
  | 'merchant_reject'
  | 'meal_ready'
  | 'pickup'
  | 'deliver'
  | 'confirm'
  | 'settle'
  | 'refund_apply'
  | 'refund_success';

export interface Transition {
  action: OrderAction;
  label: string;
  from: OrderStatus[];
  to: OrderStatus;
  by: Who[];
  guard?: string;
}

/** 订单主状态迁移表 */
export const ORDER_TRANSITIONS: Transition[] = [
  { action: 'pay_success', label: '支付成功', from: ['pending_pay'], to: 'paid', by: ['platform'], guard: '网关回调验签通过、金额一致；同一 trade_no 只处理一次' },
  { action: 'pay_timeout', label: '超时未支付取消', from: ['pending_pay'], to: 'cancelled', by: ['scheduler'], guard: '下单 15 分钟内未支付' },
  { action: 'merchant_accept', label: '商家接单', from: ['paid'], to: 'accepted', by: ['merchant'] },
  { action: 'merchant_reject', label: '商家拒单（全额退款）', from: ['paid'], to: 'cancelled', by: ['merchant'], guard: '需填写原因' },
  { action: 'meal_ready', label: '出餐完成', from: ['accepted'], to: 'ready', by: ['merchant'] },
  { action: 'pickup', label: '骑手取餐出发', from: ['ready'], to: 'delivering', by: ['rider'], guard: '配送子状态为“已取餐”' },
  { action: 'deliver', label: '确认送达', from: ['delivering'], to: 'delivered', by: ['rider'] },
  { action: 'confirm', label: '确认收货', from: ['delivered'], to: 'completed', by: ['user', 'scheduler'], guard: '用户确认，或送达 24 小时后自动确认' },
  { action: 'settle', label: 'T+1 结算', from: ['completed'], to: 'settled', by: ['scheduler'] },
  { action: 'refund_apply', label: '申请部分退款', from: ['completed', 'settled'], to: 'refunding', by: ['user'], guard: '送达后 48 小时内' },
  { action: 'refund_success', label: '退款成功', from: ['refunding'], to: 'refunded', by: ['platform'], guard: '商家同意，网关退款回调成功' },
];

export type RiderAction = 'offer' | 'rider_accept' | 'arrive' | 'pick' | 'finish' | 'reassign';

export const RIDER_TRANSITIONS: { action: RiderAction; label: string; from: RiderState[]; to: RiderState; by: Who[] }[] = [
  { action: 'offer', label: '派单', from: ['unassigned'], to: 'offered', by: ['dispatch'] },
  { action: 'rider_accept', label: '骑手接单', from: ['offered'], to: 'assigned', by: ['rider'] },
  { action: 'reassign', label: '改派', from: ['offered', 'assigned'], to: 'offered', by: ['dispatch', 'ops'] },
  { action: 'arrive', label: '到店', from: ['assigned'], to: 'arrived', by: ['rider'] },
  { action: 'pick', label: '取餐', from: ['arrived'], to: 'picked', by: ['rider'] },
  { action: 'finish', label: '送达', from: ['picked'], to: 'done', by: ['rider'] },
];

export interface TrailEntry {
  at: number;
  track: 'order' | 'rider';
  action: string;
  label: string;
  from: string;
  to: string;
  by: Who;
  note?: string;
}

export interface Order {
  no: string;
  merchantId: string;
  customerId: string;
  lines: CartLine[];
  pricing: Pricing;
  status: OrderStatus;
  riderState: RiderState;
  riderId: string | null;
  createdAt: number;
  paidAt?: number;
  tradeNo?: string;
  acceptedAt?: number;
  readyAt?: number;
  pickedAt?: number;
  deliveredAt?: number;
  completedAt?: number;
  settledAt?: number;
  /** 承诺送达时间（业务时钟分钟） */
  promisedAt?: number;
  trail: TrailEntry[];
}

export class IllegalTransition extends Error {}

export function createOrder(no: string, p: { merchantId: string; customerId: string; lines: CartLine[]; pricing: Pricing; at: number }): Order {
  return {
    no,
    merchantId: p.merchantId,
    customerId: p.customerId,
    lines: p.lines,
    pricing: p.pricing,
    status: 'pending_pay',
    riderState: 'unassigned',
    riderId: null,
    createdAt: p.at,
    trail: [{ at: p.at, track: 'order', action: 'submit', label: '提交订单', from: '—', to: 'pending_pay', by: 'user' }],
  };
}

const STAMP: Partial<Record<OrderStatus, keyof Order>> = {
  paid: 'paidAt',
  accepted: 'acceptedAt',
  ready: 'readyAt',
  delivering: 'pickedAt',
  delivered: 'deliveredAt',
  completed: 'completedAt',
  settled: 'settledAt',
};

/** 订单主状态迁移（不合法时抛 IllegalTransition） */
export function applyOrder(o: Order, action: OrderAction, by: Who, at: number, note?: string, patch: Partial<Order> = {}): Order {
  const t = ORDER_TRANSITIONS.find((x) => x.action === action);
  if (!t) throw new IllegalTransition(`未知动作 ${action}`);
  if (!t.from.includes(o.status)) throw new IllegalTransition(`${STATUS_LABEL[o.status]} 状态下不能「${t.label}」`);
  if (!t.by.includes(by)) throw new IllegalTransition(`「${t.label}」不能由 ${by} 执行`);
  if (action === 'pickup' && o.riderState !== 'picked') throw new IllegalTransition('骑手尚未确认取餐，订单不能进入配送中');
  const stamp = STAMP[t.to];
  return {
    ...o,
    ...patch,
    status: t.to,
    ...(stamp ? { [stamp]: at } : {}),
    trail: [...o.trail, { at, track: 'order', action, label: t.label, from: o.status, to: t.to, by, note }],
  };
}

/** 配送子状态迁移 */
export function applyRider(o: Order, action: RiderAction, by: Who, at: number, note?: string, patch: Partial<Order> = {}): Order {
  const t = RIDER_TRANSITIONS.find((x) => x.action === action);
  if (!t) throw new IllegalTransition(`未知动作 ${action}`);
  if (!t.from.includes(o.riderState)) throw new IllegalTransition(`配送状态为 ${RIDER_STATE_LABEL[o.riderState]}，不能「${t.label}」`);
  if (!t.by.includes(by)) throw new IllegalTransition(`「${t.label}」不能由 ${by} 执行`);
  if (action === 'pick' && o.status !== 'ready') throw new IllegalTransition('商家尚未出餐，不能取餐');
  return {
    ...o,
    ...patch,
    riderState: t.to,
    trail: [...o.trail, { at, track: 'rider', action, label: t.label, from: o.riderState, to: t.to, by, note }],
  };
}

/** 订单号：CZ + 日期 + 下单时分 + 序号 */
export function orderNo(date: string, at: number, seq: number) {
  const h = Math.floor(at / 60);
  const m = Math.floor(at % 60);
  return `CZ${date.replace(/-/g, '')}${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(seq).padStart(4, '0')}`;
}
