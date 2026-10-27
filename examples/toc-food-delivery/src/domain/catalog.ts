/**
 * 基础资料（全部虚构）：城市片区、商家与菜品、用户、骑手、运营，以及示意地图的街道与路线。
 * 地图使用平面坐标：1 个单位 = 5 米，画布 1000 × 600（约 5 × 3 公里）。
 */

export const CITY = { name: '临江市', district: '滨湖区', note: '虚构城市与片区' };

export const DEMO_DATE = '2026-10-18';
export const DEMO_DATE_CN = '10 月 18 日';

export interface Pt {
  x: number;
  y: number;
}

/** 1 个地图单位 = 5 米 */
export const METERS_PER_UNIT = 5;

export function routeLength(path: Pt[]) {
  let d = 0;
  for (let i = 1; i < path.length; i++) d += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
  return d;
}

/** 路线长度（公里，保留 2 位） */
export function routeKm(path: Pt[]) {
  return Math.round((routeLength(path) * METERS_PER_UNIT) / 10) / 100;
}

/** 沿折线前进 t（0–1）处的位置 */
export function pointAt(path: Pt[], t: number): Pt {
  const total = routeLength(path);
  if (total === 0) return path[0];
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if (left <= seg || i === path.length - 1) {
      const k = seg ? Math.min(1, left / seg) : 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= seg;
  }
  return path[path.length - 1];
}

/* ---------------- 街道（示意） ---------------- */

export interface Street {
  name: string;
  from: Pt;
  to: Pt;
  major?: boolean;
}

export const STREETS: Street[] = [
  { name: '云杉大道', from: { x: 0, y: 110 }, to: { x: 1000, y: 110 }, major: true },
  { name: '梧桐路', from: { x: 0, y: 300 }, to: { x: 1000, y: 300 }, major: true },
  { name: '湖滨路', from: { x: 0, y: 490 }, to: { x: 1000, y: 490 } },
  { name: '银杏街', from: { x: 140, y: 0 }, to: { x: 140, y: 600 } },
  { name: '樟树街', from: { x: 380, y: 0 }, to: { x: 380, y: 600 } },
  { name: '枫林街', from: { x: 620, y: 0 }, to: { x: 620, y: 600 }, major: true },
  { name: '竹园街', from: { x: 860, y: 0 }, to: { x: 860, y: 600 } },
];

/* ---------------- 商家与菜品 ---------------- */

export type DishKind = 'beefNoodle' | 'tomatoNoodle' | 'egg' | 'tea' | 'cucumber';

export interface Dish {
  id: string;
  name: string;
  kind: DishKind;
  /** 单价（分） */
  price: number;
  /** 包装费（分/份） */
  pack: number;
  /** 出餐时长（分钟） */
  prep: number;
  stock: number;
  desc: string;
  sales: number;
}

export const DISHES: Dish[] = [
  { id: 'D01', name: '招牌牛肉手擀面', kind: 'beefNoodle', price: 2800, pack: 100, prep: 12, stock: 60, desc: '现擀宽面 · 慢炖牛腱', sales: 1286 },
  { id: 'D02', name: '番茄鸡蛋面', kind: 'tomatoNoodle', price: 2200, pack: 100, prep: 10, stock: 60, desc: '番茄现炒 · 土鸡蛋', sales: 842 },
  { id: 'D03', name: '卤蛋', kind: 'egg', price: 300, pack: 0, prep: 0, stock: 120, desc: '老卤 6 小时', sales: 2105 },
  { id: 'D04', name: '冰柠檬茶', kind: 'tea', price: 800, pack: 0, prep: 2, stock: 80, desc: '手打柠檬 · 少冰', sales: 693 },
  { id: 'D05', name: '凉拌黄瓜', kind: 'cucumber', price: 900, pack: 0, prep: 3, stock: 40, desc: '拍黄瓜 · 蒜香', sales: 377 },
];

export const DISH_MAP: Record<string, Dish> = Object.fromEntries(DISHES.map((d) => [d.id, d]));

