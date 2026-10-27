/**
 * 数据流转（lineage）：跟踪“一单”和“一笔钱”在流程中每一阶段的结构，并标注字段的变化方式与状态迁移。
 * 全部基于模拟后端的真实执行结果（runScenario），不是静态示意。
 */
import { CUSTOMER, MERCHANT, RIDER_MAP } from '@/domain/catalog';
import { STATUS_LABEL, type OrderStatus } from '@/domain/orderMachine';
import { rmb } from '@/lib/format';
import { clockLabel, type World } from '@/sim/world';
import type { ActorKey } from './actors';

export type Change = 'keep' | 'map' | 'derive' | 'new' | 'mask' | 'drop';

export const CHANGE_LABEL: Record<Change, string> = {
  keep: '原样',
  map: '映射改名',
  derive: '派生计算',
  new: '新增',
  mask: '脱敏',
  drop: '不再携带',
};

export interface LField {
  k: string;
  v: string;
  change: Change;
  note?: string;
}

export interface LStage {
  key: string;
  title: string;
  type: string;
  actor: ActorKey;
  summary: string;
  fields: LField[];
  more?: string;
}

const st = (a: OrderStatus, b: OrderStatus) => `${STATUS_LABEL[a]} → ${STATUS_LABEL[b]}`;

