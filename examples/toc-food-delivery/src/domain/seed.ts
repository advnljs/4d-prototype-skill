/**
 * 确定性种子数据：商家当日其他订单（T+1 结算批次用）与片区运营指标（运营看板用）。
 * 由固定种子生成，每次一样；统计数字由明细实时计算，列表与汇总永远一致。
 */
import { hash, hm, rng } from '@/lib/format';
import { LUNCH_COUPON, price, type CartLine } from './pricing';
import { riderPay, settleOrder, type SettleLine } from './settlement';
import { DEMO_DATE } from './catalog';

let cache: SettleLine[] | null = null;

/** 张记手擀面当日除演示订单外的 23 笔已完成订单 */
export function seedSettleLines(): SettleLine[] {
  if (cache) return cache;
  const r = rng(hash(`M1001-${DEMO_DATE}`));
  const coupon = { ...LUNCH_COUPON, status: 'published' as const, version: 1 };
  const out: SettleLine[] = [];
  for (let i = 0; i < 23; i++) {
    const at = Math.round(10 * 60 + 40 + r() * 600);
    const cart: CartLine[] = [
      { dishId: r() < 0.62 ? 'D01' : 'D02', qty: 1 },
      { dishId: r() < 0.5 ? 'D01' : 'D02', qty: r() < 0.35 ? 1 : 0 },
      { dishId: 'D03', qty: Math.floor(r() * 3) },
      { dishId: 'D04', qty: r() < 0.3 ? 1 : 0 },
      { dishId: 'D05', qty: r() < 0.2 ? 1 : 0 },
    ];
    const merged = Object.values(cart.reduce<Record<string, CartLine>>((a, l) => ({ ...a, [l.dishId]: { dishId: l.dishId, qty: (a[l.dishId]?.qty ?? 0) + l.qty } }), {}));
    const km = Math.round((1 + r() * 3.6) * 10) / 10;
    const inLunch = at >= 11 * 60 && at < 14 * 60;
    const pr = price({ lines: merged, coupon: inLunch && r() < 0.7 ? coupon : null, distanceKm: km, weather: 'clear' });
    const extraKm = Math.max(0, Math.ceil(Math.round((km - 3) * 100) / 100));
    const no = `CZ${DEMO_DATE.replace(/-/g, '')}${hm(at).replace(':', '')}${String(i + 1 < 12 ? i + 1 : i + 2).padStart(4, '0')}`;
    out.push(settleOrder(no, hm(at), pr, riderPay({ extraKm, rain: false, waitMin: r() < 0.12 ? 11 + r() * 4 : r() * 6 })));
  }
  cache = out.sort((a, b) => a.time.localeCompare(b.time));
  return cache;
}

/* ---------------- 运营看板 ---------------- */

export interface HourBar {
  label: string;
  orders: number;
  late: number;
}

export interface HeatCell {
  c: number;
  r: number;
  v: number;
}

export interface OpsSnapshot {
  orders: number;
  gmv: number;
  onTime: number;
  avgMin: number;
  riders: number;
  pending: number;
  hours: HourBar[];
  heat: HeatCell[];
  warnings: { at: string; order: string; kind: string; text: string; level: 'warn' | 'error' }[];
}

const HOT: { c: number; r: number; w: number }[] = [
  { c: 7, r: 1, w: 1 },
  { c: 3, r: 2, w: 0.8 },
  { c: 8, r: 4, w: 0.55 },
  { c: 1, r: 4, w: 0.4 },
];

/** 片区午高峰快照（截至 12:20） */
export function opsSnapshot(): OpsSnapshot {
  const r = rng(hash(`ops-${DEMO_DATE}`));
  const shape = [0.18, 0.32, 0.62, 1, 0.94, 0.58, 0.34, 0.2];
  const labels = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'];
  const hours = shape.map((s, i) => {
    const orders = i < 5 ? Math.round(s * 300 + r() * 24) : 0;
    return { label: labels[i], orders, late: Math.round(orders * (0.025 + r() * 0.03)) };
  });
  const heat: HeatCell[] = [];
  for (let c = 0; c < 10; c++)
    for (let rr = 0; rr < 6; rr++) {
      const v = HOT.reduce((a, h) => a + h.w * Math.exp(-((c - h.c) ** 2 + (rr - h.r) ** 2) / 2.2), 0);
      heat.push({ c, r: rr, v: Math.round((v * 100 + r() * 12) * 10) / 10 });
    }
  const orders = hours.reduce((a, h) => a + h.orders, 0);
  const late = hours.reduce((a, h) => a + h.late, 0);
  return {
    orders,
    gmv: Math.round(orders * (4100 + r() * 600)),
    onTime: 1 - late / orders,
    avgMin: Math.round((27.5 + r() * 3) * 10) / 10,
    riders: 214,
    pending: 37,
    hours,
    heat,
    warnings: [
      { at: '12:06', order: 'CZ2026101811410087', kind: '等餐超时', text: '骑手到店等餐 12 分钟，已催商家', level: 'warn' },
      { at: '12:11', order: 'CZ2026101811470132', kind: '预计超时', text: '配送路线拥堵，预计晚 6 分钟，已提醒用户', level: 'warn' },
      { at: '12:14', order: 'CZ2026101811500154', kind: '骑手异常', text: '骑手 4 分钟未移动，已改派', level: 'error' },
    ],
  };
}
