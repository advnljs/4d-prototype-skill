/**
 * 演示情景：每个情景是一个业务故事，带参数与预期结果（测试逐条校验）。
 * 一键运行完整流程时可以选情景；三端联动页也可以切换情景后重新演练。
 */
import type { CartLine, Weather } from '@/domain/pricing';

export type ScenarioKey = 'standard' | 'slow-kitchen' | 'reassign' | 'rain' | 'dup-callback' | 'coupon-threshold';

export interface Scenario {
  key: ScenarioKey;
  title: string;
  tag: string;
  story: string;
  expect: string;
  params: {
    weather: Weather;
    cart: CartLine[];
    /** 商家出餐时长（分钟，覆盖菜品默认值） */
    prepMin?: number;
    /** 首选骑手中途车辆故障 */
    stuck?: boolean;
    /** 网关重复发送支付回调 */
    dupCallback?: boolean;
  };
  /** 预期结果（测试断言） */
  expected: {
    payable: number;
    couponApplied: boolean;
    finalRider: string;
    late: boolean;
    reassigned: boolean;
    ignoredCallbacks: number;
    riderIncome: number;
  };
}

const STANDARD_CART: CartLine[] = [
  { dishId: 'D01', qty: 1 },
  { dishId: 'D02', qty: 1 },
  { dishId: 'D03', qty: 2 },
];

export const SCENARIOS: Scenario[] = [
  {
    key: 'standard',
    title: '标准单（午高峰）',
    tag: '主流程',
    story: '小林和同事中午点了两碗面加两个卤蛋。商家满 50 减 6 后还有 50 元，够用午市满 40 减 8 平台券；阿强顺路接单，到店等了 3 分钟，下单后约 29 分钟送达。',
    expect: '实付 49 元；派给阿强（顺路）；12:25 前送达；结算时平台净收入 0.07 元。',
    params: { weather: 'clear', cart: STANDARD_CART },
    expected: { payable: 4900, couponApplied: true, finalRider: 'R01', late: false, reassigned: false, ignoredCallbacks: 0, riderIncome: 600 },
  },
  {
    key: 'slow-kitchen',
    title: '出餐慢，骑手等餐',
    tag: '履约异常',
    story: '午高峰商家积压，这单出餐用了 25 分钟。阿强 12:02 到店，等餐超过 10 分钟，系统给商家发催单提醒，给骑手记等餐补贴；最终超时送达。',
    expect: '等餐预警；骑手收入含等餐补贴 2 元；超时 9 分钟，向用户发 3 元无门槛赔付券。',
    params: { weather: 'clear', cart: STANDARD_CART, prepMin: 25 },
    expected: { payable: 4900, couponApplied: true, finalRider: 'R01', late: true, reassigned: false, ignoredCallbacks: 0, riderIncome: 800 },
  },
  {
    key: 'reassign',
    title: '骑手故障，超时预警与改派',
    tag: '调度',
    story: '阿强接单后电动车故障，3 分钟没有移动。系统预测会超时，发出预警并把订单改派给离商家最近的老马；老马到店时面刚好出锅，仍按时送达。',
    expect: '原地不动预警；改派给老马；仍在承诺时间内送达。',
    params: { weather: 'clear', cart: STANDARD_CART, stuck: true },
    expected: { payable: 4900, couponApplied: true, finalRider: 'R03', late: false, reassigned: true, ignoredCallbacks: 0, riderIncome: 600 },
  },
  {
    key: 'rain',
    title: '下雨，配送费加价',
    tag: '定价',
    story: '中午突降大雨：用户端配送费 +2 元，骑手每单补贴 +3 元，骑行变慢，承诺送达时间自动放宽。',
    expect: '实付 51 元；承诺 12:30 送达；骑手收入 9 元；这一单平台净收入为负（补贴）。',
    params: { weather: 'rain', cart: STANDARD_CART },
    expected: { payable: 5100, couponApplied: true, finalRider: 'R01', late: false, reassigned: false, ignoredCallbacks: 0, riderIncome: 900 },
  },
  {
    key: 'dup-callback',
    title: '支付回调重复',
    tag: '接口幂等',
    story: '网关回调后没收到平台的 ack（网络抖动），30 秒后重发同一笔回调。平台按 trade_no 识别出已处理，直接回 ack，不重复改状态、不重复通知商家。',
    expect: '收到 2 次回调，只处理 1 次；商家只收到 1 条新订单提醒。',
    params: { weather: 'clear', cart: STANDARD_CART, dupCallback: true },
    expected: { payable: 4900, couponApplied: true, finalRider: 'R01', late: false, reassigned: false, ignoredCallbacks: 1, riderIncome: 600 },
  },
  {
    key: 'coupon-threshold',
    title: '优惠门槛：原价够了，券却不能用',
    tag: '营销规则',
    story: '小林点了牛肉面、卤蛋和凉拌黄瓜，原价正好 40 元；但商家满 30 减 3 之后只剩 37 元，平台券门槛按商家优惠后金额算，所以不能用。',
    expect: '平台券不可用，提示“差 3 元可用”；实付 43 元。',
    params: {
      weather: 'clear',
      cart: [
        { dishId: 'D01', qty: 1 },
        { dishId: 'D03', qty: 1 },
        { dishId: 'D05', qty: 1 },
      ],
    },
    expected: { payable: 4300, couponApplied: false, finalRider: 'R01', late: false, reassigned: false, ignoredCallbacks: 0, riderIncome: 600 },
  },
];

export const SCENARIO_MAP: Record<ScenarioKey, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.key, s])) as Record<ScenarioKey, Scenario>;

/** 售后退款统一演示“漏送 1 个卤蛋”（所有情景都含卤蛋） */
export const REFUND_ITEM = { dishId: 'D03', qty: 1, reason: '卤蛋漏送' };