/** 一单从加购到结算、售后的全过程 */
export function orderLineage(w: World): LStage[] {
  const o = w.order!;
  const pr = o.pricing;
  const d = w.dispatch!;
  const rider = RIDER_MAP[o.riderId!];
  const items = pr.lines.map((l) => `${l.name}×${l.qty}`).join('、');
  const stages: LStage[] = [
    {
      key: 'cart',
      title: '加购',
      type: 'CartLine[]',
      actor: 'user',
      summary: '用户在店铺页加购，客户端只保存菜品编号与数量；价格以服务端试算为准。',
      fields: [
        { k: 'lines', v: items, change: 'new' },
        { k: 'claimed', v: w.claimed ? '已领午市券' : '未领券', change: 'new' },
      ],
    },
    {
      key: 'pricing',
      title: '价格试算',
      type: 'Pricing',
      actor: 'platform',
      summary: '平台按商家满减、平台券门槛口径与配送费规则试算；结果作为价格快照写入订单。',
      fields: [
        { k: 'goods', v: rmb(pr.goods), change: 'derive', note: '单价 × 数量' },
        { k: 'pack / delivery', v: `${rmb(pr.pack)} / ${rmb(pr.delivery)}`, change: 'derive', note: `距离 ${pr.distanceKm} km` },
        { k: 'merchantOff', v: `-${rmb(pr.merchantOff)}`, change: 'derive', note: '商家承担' },
        { k: 'couponOff', v: pr.couponApplied ? `-${rmb(pr.couponOff)}` : '0（不可用）', change: 'derive', note: pr.couponHint ?? `门槛基数 ${rmb(pr.couponBase)}` },
        { k: 'payable', v: rmb(pr.payable), change: 'new' },
      ],
    },
    {
      key: 'order',
      title: '创建订单',
      type: 'Order',
      actor: 'platform',
      summary: '生成订单号，锁定价格与库存 15 分钟；收货信息在商家、骑手端脱敏展示。',
      fields: [
        { k: 'no', v: o.no, change: 'new' },
        { k: 'status', v: `— → ${STATUS_LABEL.pending_pay}`, change: 'new' },
        { k: 'pricing', v: `快照 · 实付 ${rmb(pr.payable)}`, change: 'keep' },
        { k: 'address', v: CUSTOMER.address, change: 'new' },
        { k: 'phone', v: CUSTOMER.phone, change: 'mask', note: '中间四位隐藏' },
      ],
    },
    {
      key: 'pay',
      title: '支付与回调',
      type: 'PayRequest → PayCallback',
      actor: 'gateway',
      summary: '订单号、金额映射为网关字段；回调验签、金额一致、trade_no 幂等后订单变为已支付。',
      fields: [
        { k: 'out_trade_no', v: o.no, change: 'map', note: '← no' },
        { k: 'total_amount', v: String(pr.payable), change: 'map', note: '← payable（分）' },
        { k: 'trade_no', v: o.tradeNo!, change: 'new', note: '网关流水号 = 幂等键' },
        { k: 'status', v: st('pending_pay', 'paid'), change: 'derive' },
        { k: 'paidAt', v: clockLabel(o.paidAt!), change: 'new' },
      ],
      more: w.callbacks.length > 1 ? `收到 ${w.callbacks.length} 次回调，${w.callbacks.filter((c) => c.result.result === 'ignored').length} 次按 trade_no 忽略。` : undefined,
    },
    {
      key: 'accept',
      title: '商家接单',
      type: 'Order',
      actor: 'merchant',
      summary: '商家接单，系统按最慢的菜给出预计出餐时间。',
      fields: [
        { k: 'status', v: st('paid', 'accepted'), change: 'derive' },
        { k: 'acceptedAt', v: clockLabel(o.acceptedAt!), change: 'new' },
        { k: '预计出餐', v: clockLabel(d.eta.ready), change: 'derive', note: '接单时间 + 最长出餐时长' },
      ],
    },
    {
      key: 'dispatch',
      title: '智能派单',
      type: 'DispatchDecision',
      actor: 'dispatch',
      summary: `召回 ${d.candidates.length} 名骑手打分，派给${RIDER_MAP[d.chosen].short}；订单记下骑手与承诺送达时间。`,
      fields: [
        { k: 'riderId', v: `${d.chosen} ${RIDER_MAP[d.chosen].short}`, change: 'new', note: `得分 ${d.candidates[0].score.toFixed(2)}` },
        { k: 'riderState', v: '待派单 → 骑手已接单', change: 'derive' },
        { k: 'promisedAt', v: clockLabel(o.promisedAt!), change: 'derive', note: 'ETA + 2 分钟，按 5 分钟取整' },
        { k: 'candidates', v: `${d.candidates.length} 名（写入调度日志）`, change: 'drop', note: '不随订单携带' },
      ],
      more: w.reassign ? `改派：${RIDER_MAP[w.reassign.from].short} → ${RIDER_MAP[w.reassign.to].short}（${w.reassign.reason}）` : undefined,
    },
    {
      key: 'deliver',
      title: '取餐与配送',
      type: 'Order + TrackPoint[]',
      actor: 'rider',
      summary: `${rider.short}到店、取餐、配送，位置每 5 秒上报；送达后停止向用户展示位置。`,
      fields: [
        { k: 'readyAt', v: clockLabel(o.readyAt!), change: 'new' },
        { k: 'pickedAt', v: clockLabel(o.pickedAt!), change: 'new' },
        { k: 'status', v: `${st('ready', 'delivering')} → ${STATUS_LABEL.delivered}`, change: 'derive' },
        { k: 'track', v: `${w.track.length} 个抽样点`, change: 'new', note: '时序库保留 30 天' },
        { k: 'deliveredAt', v: clockLabel(o.deliveredAt!), change: 'new', note: w.late ? `超时 ${w.late} 分钟` : '准时' },
      ],
    },
    {
      key: 'review',
      title: '收货与评价',
      type: 'Order + Review',
      actor: 'user',
      summary: '用户确认收货并评价，订单进入“已完成”，等待次日结算。',
      fields: [
        { k: 'status', v: st('delivered', 'completed'), change: 'derive' },
        { k: 'review', v: `商家 ${w.review!.stars} 星 · 骑手 ${w.review!.riderStars} 星`, change: 'new' },
        { k: 'track', v: '停止向用户展示', change: 'drop' },
      ],
    },
    {
      key: 'settle',
      title: 'T+1 结算',
      type: 'SettleLine',
      actor: 'scheduler',
      summary: '次日 02:00 拆分实付：商家应得、骑手收入、通道费、平台净收入，逐笔勾稽。',
      fields: [
        { k: 'payable', v: rmb(w.settle!.line.payable), change: 'keep' },
        { k: 'commission', v: rmb(w.settle!.line.commission), change: 'derive', note: `(商品 + 包装 − 商家满减) × ${MERCHANT.commissionRate * 100}%` },
        { k: 'merchantNet', v: rmb(w.settle!.line.merchantNet), change: 'derive' },
        { k: 'riderIncome', v: rmb(w.settle!.line.rider.total), change: 'derive' },
        { k: 'platformNet', v: rmb(w.settle!.line.platformNet), change: 'derive', note: '实付 − 商家 − 骑手 − 通道费' },
        { k: 'address / phone', v: '不进入结算', change: 'drop' },
        { k: 'status', v: st('completed', 'settled'), change: 'derive' },
      ],
    },
  ];
  if (w.refund?.doneAt) {
    stages.push({
      key: 'refund',
      title: '售后冲减',
      type: 'RefundCalc',
      actor: 'platform',
      summary: '部分退款按原价占比分摊优惠，原路退回；已结算订单在下一结算周期冲减。',
      fields: [
        { k: 'refund', v: rmb(w.refund.calc.refund), change: 'new' },
        { k: 'discountShare', v: rmb(w.refund.calc.discountShare), change: 'derive' },
        { k: 'merchantAdj', v: rmb(w.refund.calc.merchantAdj), change: 'derive' },
        { k: 'platformAdj', v: rmb(w.refund.calc.platformAdj), change: 'derive' },
        { k: 'status', v: `${STATUS_LABEL.settled} → ${STATUS_LABEL.refunding} → ${STATUS_LABEL.refunded}`, change: 'derive' },
      ],
    });
  }
  return stages;
}

