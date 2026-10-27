/**
 * T+1 结算分账与售后退款分摊（金额全部以“分”计）。
 *
 * 每笔订单：
 *   用户实付 = 商品原价 + 包装费 + 配送费 − 商家满减 − 平台券
 *   佣金     = round((商品原价 + 包装费 − 商家满减) × 佣金率)
 *   商家应得 = 商品原价 + 包装费 − 商家满减 − 佣金
 *   骑手收入 = 基础单价 5 元 + 超距补贴（每公里 1 元）+ 恶劣天气补贴 3 元 + 等餐补贴 2 元（等餐超 10 分钟）
 *   通道费   = round(用户实付 × 0.6%)
 *   平台净收入 = 用户实付 − 商家应得 − 骑手收入 − 通道费（可以为负，即平台补贴）
 * 勾稽：商家应得 + 骑手收入 + 通道费 + 平台净收入 = 用户实付（测试校验）。
 *
 * 部分退款：退款商品按原价占比分摊该单的全部优惠；商家冲减“商品净额 − 退回佣金”，其余由平台承担。
 * 已结算订单的退款在下一结算周期冲减（见 B-07）。
 *
 * 资金链路的另外三步：结算前的渠道对账（网关对账单 vs 平台支付流水，见 B-10）、结算后的打款（B-11）、下一周期的退款冲减。
 */
import { DISH_MAP } from './catalog';
import { tradeNoOf } from './payment';
import type { Pricing } from './pricing';

export const SETTLE_RULE = { commissionRate: 0.18, channelRate: 0.006, riderBase: 500, riderPerKm: 100, riderRain: 300, riderWait: 200 };

export interface RiderPay {
  base: number;
  distance: number;
  rain: number;
  wait: number;
  total: number;
}

export function riderPay(p: { extraKm: number; rain: boolean; waitMin: number }): RiderPay {
  const base = SETTLE_RULE.riderBase;
  const distance = p.extraKm * SETTLE_RULE.riderPerKm;
  const rain = p.rain ? SETTLE_RULE.riderRain : 0;
  const wait = p.waitMin > 10 ? SETTLE_RULE.riderWait : 0;
  return { base, distance, rain, wait, total: base + distance + rain + wait };
}

export interface SettleLine {
  orderNo: string;
  /** 下单时间（展示用） */
  time: string;
  goods: number;
  pack: number;
  delivery: number;
  merchantOff: number;
  couponOff: number;
  payable: number;
  commissionBase: number;
  commission: number;
  merchantNet: number;
  rider: RiderPay;
  channelFee: number;
  platformNet: number;
}

export function settleOrder(orderNo: string, time: string, pr: Pricing, rider: RiderPay): SettleLine {
  const commissionBase = pr.goods + pr.pack - pr.merchantOff;
  const commission = Math.round(commissionBase * SETTLE_RULE.commissionRate);
  const merchantNet = commissionBase - commission;
  const channelFee = Math.round(pr.payable * SETTLE_RULE.channelRate);
  const platformNet = pr.payable - merchantNet - rider.total - channelFee;
  return {
    orderNo,
    time,
    goods: pr.goods,
    pack: pr.pack,
    delivery: pr.delivery,
    merchantOff: pr.merchantOff,
    couponOff: pr.couponOff,
    payable: pr.payable,
    commissionBase,
    commission,
    merchantNet,
    rider,
    channelFee,
    platformNet,
  };
}

/** 勾稽：四方之和等于用户实付 */
export function balanced(l: SettleLine) {
  return l.merchantNet + l.rider.total + l.channelFee + l.platformNet === l.payable;
}

export interface SettleSummary {
  orders: number;
  payable: number;
  commission: number;
  merchantNet: number;
  rider: number;
  channelFee: number;
  platformNet: number;
  couponOff: number;
  merchantOff: number;
  unbalanced: number;
}

export function summarize(lines: SettleLine[]): SettleSummary {
  const sum = (f: (l: SettleLine) => number) => lines.reduce((a, l) => a + f(l), 0);
  return {
    orders: lines.length,
    payable: sum((l) => l.payable),
    commission: sum((l) => l.commission),
    merchantNet: sum((l) => l.merchantNet),
    rider: sum((l) => l.rider.total),
    channelFee: sum((l) => l.channelFee),
    platformNet: sum((l) => l.platformNet),
    couponOff: sum((l) => l.couponOff),
    merchantOff: sum((l) => l.merchantOff),
    unbalanced: lines.filter((l) => !balanced(l)).length,
  };
}

/* ---------------- 部分退款 ---------------- */

export interface RefundCalc {
  dishId: string;
  qty: number;
  /** 退款商品原价 */
  itemPrice: number;
  /** 分摊到退款商品的优惠（商家 + 平台） */
  discountShare: number;
  merchantShare: number;
  platformShare: number;
  /** 退给用户的金额 */
  refund: number;
  /** 商家冲减（负数） */
  merchantAdj: number;
  /** 平台冲减（负数） */
  platformAdj: number;
  commissionBack: number;
  explain: string[];
}

const y = (fen: number) => `${(fen / 100).toFixed(2)} 元`;

