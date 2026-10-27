import { describe, expect, it } from 'vitest';
import { RIDERS, ROUTE_STORE_TO_CUSTOMER, routeKm } from './catalog';
import { DEFAULT_WEIGHTS, decide, scoreRider } from './dispatch';
import { ORDER_TRANSITIONS, IllegalTransition, applyOrder, applyRider, createOrder } from './orderMachine';
import { handleCallback, mockSign, payCallback, payRequest } from './payment';
import { LUNCH_COUPON, deliveryFee, price } from './pricing';
import { seedSettleLines } from './seed';
import { balanced, refundCalc, riderPay, settleOrder, summarize } from './settlement';

const coupon = { ...LUNCH_COUPON, status: 'published' as const, version: 1 };
const STANDARD = [
  { dishId: 'D01', qty: 1 },
  { dishId: 'D02', qty: 1 },
  { dishId: 'D03', qty: 2 },
];

describe('价格试算', () => {
  it('标准单：商家满 50 减 6 + 平台券满 40 减 8，实付 49 元', () => {
    const p = price({ lines: STANDARD, coupon, distanceKm: 3.3, weather: 'clear' });
    expect([p.goods, p.pack, p.delivery, p.merchantOff, p.couponOff, p.payable]).toEqual([5600, 200, 500, 600, 800, 4900]);
    expect(p.couponBase).toBe(5000);
  });

  it('平台券门槛按商家优惠后金额计算：原价 40 元减 3 元后不满 40，券不可用并提示差额', () => {
    const p = price({ lines: [{ dishId: 'D01', qty: 1 }, { dishId: 'D03', qty: 1 }, { dishId: 'D05', qty: 1 }], coupon, distanceKm: 3.3, weather: 'clear' });
    expect(p.goods).toBe(4000);
    expect(p.couponApplied).toBe(false);
    expect(p.couponHint).toContain('差 3 元');
    expect(p.payable).toBe(4300);
  });

  it('配送费：3 公里内 4 元，超距每公里 1 元向上取整，雨天 +2 元', () => {
    expect(deliveryFee(2.9, 'clear').total).toBe(400);
    expect(deliveryFee(3.0, 'clear').total).toBe(400);
    expect(deliveryFee(3.3, 'clear').total).toBe(500);
    expect(deliveryFee(4.2, 'rain').total).toBe(800);
  });

  it('未发布的券不参与计算', () => {
    expect(price({ lines: STANDARD, coupon: LUNCH_COUPON, distanceKm: 3.3, weather: 'clear' }).couponOff).toBe(0);
  });
});

describe('订单状态机', () => {
  const pr = price({ lines: STANDARD, coupon, distanceKm: 3.3, weather: 'clear' });
  const fresh = () => createOrder('CZTEST', { merchantId: 'M', customerId: 'U', lines: STANDARD, pricing: pr, at: 0 });

  it('主流程每一步都是迁移表里的合法迁移', () => {
    let o = fresh();
    o = applyOrder(o, 'pay_success', 'platform', 1);
    o = applyOrder(o, 'merchant_accept', 'merchant', 2);
    o = applyRider(o, 'offer', 'dispatch', 2);
    o = applyRider(o, 'rider_accept', 'rider', 3);
    o = applyRider(o, 'arrive', 'rider', 9);
    o = applyOrder(o, 'meal_ready', 'merchant', 12);
    o = applyRider(o, 'pick', 'rider', 13);
    o = applyOrder(o, 'pickup', 'rider', 13);
    o = applyRider(o, 'finish', 'rider', 28);
    o = applyOrder(o, 'deliver', 'rider', 28);
    o = applyOrder(o, 'confirm', 'user', 30);
    o = applyOrder(o, 'settle', 'scheduler', 900);
    o = applyOrder(o, 'refund_apply', 'user', 1000);
    o = applyOrder(o, 'refund_success', 'platform', 1001);
    expect(o.status).toBe('refunded');
    expect(o.trail).toHaveLength(15);
    expect([o.paidAt, o.acceptedAt, o.readyAt, o.pickedAt, o.deliveredAt, o.completedAt, o.settledAt]).toEqual([1, 2, 12, 13, 28, 30, 900]);
  });

  it('非法迁移被拒绝：重复支付、未支付接单、未出餐取餐、非本人操作', () => {
    const paid = applyOrder(fresh(), 'pay_success', 'platform', 1);
    expect(() => applyOrder(paid, 'pay_success', 'platform', 2)).toThrow(IllegalTransition);
    expect(() => applyOrder(fresh(), 'merchant_accept', 'merchant', 1)).toThrow(IllegalTransition);
    expect(() => applyOrder(paid, 'merchant_accept', 'user', 2)).toThrow(IllegalTransition);
    let o = applyOrder(paid, 'merchant_accept', 'merchant', 2);
    o = applyRider(applyRider(applyRider(o, 'offer', 'dispatch', 2), 'rider_accept', 'rider', 3), 'arrive', 'rider', 5);
    expect(() => applyRider(o, 'pick', 'rider', 6)).toThrow('尚未出餐');
    expect(() => applyOrder(applyOrder(o, 'meal_ready', 'merchant', 7), 'pickup', 'rider', 8)).toThrow('尚未确认取餐');
  });

  it('迁移表的每个目标状态都有中文标签与执行方', () => {
    for (const t of ORDER_TRANSITIONS) {
      expect(t.from.length).toBeGreaterThan(0);
      expect(t.by.length).toBeGreaterThan(0);
    }
  });
});

