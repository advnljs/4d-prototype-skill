/**
 * 运营与资金环节的演示脚本（PC 运营后台 / 结算中心与手机 App 的运营端共用）。
 */
import { useEffect } from 'react';
import { useFlow, useFlowStep, type FlowCtl } from '@/flow/director';
import { STEPS } from '@/flow/workflow';
import type { Stage } from '@/sim/world';
import { advance, useWorld } from './live';
import { prepareStep, replaySubs } from './liveFlow';
import { applyLunchTemplate, couponDraft } from './ops';

/** 发布午市券：套用模板 → 核对 → 发布 */
export function couponScript(c: FlowCtl) {
  if (prepareStep('coupon', 'init', 'coupon') === 'replay') return replaySubs(c, 'coupon');
  couponDraft.reset();
  c.sub(0);
  c.click('[data-demo="ops-template"]', () => {
    applyLunchTemplate();
    c.later(2000, () => {
      c.sub(1);
      c.click('[data-demo="ops-publish"]', () => {
        advance('coupon');
        c.later(1100, () => c.done());
      });
    });
  });
}

/** 运营看板（walk 型）：确保演示订单已完成，看板上能看到这一单 */
export function useOpsWalk() {
  useFlowStep('ops', () => void prepareStep('ops', 'rated', 'rated'));
}

export type MoneyStep = 'reconcile' | 'settle' | 'payout' | 'offset';

/** 资金一支的 walk 型环节：pre = 开始前的阶段，out = 产出阶段，从第 at 个子步骤起真正执行 */
export const MONEY: { id: MoneyStep; pre: Stage; out: Stage; at: number }[] = [
  { id: 'reconcile', pre: 'rated', out: 'reconciled', at: 1 },
  { id: 'settle', pre: 'reconciled', out: 'settled', at: 1 },
  { id: 'payout', pre: 'settled', out: 'paidOut', at: 1 },
  { id: 'offset', pre: 'refunded', out: 'offset', at: 1 },
];

/** 当前正在演示的资金环节与子步骤（不在演示资金环节时 id 为 null、sub 为 -1） */
export function useMoneyStep(): { id: MoneyStep | null; sub: number } {
  const cur = useFlow((s) => (s.active ? (STEPS[s.idx]?.id ?? null) : null));
  const sub = useFlow((s) => s.sub);
  const m = MONEY.find((x) => x.id === cur);
  return m ? { id: m.id, sub } : { id: null, sub: -1 };
}

/**
 * 渠道对账 → T+1 结算 → 打款到账，以及可选的下期冲减（都是 walk 型）：导演按子步骤推进，
 * 页面跟着显示进度；到第 at 个子步骤时真正执行该阶段。返回当前演示中的资金环节与子步骤。
 */
export function useMoneyWalk(): { id: MoneyStep | null; sub: number } {
  const w = useWorld();
  const cur = useMoneyStep();
  useFlowStep('reconcile', () => void prepareStep('reconcile', 'rated', 'reconciled'));
  useFlowStep('settle', () => void prepareStep('settle', 'reconciled', 'settled'));
  useFlowStep('payout', () => void prepareStep('payout', 'settled', 'paidOut'));
  useFlowStep('offset', () => void prepareStep('offset', 'refunded', 'offset'));
  useEffect(() => {
    const m = MONEY.find((x) => x.id === cur.id);
    if (m && cur.sub >= m.at && w.stage === m.pre) advance(m.out);
  }, [cur.id, cur.sub, w.stage]);
  return cur;
}