/** 一笔钱的去向：从用户支付到四方分账 */
export function moneyLineage(w: World): LStage[] {
  const l = w.settle!.line;
  const pr = w.order!.pricing;
  const stages: LStage[] = [
    {
      key: 'pay',
      title: '用户支付',
      type: 'PayCallback',
      actor: 'user',
      summary: '用户实付进入支付网关。',
      fields: [
        { k: 'goods + pack + delivery', v: `${rmb(pr.goods)} + ${rmb(pr.pack)} + ${rmb(pr.delivery)}`, change: 'new' },
        { k: '− 商家满减 − 平台券', v: `−${rmb(pr.merchantOff)} −${rmb(pr.couponOff)}`, change: 'derive' },
        { k: 'payable', v: rmb(pr.payable), change: 'new' },
      ],
    },
    {
      key: 'clear',
      title: '网关清算',
      type: 'ChannelFee',
      actor: 'gateway',
      summary: '网关按费率收取通道费，其余进入平台待结算账户。',
      fields: [
        { k: 'payable', v: rmb(pr.payable), change: 'keep' },
        { k: 'channelFee', v: rmb(l.channelFee), change: 'derive', note: '× 0.6%' },
      ],
    },
    {
      key: 'split',
      title: 'T+1 分账',
      type: 'SettleLine',
      actor: 'scheduler',
      summary: '按公式拆给商家、骑手，剩余为平台净收入（可能为负，即平台补贴）。',
      fields: [
        { k: 'merchantNet', v: rmb(l.merchantNet), change: 'derive', note: `商品 + 包装 − 商家满减 − 佣金 ${rmb(l.commission)}` },
        { k: 'riderIncome', v: rmb(l.rider.total), change: 'derive', note: `基础 ${rmb(l.rider.base)}${l.rider.distance ? ` + 超距 ${rmb(l.rider.distance)}` : ''}${l.rider.rain ? ` + 天气 ${rmb(l.rider.rain)}` : ''}${l.rider.wait ? ` + 等餐 ${rmb(l.rider.wait)}` : ''}` },
        { k: 'channelFee', v: rmb(l.channelFee), change: 'keep' },
        { k: 'platformNet', v: rmb(l.platformNet), change: 'derive', note: '佣金 + 用户配送费 − 平台券 − 骑手收入 − 通道费' },
        { k: '勾稽', v: `${rmb(l.merchantNet + l.rider.total + l.channelFee + l.platformNet)} = 实付`, change: 'derive' },
      ],
    },
  ];
  if (w.refund?.doneAt)
    stages.push({
      key: 'refund',
      title: '退款冲减',
      type: 'RefundCalc',
      actor: 'platform',
      summary: '退给用户的钱由商家和平台按分摊结果各自承担，计入下一结算周期。',
      fields: [
        { k: 'refund', v: rmb(w.refund.calc.refund), change: 'new' },
        { k: 'merchantAdj', v: rmb(w.refund.calc.merchantAdj), change: 'derive' },
        { k: 'platformAdj', v: rmb(w.refund.calc.platformAdj), change: 'derive' },
      ],
    });
  return stages;
}
