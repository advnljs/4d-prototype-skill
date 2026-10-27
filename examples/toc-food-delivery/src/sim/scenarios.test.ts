import { describe, expect, it } from 'vitest';
import { RIDER_MAP } from '@/domain/catalog';
import { balanced } from '@/domain/settlement';
import { SCENARIOS } from './scenarios';
import { STAGES, T, advanceTo, clockLabel, initWorld, next, runScenario, stamp } from './world';

describe('情景：每个情景的结果恰好符合预期', () => {
  for (const s of SCENARIOS) {
    it(`${s.title}`, () => {
      const w = runScenario(s.key);
      const o = w.order!;
      expect(o.pricing.payable, '实付').toBe(s.expected.payable);
      expect(o.pricing.couponApplied, '平台券').toBe(s.expected.couponApplied);
      expect(o.riderId, '最终骑手').toBe(s.expected.finalRider);
      expect(w.late > 0, '是否超时').toBe(s.expected.late);
      expect(!!w.reassign, '是否改派').toBe(s.expected.reassigned);
      expect(w.callbacks.filter((c) => c.result.result === 'ignored').length, '忽略的重复回调').toBe(s.expected.ignoredCallbacks);
      expect(w.settle!.line.rider.total, '骑手收入').toBe(s.expected.riderIncome);
      expect(o.status).toBe('refunded');
      expect(balanced(w.settle!.line)).toBe(true);
      expect(w.settle!.summary.unbalanced).toBe(0);
      // 商家只收到一条新订单提醒（重复回调不重复推送）
      expect(w.pushes.filter((p) => p.to === 'merchant' && p.title.startsWith('您有新订单'))).toHaveLength(1);
    });
  }
});

describe('时间线与轨迹', () => {
  it('标准单：11:52 下单，12:02 到店（比派单时预估晚 24 秒），12:05 出餐，12:05:30 取餐，12:20:30 送达，承诺 12:25', () => {
    const w = runScenario('standard', 'delivered');
    const p = w.plan!;
    expect(p.arriveAt).toBeCloseTo(722.2, 5);
    expect(p.readyAt).toBe(725);
    expect(p.pickupAt).toBeCloseTo(725.5, 5);
    expect(p.deliverAt).toBeCloseTo(740.5, 5);
    expect(w.order!.promisedAt).toBe(745);
    expect(Math.round(p.waitMin)).toBe(3);
  });

  it('出餐慢：等餐超过 10 分钟触发预警，超时 9 分钟并发赔付券', () => {
    const w = runScenario('slow-kitchen', 'delivered');
    expect(w.plan!.waitMin).toBeGreaterThan(10);
    expect(w.events.some((e) => e.title.startsWith('等餐预警'))).toBe(true);
    expect(w.late).toBe(9);
    expect(w.compensation).toBe(300);
  });

  it('改派：阿强 11:57 停下，12:00 预警，改派给老马，仍按时送达', () => {
    const w = runScenario('reassign', 'delivered');
    expect(w.plan!.stuck?.alertAt).toBe(T.riderAccept - 53.6 + 60);
    expect(w.reassign?.from).toBe('R01');
    expect(w.reassign?.to).toBe('R03');
    expect(w.order!.trail.some((t) => t.action === 'reassign')).toBe(true);
    expect(w.track.some((p) => p.phase === '原地不动')).toBe(true);
    expect(w.late).toBe(0);
    expect(RIDER_MAP[w.order!.riderId!].short).toBe('老马');
  });

  it('雨天：承诺时间放宽到 12:30', () => {
    expect(runScenario('rain', 'riderAccepted').order!.promisedAt).toBe(750);
  });

  it('轨迹点按时间排序，覆盖取餐途中、等餐与配送中', () => {
    const w = runScenario('standard', 'riderAccepted');
    const ats = w.track.map((p) => p.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
    expect(new Set(w.track.map((p) => p.phase))).toEqual(new Set(['取餐途中', '等餐', '配送中']));
  });
});

describe('阶段推进', () => {
  it('next 依次执行全部阶段，advanceTo 已到达时原样返回', () => {
    let w = initWorld('standard');
    for (let i = 1; i < STAGES.length; i++) {
      w = next(w);
      expect(w.stage).toBe(STAGES[i]);
    }
    expect(next(w)).toBe(w);
    const mid = advanceTo(initWorld(), 'paid');
    expect(advanceTo(mid, 'ordered')).toBe(mid);
  });

  it('业务时钟单调不减', () => {
    for (const s of SCENARIOS) {
      let w = initWorld(s.key);
      let last = w.clock;
      while (w.stage !== 'refunded') {
        w = next(w);
        expect(w.clock, `${s.key} ${w.stage}`).toBeGreaterThanOrEqual(last);
        last = w.clock;
      }
    }
  });
});

describe('运力与资金一支', () => {
  it('骑手上线：雨天订单更多、人均单量更低，缺口更大；4 名骑手进入运力池', () => {
    const clear = runScenario('standard', 'online').pool!;
    const rain = runScenario('rain', 'online').pool!;
    expect(clear.riders).toHaveLength(4);
    expect(rain.forecast.orders).toBeGreaterThan(clear.forecast.orders);
    expect(rain.forecast.gap).toBeGreaterThan(clear.forecast.gap);
  });

  for (const s of SCENARIOS) {
    it(`${s.title}：渠道对账全部对平，打款合计 = 商家应得 + 骑手收入，冲减与退款分摊一致`, () => {
      const w = runScenario(s.key);
      const rc = w.recon!;
      expect(rc.statement).toHaveLength(24);
      expect(rc.diffs).toEqual([]);
      expect(rc.matched).toBe(24);
      expect(rc.amount).toBe(w.settle!.summary.payable);
      expect(rc.fee).toBe(w.settle!.summary.channelFee);
      expect(rc.dupIgnored).toBe(s.expected.ignoredCallbacks);
      expect(w.payout!.total).toBe(w.settle!.summary.merchantNet + w.settle!.summary.rider);
      expect(w.offset!.merchantAdj).toBe(w.refund!.calc.merchantAdj);
      expect(w.offset!.merchantAdj + w.offset!.platformAdj).toBe(-w.refund!.calc.refund);
    });
  }

  it('对账能识别长款与金额不符（差异订单不进入当期结算）', async () => {
    const { reconcile } = await import('@/domain/settlement');
    const { tradeNoOf } = await import('@/domain/payment');
    const orders = [
      { no: 'CZ2026101811000001', time: '11:00', payable: 3000 },
      { no: 'CZ2026101811050002', time: '11:05', payable: 4200 },
    ];
    const r = reconcile({ date: '2026-10-18', at: 1500, orders, processed: { [tradeNoOf(orders[1].no)]: 4100 }, dupIgnored: 0 });
    expect(r.diffs.map((d) => d.kind).sort()).toEqual(['金额不符', '长款']);
    expect(r.matched).toBe(0);
  });

  it('时间线：01:00 对账 → 02:00 结算 → 08:00 打款 → 09:30 退款 → 后天 02:00 冲减', () => {
    const w = runScenario('standard');
    expect(clockLabel(w.recon!.at)).toBe('次日 01:00');
    expect(clockLabel(w.payout!.at)).toBe('次日 08:00');
    expect(clockLabel(w.offset!.at)).toBe('后天 02:00');
    expect(w.recon!.at).toBeLessThan(T.settle);
    expect(w.payout!.at).toBeLessThan(T.refundApply);
    expect(stamp(w.offset!.at)).toBe('2026-10-20 02:00:00');
  });
});
