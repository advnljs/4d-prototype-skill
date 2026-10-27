/**
 * 数据对象目录——4D 的“数据”维度：流程中流转的每一种数据结构（字段、类型、载体、敏感度、谁产生）。
 * 字段与 src/domain、src/sim 中的 TypeScript 类型一一对应；有生命周期的对象写明状态取值。
 * 每个对象在 formats.ts 中都有“原始样式”的格式样例（App 卡片 / 库表 / 接口报文 / Excel / 推理轨迹）。
 */
import type { ActorKey } from './actors';

export type DataKey = 'couponTpl' | 'menu' | 'riderPool' | 'cart' | 'order' | 'payment' | 'push' | 'dispatch' | 'track' | 'review' | 'metrics' | 'recon' | 'settlement' | 'payout' | 'refund' | 'offset';

export interface DataField {
  name: string;
  type: string;
  desc: string;
}

export interface DataObj {
  key: DataKey;
  name: string;
  type: string;
  carrier: string;
  sensitivity: '高' | '中' | '低';
  sensNote: string;
  producer: ActorKey;
  desc: string;
  states?: string[];
  fields: DataField[];
}

const D: DataObj[] = [
  {
    key: 'couponTpl',
    name: '平台券模板',
    type: 'CouponTpl',
    carrier: '营销库（建议表 mkt_coupon_tpl）',
    sensitivity: '低',
    sensNote: '营销配置',
    producer: 'ops',
    desc: '运营配置的平台券：门槛、面额、门槛口径、限量、时段、成本承担，发布即生效，带版本。',
    states: ['草稿', '已发布', '已下线'],
    fields: [
      { name: 'id', type: 'string', desc: '券模板编号' },
      { name: 'threshold / off', type: 'number（分）', desc: '门槛 / 面额' },
      { name: 'basis', type: "'afterMerchant' | 'original'", desc: '门槛口径：商家优惠后金额 / 商品原价' },
      { name: 'quota / perUser', type: 'number', desc: '总量 / 每人限领' },
      { name: 'window', type: 'string', desc: '可用时段' },
      { name: 'status / version', type: 'string / number', desc: '状态 / 版本号' },
    ],
  },
  {
    key: 'menu',
    name: '菜单与库存',
    type: 'Dish[]',
    carrier: '商品库（建议表 mch_dish）',
    sensitivity: '低',
    sensNote: '公开信息',
    producer: 'merchant',
    desc: '商家上架的菜品、价格、包装费、出餐时长与库存；开店后用户端可见。',
    fields: [
      { name: 'id / name', type: 'string', desc: '菜品编号 / 名称' },
      { name: 'price / pack', type: 'number（分）', desc: '单价 / 包装费' },
      { name: 'prep', type: 'number（分钟）', desc: '出餐时长，用于 ETA 预测' },
      { name: 'stock', type: 'number', desc: '库存' },
    ],
  },
  {
    key: 'riderPool',
    name: '运力池与高峰预测',
    type: 'RiderPool',
    carrier: '调度服务（建议表 dsp_capacity_snapshot + 在线骑手缓存）',
    sensitivity: '中',
    sensNote: '含骑手位置',
    producer: 'dispatch',
    desc: '午高峰前的片区运力预测（预计订单量、所需骑手、缺口与补运力动作），以及商家附近在线骑手的位置、负载与服务分；是派单召回的候选来源。',
    fields: [
      { name: 'window', type: 'string', desc: '高峰窗口' },
      { name: 'orders / perRider / need', type: 'number', desc: '预计订单量 / 每名骑手可完成单量 / 所需骑手数' },
      { name: 'online / gap', type: 'number', desc: '已上线骑手 / 缺口' },
      { name: 'action', type: 'string', desc: '补运力动作（冲单奖励）' },
      { name: 'riders[]', type: 'string[]', desc: '商家附近在线骑手' },
    ],
  },
  {
    key: 'cart',
    name: '购物车与价格试算',
    type: 'Pricing',
    carrier: '平台内存（下单前实时试算）',
    sensitivity: '低',
    sensNote: '不含个人信息',
    producer: 'platform',
    desc: '加购明细与试算结果：商品金额、包装费、配送费（距离 + 天气）、商家满减、平台券是否可用及原因、实付。',
    fields: [
      { name: 'lines[]', type: 'PricedLine[]', desc: '菜品、数量、小计、包装费' },
      { name: 'goods / pack / delivery', type: 'number（分）', desc: '商品原价 / 包装费 / 配送费' },
      { name: 'merchantOff / couponOff', type: 'number（分）', desc: '商家满减（商家承担）/ 平台券（平台承担）' },
      { name: 'couponBase / couponHint', type: 'number / string', desc: '平台券门槛基数 / 不可用原因' },
      { name: 'payable', type: 'number（分）', desc: '用户实付' },
    ],
  },
  {
    key: 'order',
    name: '订单',
    type: 'Order',
    carrier: '订单库（建议表 ord_order + ord_trail）',
    sensitivity: '高',
    sensNote: '含收货地址与手机号（脱敏展示）',
    producer: 'platform',
    desc: '一单的主状态与配送子状态、价格快照、各环节时间戳与状态轨迹。状态机是唯一的修改入口。',
    states: ['待支付', '已支付', '商家已接单', '出餐完成', '配送中', '已送达', '已完成', '已结算', '退款中', '部分退款'],
    fields: [
      { name: 'no', type: 'string', desc: '订单号 CZ + 日期 + 时分 + 序号' },
      { name: 'status', type: 'OrderStatus', desc: '主状态' },
      { name: 'riderState / riderId', type: 'RiderState / string', desc: '配送子状态 / 当前骑手' },
      { name: 'pricing', type: 'Pricing', desc: '下单时的价格快照' },
      { name: 'paidAt … settledAt', type: 'number', desc: '各环节时间戳' },
      { name: 'promisedAt', type: 'number', desc: '承诺送达时间' },
      { name: 'trail[]', type: 'TrailEntry[]', desc: '状态轨迹：时间、动作、从 → 到、操作方' },
    ],
  },
  {
    key: 'payment',
    name: '支付报文',
    type: 'PayRequest / PayCallback',
    carrier: '接口报文（收银台下单 + 网关异步回调，原型中为模拟）',
    sensitivity: '中',
    sensNote: '含金额与流水号',
    producer: 'gateway',
    desc: '平台向网关下单的请求、网关的异步回调，以及平台按 trade_no 幂等处理的结果。',
    fields: [
      { name: 'out_trade_no', type: 'string', desc: '平台订单号' },
      { name: 'trade_no', type: 'string', desc: '网关流水号（幂等键）' },
      { name: 'total_amount', type: 'number（分）', desc: '金额，回调时必须与订单一致' },
      { name: 'notify_id / sign', type: 'string', desc: '通知编号 / 签名（模拟）' },
      { name: 'result', type: "'processed' | 'ignored' | 'rejected'", desc: '平台处理结果' },
    ],
  },
  {
    key: 'push',
    name: '消息推送',
    type: 'Push',
    carrier: '推送通道（App 通知栏 / 语音播报）',
    sensitivity: '低',
    sensNote: '不含完整地址',
    producer: 'platform',
    desc: '平台在状态变化时推给三端的消息：商家新订单（语音播报）、骑手派单、用户进度。',
    fields: [
      { name: 'to', type: "'user' | 'merchant' | 'rider'", desc: '接收端' },
      { name: 'title / body', type: 'string', desc: '标题 / 内容' },
      { name: 'at', type: 'number', desc: '时间' },
    ],
  },
  {
    key: 'dispatch',
    name: '派单决策',
    type: 'DispatchDecision',
    carrier: '调度服务内存 → 调度日志（建议表 dsp_decision）',
    sensitivity: '中',
    sensNote: '含骑手位置',
    producer: 'dispatch',
    desc: '候选骑手、四个因子的得分与权重、选择理由、ETA 与承诺送达时间；改派时另记一条。',
    fields: [
      { name: 'candidates[]', type: 'Candidate[]', desc: '骑手、到店距离、负载、顺路度、评分、各因子分、总分、排除原因' },
      { name: 'weights', type: 'Weights', desc: '距离 / 负载 / 顺路 / 服务分权重' },
      { name: 'chosen / reason', type: 'string', desc: '选中骑手 / 理由' },
      { name: 'eta', type: '{ arrive, ready, pickup, deliver }', desc: '预计到店 / 出餐 / 取餐 / 送达' },
      { name: 'promisedAt', type: 'number', desc: '承诺送达时间' },
    ],
  },
  {
    key: 'track',
    name: '骑手轨迹',
    type: 'TrackPoint[]',
    carrier: '时序库（建议 rider_track，保留 30 天）',
    sensitivity: '高',
    sensNote: '实时位置，属于个人敏感信息',
    producer: 'rider',
    desc: '骑手 App 每 5 秒上报一次位置；用于用户端地图、超时预警（原地不动）与送达判定。',
    fields: [
      { name: 'at', type: 'number', desc: '时间' },
      { name: 'riderId', type: 'string', desc: '骑手' },
      { name: 'x / y', type: 'number（米）', desc: '示意平面坐标' },
      { name: 'speed', type: 'number（km/h）', desc: '速度' },
      { name: 'phase', type: 'string', desc: '取餐途中 / 等餐 / 配送中 / 原地不动' },
    ],
  },
  {
    key: 'review',
    name: '评价',
    type: 'Review',
    carrier: '评价库（建议表 ord_review）',
    sensitivity: '低',
    sensNote: '公开展示（昵称脱敏）',
    producer: 'user',
    desc: '用户对商家与骑手的星级、标签与文字评价；进入商家评分与骑手服务分。',
    fields: [
      { name: 'stars / riderStars', type: 'number', desc: '商家 / 骑手星级' },
      { name: 'tags[]', type: 'string[]', desc: '标签' },
      { name: 'text', type: 'string', desc: '文字评价' },
    ],
  },
  {
    key: 'metrics',
    name: '运营指标',
    type: 'OpsSnapshot',
    carrier: '实时数仓（分钟级聚合）',
    sensitivity: '低',
    sensNote: '只含统计数字',
    producer: 'platform',
    desc: '片区实时订单量、GMV、准时率、平均送达时长、需求热力与超时预警。',
    fields: [
      { name: 'orders / gmv', type: 'number', desc: '订单量 / 成交额' },
      { name: 'onTime / avgMin', type: 'number', desc: '准时率 / 平均送达分钟' },
      { name: 'hours[]', type: 'HourBar[]', desc: '半小时订单量与超时数' },
      { name: 'heat[]', type: 'HeatCell[]', desc: '网格需求热力' },
      { name: 'warnings[]', type: 'Warning[]', desc: '超时预警' },
    ],
  },
  {
    key: 'recon',
    name: '渠道对账结果',
    type: 'ReconResult',
    carrier: '网关对账单（CSV）+ 对账库（建议表 fin_recon）',
    sensitivity: '中',
    sensNote: '含金额与流水号',
    producer: 'scheduler',
    desc: '网关前一天的对账单与平台支付流水按 trade_no 逐笔核对的结果：对平笔数、金额、通道费，以及长款 / 短款 / 金额不符的差异挂账。',
    states: ['对账中', '已对平', '有差异（挂账）'],
    fields: [
      { name: 'date', type: 'string', desc: '账单日期' },
      { name: 'statement[]', type: 'StatementLine[]', desc: '对账单行：trade_no、平台订单号、金额、通道费、支付时间' },
      { name: 'platform / matched', type: 'number', desc: '平台流水笔数 / 对平笔数' },
      { name: 'amount / fee', type: 'number（分）', desc: '交易金额 / 通道费合计' },
      { name: 'dupIgnored', type: 'number', desc: '被幂等忽略的重复回调（不进入流水）' },
      { name: 'diffs[]', type: 'ReconDiff[]', desc: '差异：类型、金额、处理方式' },
    ],
  },
  {
    key: 'settlement',
    name: '结算单',
    type: 'SettleLine[]',
    carrier: '结算库（建议表 stl_bill）+ 对账文件（Excel）',
    sensitivity: '中',
    sensNote: '含商家收入',
    producer: 'scheduler',
    desc: '次日按订单拆分商家应得、骑手收入、平台佣金、支付通道费与平台净收入，逐笔勾稽后生成结算单与对账文件。',
    fields: [
      { name: 'orderNo / time', type: 'string', desc: '订单号 / 下单时间' },
      { name: 'payable', type: 'number（分）', desc: '用户实付' },
      { name: 'commission', type: 'number（分）', desc: '佣金 = (商品 + 包装 − 商家满减) × 18%' },
      { name: 'merchantNet', type: 'number（分）', desc: '商家应得' },
      { name: 'rider', type: 'RiderPay', desc: '骑手收入：基础 + 超距 + 天气 + 等餐补贴' },
      { name: 'channelFee / platformNet', type: 'number（分）', desc: '通道费 / 平台净收入' },
    ],
  },
  {
    key: 'payout',
    name: '打款批次',
    type: 'Payout',
    carrier: '资金库（建议表 fin_payout）+ 网关代付报文',
    sensitivity: '高',
    sensNote: '含收款账户（脱敏展示）',
    producer: 'platform',
    desc: '结算后的打款批次：商家应得打到对公账户、骑手收入打到骑手钱包；网关代付回执成功后通知到账。',
    states: ['待打款', '代付中', '已到账', '失败重试'],
    fields: [
      { name: 'batchNo', type: 'string', desc: '打款批次号' },
      { name: 'items[]', type: 'PayoutItem[]', desc: '收款方、类型、账户（脱敏）、单数、金额' },
      { name: 'total', type: 'number（分）', desc: '合计' },
      { name: 'status', type: 'string', desc: '代付状态' },
    ],
  },
  {
    key: 'refund',
    name: '退款单',
    type: 'RefundCalc / RefundRequest',
    carrier: '售后库（建议表 aft_refund）+ 网关退款报文',
    sensitivity: '中',
    sensNote: '含金额与原因',
    producer: 'platform',
    desc: '部分退款：退款商品、按原价占比分摊的优惠、退给用户的金额、商家与平台各自冲减，以及网关原路退款回调。',
    states: ['已申请', '商家已同意', '退款成功'],
    fields: [
      { name: 'dishId / qty', type: 'string / number', desc: '退款商品 / 数量' },
      { name: 'discountShare', type: 'number（分）', desc: '分摊到退款商品的优惠' },
      { name: 'refund', type: 'number（分）', desc: '退给用户' },
      { name: 'merchantAdj / platformAdj', type: 'number（分）', desc: '商家 / 平台冲减' },
      { name: 'out_refund_no / refund_no', type: 'string', desc: '平台退款单号 / 网关退款流水号' },
    ],
  },
  {
    key: 'offset',
    name: '冲减明细',
    type: 'OffsetEntry',
    carrier: '结算库（建议表 stl_adjust）',
    sensitivity: '中',
    sensNote: '含商家收入',
    producer: 'scheduler',
    desc: '已结算订单发生退款时，在下一结算周期写入的冲减明细：从商家本期结算款中扣减，平台承担其余部分。',
    fields: [
      { name: 'cycle', type: 'string', desc: '计入的结算周期（订单日期）' },
      { name: 'orderNo / refundNo', type: 'string', desc: '原订单号 / 网关退款流水号' },
      { name: 'refund', type: 'number（分）', desc: '退给用户的金额' },
      { name: 'merchantAdj / platformAdj', type: 'number（分）', desc: '商家冲减 / 平台承担（负数）' },
    ],
  },
];

export const DATA_OBJECTS: Record<DataKey, DataObj> = Object.fromEntries(D.map((d) => [d.key, d])) as Record<DataKey, DataObj>;

export const DATA_ORDER: DataKey[] = D.map((d) => d.key);
