/**
 * 价格试算：商品金额、包装费、配送费（距离 + 天气）、商家满减、平台券。
 * 规则（原型假设，见“假设与待确认” B-01～B-03）：
 * - 商家满减取满足条件的最高一档，由商家承担；
 * - 平台券门槛按“商家优惠后的商品金额”计算，可与商家满减叠加，同一订单只能用一张平台券；
 * - 配送费 = 3 公里内 4 元 + 超出部分每公里 1 元（向上取整）+ 恶劣天气 2 元，由用户支付。
 */
import { DISH_MAP, MERCHANT_TIERS } from './catalog';

export interface CartLine {
  dishId: string;
  qty: number;
}

export type Weather = 'clear' | 'rain';

export interface CouponTpl {
  id: string;
  name: string;
  /** 门槛（分） */
  threshold: number;
  /** 面额（分） */
  off: number;
  /** 门槛口径：商家优惠后金额 / 商品原价 */
  basis: 'afterMerchant' | 'original';
  funder: '平台';
  quota: number;
  perUser: number;
  window: string;
  status: 'draft' | 'published';
  version: number;
  publishedAt?: number;
}

export const LUNCH_COUPON: CouponTpl = {
  id: 'CP-LUNCH-4008',
  name: '午市满 40 减 8',
  threshold: 4000,
  off: 800,
  basis: 'afterMerchant',
  funder: '平台',
  quota: 5000,
  perUser: 1,
  window: '11:00–14:00',
  status: 'draft',
  version: 0,
};

export const DELIVERY_RULE = { base: 400, baseKm: 3, perKm: 100, rain: 200 };

export interface PricedLine {
  dishId: string;
  name: string;
  qty: number;
  unit: number;
  amount: number;
  pack: number;
}

export interface Pricing {
  lines: PricedLine[];
  /** 商品原价合计 */
  goods: number;
  /** 包装费 */
  pack: number;
  deliveryBase: number;
  deliveryDistance: number;
  deliveryWeather: number;
  delivery: number;
  distanceKm: number;
  /** 商家满减（商家承担） */
  merchantOff: number;
  merchantTier: { min: number; off: number } | null;
  /** 平台券门槛的计算基数 */
  couponBase: number;
  couponApplied: boolean;
  /** 平台券优惠（平台承担） */
  couponOff: number;
  couponHint: string | null;
  /** 用户实付 */
  payable: number;
  /** 计算过程（展示用） */
  explain: string[];
}

const y = (fen: number) => `${(fen / 100).toFixed(fen % 100 ? 2 : 0)} 元`;

export function deliveryFee(distanceKm: number, weather: Weather) {
  const extraKm = Math.max(0, Math.ceil(Math.round((distanceKm - DELIVERY_RULE.baseKm) * 100) / 100));
  const distance = extraKm * DELIVERY_RULE.perKm;
  const rain = weather === 'rain' ? DELIVERY_RULE.rain : 0;
  return { base: DELIVERY_RULE.base, distance, rain, total: DELIVERY_RULE.base + distance + rain, extraKm };
}

export function price(input: { lines: CartLine[]; coupon: CouponTpl | null; distanceKm: number; weather: Weather }): Pricing {
  const lines: PricedLine[] = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const d = DISH_MAP[l.dishId];
      return { dishId: d.id, name: d.name, qty: l.qty, unit: d.price, amount: d.price * l.qty, pack: d.pack * l.qty };
    });
  const goods = lines.reduce((a, l) => a + l.amount, 0);
  const pack = lines.reduce((a, l) => a + l.pack, 0);
  const fee = deliveryFee(input.distanceKm, input.weather);
  const tier = [...MERCHANT_TIERS].reverse().find((t) => goods >= t.min) ?? null;
  const merchantOff = tier?.off ?? 0;
  const c = input.coupon && input.coupon.status === 'published' ? input.coupon : null;
  const couponBase = c && c.basis === 'original' ? goods : goods - merchantOff;
  const couponApplied = !!c && couponBase >= c.threshold;
  const couponOff = couponApplied && c ? c.off : 0;
  const couponHint = c && !couponApplied ? `券门槛按${c.basis === 'original' ? '商品原价' : '商家优惠后金额'} ${y(couponBase)} 计算，差 ${y(c.threshold - couponBase)} 可用` : null;
  const payable = goods + pack + fee.total - merchantOff - couponOff;
  const explain = [
    `商品原价 ${y(goods)}（${lines.map((l) => `${l.name}×${l.qty}`).join('、')}）`,
    `包装费 ${y(pack)}`,
    `配送费 ${y(fee.total)} = 基础 ${y(fee.base)}${fee.distance ? ` + 超距 ${fee.extraKm} 公里 ${y(fee.distance)}` : ''}${fee.rain ? ` + 恶劣天气 ${y(fee.rain)}` : ''}（距离 ${input.distanceKm.toFixed(1)} 公里）`,
    tier ? `商家满减：满 ${y(tier.min)} 减 ${y(tier.off)}（商家承担）` : '商家满减：未达门槛',
    c ? (couponApplied ? `平台券「${c.name}」：门槛基数 ${y(couponBase)} ≥ ${y(c.threshold)}，减 ${y(c.off)}（平台承担）` : `平台券「${c.name}」不可用：${couponHint}`) : '未领取平台券',
    `实付 = ${y(goods)} + ${y(pack)} + ${y(fee.total)} − ${y(merchantOff)} − ${y(couponOff)} = ${y(payable)}`,
  ];
  return {
    lines,
    goods,
    pack,
    deliveryBase: fee.base,
    deliveryDistance: fee.distance,
    deliveryWeather: fee.rain,
    delivery: fee.total,
    distanceKm: input.distanceKm,
    merchantOff,
    merchantTier: tier,
    couponBase,
    couponApplied,
    couponOff,
    couponHint,
    payable,
    explain,
  };
}

/** 最长出餐时长（分钟）：一单的出餐时间由最慢的菜决定 */
export function prepMinutes(lines: CartLine[]) {
  return Math.max(0, ...lines.filter((l) => l.qty > 0).map((l) => DISH_MAP[l.dishId].prep));
}