export function refundCalc(pr: Pricing, dishId: string, qty: number): RefundCalc {
  const itemPrice = DISH_MAP[dishId].price * qty;
  const merchantShare = Math.round((itemPrice * pr.merchantOff) / pr.goods);
  const platformShare = Math.round((itemPrice * pr.couponOff) / pr.goods);
  const discountShare = merchantShare + platformShare;
  const refund = itemPrice - discountShare;
  const merchantItemNet = itemPrice - merchantShare;
  const commissionBack = Math.round(merchantItemNet * SETTLE_RULE.commissionRate);
  const merchantAdj = -(merchantItemNet - commissionBack);
  const platformAdj = -(refund + merchantAdj);
  return {
    dishId,
    qty,
    itemPrice,
    discountShare,
    merchantShare,
    platformShare,
    refund,
    merchantAdj,
    platformAdj,
    commissionBack,
    explain: [
      `退款商品 ${DISH_MAP[dishId].name}×${qty}，原价 ${y(itemPrice)}`,
      `按原价占比分摊优惠：商家满减 ${y(pr.merchantOff)} × ${itemPrice}/${pr.goods} = ${y(merchantShare)}，平台券 ${y(pr.couponOff)} × ${itemPrice}/${pr.goods} = ${y(platformShare)}`,
      `退给用户 = ${y(itemPrice)} − ${y(discountShare)} = ${y(refund)}（包装费、配送费不退）`,
      `商家冲减 = 商品净额 ${y(merchantItemNet)} − 退回佣金 ${y(commissionBack)} = ${y(-merchantAdj)}`,
      `平台承担 = ${y(refund)} − ${y(-merchantAdj)} = ${y(-platformAdj)}`,
    ],
  };
}

/* ---------------- 渠道对账（结算前） ---------------- */

export interface StatementLine {
  trade_no: string;
  out_trade_no: string;
  type: 'PAY';
  amount: number;
  fee: number;
  paid_at: string;
}

export interface ReconDiff {
  trade_no: string;
  kind: '长款' | '短款' | '金额不符';
  amount: number;
  action: string;
}

export interface ReconResult {
  /** 账单日期 */
  date: string;
  at: number;
  /** 网关对账单中本商家相关的行 */
  statement: StatementLine[];
  /** 平台支付流水（处理成功）笔数 */
  platform: number;
  matched: number;
  amount: number;
  fee: number;
  /** 被幂等忽略的重复回调（不进入流水，不影响对账） */
  dupIgnored: number;
  diffs: ReconDiff[];
}

/**
 * 渠道对账：按 trade_no 把网关对账单与平台支付流水逐笔匹配，金额一致才算对平；
 * 网关有、平台无为“长款”（掉单，需补单或退款），平台有、网关无为“短款”，金额不一致单独挂账。差异订单不进入当期结算。
 */
export function reconcile(p: { date: string; at: number; orders: { no: string; time: string; payable: number }[]; processed: Record<string, number>; dupIgnored: number }): ReconResult {
  const statement: StatementLine[] = p.orders.map((o) => ({ trade_no: tradeNoOf(o.no), out_trade_no: o.no, type: 'PAY', amount: o.payable, fee: Math.round(o.payable * SETTLE_RULE.channelRate), paid_at: `${p.date} ${o.time}:00` }));
  const diffs: ReconDiff[] = [];
  for (const l of statement) {
    const mine = p.processed[l.trade_no];
    if (mine === undefined) diffs.push({ trade_no: l.trade_no, kind: '长款', amount: l.amount, action: '平台无此流水：查单后补单或原路退款' });
    else if (mine !== l.amount) diffs.push({ trade_no: l.trade_no, kind: '金额不符', amount: l.amount - mine, action: '挂账，转人工核查' });
  }
  for (const [tn, amount] of Object.entries(p.processed)) if (!statement.some((l) => l.trade_no === tn)) diffs.push({ trade_no: tn, kind: '短款', amount, action: '网关无此流水：次日再对一次，仍缺则转人工' });
  return {
    date: p.date,
    at: p.at,
    statement,
    platform: Object.keys(p.processed).length,
    matched: statement.length - diffs.filter((d) => d.kind !== '短款').length,
    amount: statement.reduce((a, l) => a + l.amount, 0),
    fee: statement.reduce((a, l) => a + l.fee, 0),
    dupIgnored: p.dupIgnored,
    diffs,
  };
}

/* ---------------- 打款（结算后） ---------------- */

export interface PayoutItem {
  payee: string;
  kind: 'merchant' | 'rider';
  account: string;
  orders: number;
  amount: number;
}

export interface Payout {
  batchNo: string;
  at: number;
  items: PayoutItem[];
  total: number;
  status: 'SUCCESS';
}

/** 打款批次：商家应得汇总打到对公账户；骑手收入打到骑手钱包（演示订单的骑手单列） */
export function payoutBatch(p: { date: string; at: number; batch: SettleLine[]; demoNo: string; merchant: string; rider: string }): Payout {
  const demo = p.batch.find((l) => l.orderNo === p.demoNo)!;
  const others = p.batch.filter((l) => l.orderNo !== p.demoNo);
  const items: PayoutItem[] = [
    { payee: `商家 · ${p.merchant}`, kind: 'merchant', account: '对公账户 **** 6018', orders: p.batch.length, amount: p.batch.reduce((a, l) => a + l.merchantNet, 0) },
    { payee: `骑手 · ${p.rider}`, kind: 'rider', account: '骑手钱包', orders: 1, amount: demo.rider.total },
    { payee: '其他骑手（合并展示）', kind: 'rider', account: '骑手钱包', orders: others.length, amount: others.reduce((a, l) => a + l.rider.total, 0) },
  ];
  return { batchNo: `PO${p.date.replace(/-/g, '')}M1001`, at: p.at, items, total: items.reduce((a, i) => a + i.amount, 0), status: 'SUCCESS' };
}