/** 商家满减活动（商家承担）：取满足条件的最高一档 */
export const MERCHANT_TIERS: { min: number; off: number }[] = [
  { min: 3000, off: 300 },
  { min: 5000, off: 600 },
];

export const MERCHANT = {
  id: 'M1001',
  name: '张记手擀面（滨湖店）',
  short: '张记手擀面',
  owner: '张建国',
  ownerShort: '张老板',
  phone: '000-0000-1001',
  address: '滨湖区梧桐路 88 号',
  pos: { x: 420, y: 300 } as Pt,
  rating: 4.8,
  monthSales: 2316,
  /** 平台佣金率 */
  commissionRate: 0.18,
};

/* ---------------- 用户 ---------------- */

export const CUSTOMER = {
  id: 'U2088',
  name: '林晓',
  short: '小林',
  phone: '000****1234',
  address: '滨湖区云杉公寓 3 栋 1201',
  pos: { x: 880, y: 110 } as Pt,
};

/** 商家 → 用户的配送路线 */
export const ROUTE_STORE_TO_CUSTOMER: Pt[] = [MERCHANT.pos, { x: 620, y: 300 }, { x: 620, y: 110 }, CUSTOMER.pos];

/* ---------------- 骑手 ---------------- */

export interface Rider {
  id: string;
  name: string;
  short: string;
  rating: number;
  /** 手上未完成的订单数 */
  load: number;
  /** 顺路度：手上订单的去向与本单方向的一致程度（0–1） */
  align: number;
  pos: Pt;
  /** 骑手当前位置 → 商家的路线 */
  toStore: Pt[];
  note: string;
}

export const RIDERS: Rider[] = [
  { id: 'R01', name: '王强', short: '阿强', rating: 4.9, load: 1, align: 0.85, pos: { x: 140, y: 430 }, toStore: [{ x: 140, y: 430 }, { x: 140, y: 300 }, MERCHANT.pos], note: '手上 1 单送往枫林街方向，与本单顺路' },
  { id: 'R02', name: '周凯', short: '小周', rating: 4.7, load: 0, align: 0.3, pos: { x: 140, y: 110 }, toStore: [{ x: 140, y: 110 }, { x: 380, y: 110 }, { x: 380, y: 300 }, MERCHANT.pos], note: '空闲，但离商家较远' },
  { id: 'R03', name: '马建', short: '老马', rating: 4.8, load: 3, align: 0.1, pos: { x: 500, y: 300 }, toStore: [{ x: 500, y: 300 }, MERCHANT.pos], note: '离商家最近，但手上 3 单，且都往西送' },
  { id: 'R04', name: '李杰', short: '阿杰', rating: 4.6, load: 1, align: 0.6, pos: { x: 860, y: 470 }, toStore: [{ x: 860, y: 470 }, { x: 860, y: 300 }, MERCHANT.pos], note: '在竹园街南侧，距离超过 3 公里' },
];

export const RIDER_MAP: Record<string, Rider> = Object.fromEntries(RIDERS.map((r) => [r.id, r]));

/** 骑手满载上限：达到即不参与派单 */
export const RIDER_CAPACITY = 4;

/** 骑行速度（米/分钟）：晴天 250，雨天 200 */
export const SPEED_M_PER_MIN = { clear: 250, rain: 200 } as const;

/* ---------------- 运营 ---------------- */

export const OPS = { name: '陈楠', short: '陈楠', team: '滨湖区城市运营' };

/** 演示角色（顶栏切换） */
export const PEOPLE = {
  user: { name: CUSTOMER.short, full: CUSTOMER.name, title: '用户' },
  merchant: { name: MERCHANT.ownerShort, full: MERCHANT.owner, title: '商家' },
  rider: { name: RIDERS[0].short, full: RIDERS[0].name, title: '骑手' },
  ops: { name: OPS.name, full: OPS.name, title: '城市运营' },
} as const;