describe('智能调度', () => {
  it('默认权重下排序：阿强（顺路）> 老马（最近但负载高）> 小周 > 阿杰', () => {
    const d = decide({ at: 713.2, acceptedAt: 713, prepMin: 12, weather: 'clear' });
    expect(d.candidates.map((c) => c.name)).toEqual(['阿强', '老马', '小周', '阿杰']);
    expect(d.candidates.map((c) => c.score)).toEqual([0.62, 0.55, 0.5, 0.4]);
    expect(d.chosen).toBe('R01');
    expect(d.reason).toContain('更顺路');
  });

  it('ETA 与承诺时间：12:01:48 到店、12:05 出餐、12:20:30 送达，承诺 12:25 前', () => {
    const d = decide({ at: 713.2, acceptedAt: 713, prepMin: 12, weather: 'clear' });
    expect(d.eta.arrive).toBeCloseTo(721.8, 5);
    expect(d.eta.ready).toBe(725);
    expect(d.eta.deliver).toBeCloseTo(740.5, 5);
    expect(d.promisedAt).toBe(745);
    expect(d.deliveryKm).toBe(routeKm(ROUTE_STORE_TO_CUSTOMER));
  });

  it('距离权重调高后改派最近的老马；满载骑手不参与', () => {
    const d = decide({ at: 713.2, acceptedAt: 713, prepMin: 12, weather: 'clear', weights: { distance: 0.8, load: 0.1, align: 0.05, rating: 0.05 } });
    expect(d.chosen).toBe('R03');
    const full = decide({ at: 713.2, acceptedAt: 713, prepMin: 12, weather: 'clear', riders: RIDERS.map((r) => (r.id === 'R01' ? { ...r, load: 4 } : r)) });
    expect(full.candidates.find((c) => c.riderId === 'R01')?.excluded).toBe('已满载');
    expect(full.chosen).toBe('R03');
  });

  it('打分各因子落在 0–1，得分随权重归一化', () => {
    for (const r of RIDERS) {
      const c = scoreRider(r, 0, 'clear', DEFAULT_WEIGHTS);
      for (const v of Object.values(c.parts)) expect(v >= 0 && v <= 1).toBe(true);
      expect(scoreRider(r, 0, 'clear', { distance: 4, load: 2.5, align: 2, rating: 1.5 }).score).toBe(c.score);
    }
  });
});

describe('支付回调', () => {
  const req = payRequest('CZ2026101811520012', 4900, '测试');
  const cb = payCallback(req, '2026-10-18 11:52:18');

  it('首次回调处理，重复回调按 trade_no 幂等忽略', () => {
    expect(handleCallback(cb, 4900, []).result).toBe('processed');
    const again = handleCallback(payCallback(req, '2026-10-18 11:52:18', 2), 4900, [cb.trade_no]);
    expect(again.result).toBe('ignored');
  });

  it('金额不一致或签名被篡改时拒绝', () => {
    expect(handleCallback(cb, 4800, []).result).toBe('rejected');
    expect(handleCallback({ ...cb, total_amount: 1 }, 1, []).result).toBe('rejected');
    expect(mockSign(cb)).toBe(cb.sign);
  });
});

describe('结算分账与退款', () => {
  const pr = price({ lines: STANDARD, coupon, distanceKm: 3.3, weather: 'clear' });

  it('标准单分账：商家 42.64、骑手 6.00、通道费 0.29、平台 0.07，合计等于实付 49.00', () => {
    const l = settleOrder('CZ', '11:52', pr, riderPay({ extraKm: 1, rain: false, waitMin: 3 }));
    expect([l.commission, l.merchantNet, l.rider.total, l.channelFee, l.platformNet]).toEqual([936, 4264, 600, 29, 7]);
    expect(balanced(l)).toBe(true);
  });

  it('雨天：配送费 7 元、骑手 9 元，平台这一单是补贴（净收入为负）', () => {
    const rp = price({ lines: STANDARD, coupon, distanceKm: 3.3, weather: 'rain' });
    const l = settleOrder('CZ', '11:52', rp, riderPay({ extraKm: 1, rain: true, waitMin: 1 }));
    expect([rp.payable, l.rider.total, l.platformNet]).toEqual([5100, 900, -95]);
    expect(balanced(l)).toBe(true);
  });

  it('种子批次每一笔都勾稽平衡，汇总等于明细之和', () => {
    const lines = seedSettleLines();
    expect(lines).toHaveLength(23);
    expect(lines.every(balanced)).toBe(true);
    const s = summarize(lines);
    expect(s.unbalanced).toBe(0);
    expect(s.merchantNet + s.rider + s.channelFee + s.platformNet).toBe(s.payable);
    expect(new Set(lines.map((l) => l.orderNo)).size).toBe(23);
    expect(lines.some((l) => l.orderNo.endsWith('0012'))).toBe(false);
  });

  it('部分退款：卤蛋 3 元按原价占比分摊优惠，退 2.25 元；商家冲减 2.20、平台承担 0.05', () => {
    const r = refundCalc(pr, 'D03', 1);
    expect([r.merchantShare, r.platformShare, r.refund, r.commissionBack, r.merchantAdj, r.platformAdj]).toEqual([32, 43, 225, 48, -220, -5]);
    expect(r.refund + r.merchantAdj + r.platformAdj).toBe(0);
  });
});
