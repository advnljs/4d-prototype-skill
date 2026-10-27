/**
 * 文件 / 数据格式样例：每种数据对象“实际长什么样”。
 * 全部由当前情景跑一遍模拟后端得到（runScenario），不是手写的静态示例：
 * App 卡片按三端界面原样、库表给出建议表名与样例行、接口报文给出 JSON、结算文件复用对账 Excel 的版式模型。
 */
import { CUSTOMER, DISHES, MERCHANT, RIDER_MAP } from '@/domain/catalog';
import { RIDER_STATE_LABEL, STATUS_LABEL } from '@/domain/orderMachine';
import { opsSnapshot } from '@/domain/seed';
import { rmb, yuan } from '@/lib/format';
import { settleFileName, settlementSheet } from '@/lib/settleSheet';
import type { XSheet } from '@/lib/xlsx/writer';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, runScenario, type World } from '@/sim/world';
import { liveStore } from '@/state/live';
import type { DataKey } from './dataObjects';

export interface DbColumn {
  name: string;
  type: string;
  comment: string;
}

export interface AppCard {
  device: 'user' | 'merchant' | 'rider' | 'ops';
  app: string;
  heading: string;
  badge?: string;
  lines: [string, string][];
  foot?: string;
}

export interface TraceStep {
  tag: string;
  title: string;
  detail: string;
}

export type FormatSample =
  | { kind: 'sheet'; title: string; fileName: string; sheet: XSheet; naming?: string; note: string }
  | { kind: 'json'; title: string; value: unknown; note: string }
  | { kind: 'form'; title: string; fields: ([string, string] | [string, string, 'wide'])[]; note: string }
  | { kind: 'trace'; title: string; steps: TraceStep[]; verdict: string; note: string }
  | { kind: 'code'; title: string; code: string; note: string }
  | { kind: 'table'; title: string; table: string; store: string; columns: DbColumn[]; rows: (string | number | null)[][]; total?: number; note: string }
  | { kind: 'app'; title: string; card: AppCard; note: string };

const col = (name: string, type: string, comment: string): DbColumn => ({ name, type, comment });

/** 当前情景完整跑一遍（含售后）的结果 */
function world(): World {
  return runScenario(liveStore.get().scenario);
}

export function formatSamples(key: DataKey): FormatSample[] {
  const w = world();
  const o = w.order!;
  const pr = o.pricing;
  const sc = SCENARIO_MAP[w.scenario];
  switch (key) {
    case 'couponTpl':
      return [
        {
          kind: 'form',
          title: '运营后台 · 平台券配置页',
          fields: [
            ['券名称', w.coupon.name],
            ['券类型', '满减券（平台承担）'],
            ['使用门槛', `满 ${yuan(w.coupon.threshold)} 元`],
            ['面额', `${yuan(w.coupon.off)} 元`],
            ['门槛口径', '商家优惠后的商品金额'],
            ['叠加规则', '可与商家满减叠加；同单限用 1 张平台券'],
            ['发放总量', `${w.coupon.quota} 张`],
            ['每人限领', `${w.coupon.perUser} 张`],
            ['可用时段', `${w.coupon.window}（当日）`],
            ['状态', `v${w.coupon.version} 已发布（${clockLabel(w.coupon.publishedAt ?? 630)}）`],
          ],
          note: '运营按模板填写，发布前看补贴成本预估；发布即生效、版本留痕。',
        },
        {
          kind: 'table',
          title: '营销库 · 平台券模板表',
          table: 'mkt_coupon_tpl',
          store: '营销库（建议表名，需研发确认）',
          columns: [col('tpl_id', 'varchar(32)', '模板编号'), col('name', 'varchar(64)', '名称'), col('threshold', 'int', '门槛（分）'), col('off', 'int', '面额（分）'), col('basis', 'varchar(16)', '门槛口径'), col('funder', 'varchar(16)', '成本承担'), col('quota', 'int', '总量'), col('window', 'varchar(32)', '时段'), col('status', 'varchar(16)', '状态'), col('version', 'int', '版本')],
          rows: [[w.coupon.id, w.coupon.name, w.coupon.threshold, w.coupon.off, w.coupon.basis, 'platform', w.coupon.quota, w.coupon.window, 'published', w.coupon.version]],
          note: '金额以“分”存整数，避免浮点误差。',
        },
        {
          kind: 'code',
          title: '门槛判断（伪代码）',
          code: `merchantOff = maxTier(goods)            -- 满30减3 / 满50减6 取最高档\ncouponBase  = goods - merchantOff        -- basis = afterMerchant\nusable      = couponBase >= ${w.coupon.threshold} AND now IN ${w.coupon.window} AND claimed\ncouponOff   = usable ? ${w.coupon.off} : 0`,
          note: '门槛口径是讨论点之一：按原价算对用户更友好，但平台补贴成本更高（见方案讨论页）。',
        },
      ];
    case 'menu':
      return [
        {
          kind: 'table',
          title: '商品库 · 菜品表',
          table: 'mch_dish',
          store: '商品库（建议表名）',
          columns: [col('dish_id', 'varchar(16)', '菜品编号'), col('merchant_id', 'varchar(16)', '商家'), col('name', 'varchar(64)', '名称'), col('price', 'int', '单价（分）'), col('pack_fee', 'int', '包装费（分）'), col('prep_min', 'int', '出餐时长（分钟）'), col('stock', 'int', '库存'), col('on_shelf', 'tinyint', '是否上架')],
          rows: DISHES.map((d) => [d.id, MERCHANT.id, d.name, d.price, d.pack, d.prep, d.stock, 1]),
          note: '出餐时长参与 ETA 预测：一单的出餐时间取最慢的菜。',
        },
        {
          kind: 'app',
          title: '用户端 · 店铺卡片',
          card: { device: 'user', app: '橙子到家', heading: MERCHANT.name, badge: `${MERCHANT.rating} 分`, lines: [['月售', String(MERCHANT.monthSales)], ['距离 / 时长', '3.3km · 约 30 分钟'], ['活动', '满30减3 · 满50减6 · 平台券满40减8']], foot: '营业中' },
          note: '开店后用户端可见；活动标签来自商家满减与平台券。',
        },
      ];
    case 'riderPool': {
      const pool = w.pool!;
      const f = pool.forecast;
      return [
        {
          kind: 'app',
          title: '骑手端 · 上线听单',
          card: { device: 'rider', app: '橙子骑手', heading: '已上线 · 听单中', badge: f.gap ? '冲单奖励' : undefined, lines: [['高峰窗口', f.window], ['片区预计订单', `${f.orders} 单`], ['所需骑手', `${f.need} 名（已上线 ${f.online} 名）`], ['运力缺口', f.gap ? `${f.gap} 名` : '无'], ['奖励', f.gap ? '高峰每单 +1 元' : '—']], foot: f.action },
          note: '有缺口时向附近未上线骑手推送冲单奖励；骑手自主决定是否上线。',
        },
        {
          kind: 'table',
          title: '调度服务 · 运力预测快照',
          table: 'dsp_capacity_snapshot',
          store: '调度服务（建议表名）',
          columns: [col('at', 'datetime', '预测时间'), col('area', 'varchar(16)', '片区'), col('window', 'varchar(16)', '高峰窗口'), col('orders', 'int', '预计订单'), col('per_rider', 'decimal(3,1)', '人均单量'), col('need', 'int', '所需骑手'), col('online', 'int', '已上线'), col('gap', 'int', '缺口')],
          rows: [[clockLabel(pool.at - 2), '滨湖区', f.window, f.orders, f.perRider, f.need, f.online, f.gap]],
          note: `预测参数为原型假设（雨天订单更多、人均单量更低）；当前情景：${sc.params.weather === 'rain' ? '大雨' : '晴'}。`,
        },
        {
          kind: 'table',
          title: '在线骑手缓存 · 商家附近',
          table: 'rider_online',
          store: '调度服务内存（位置每 5 秒刷新）',
          columns: [col('rider_id', 'varchar(16)', '骑手'), col('load', 'int', '手上单量'), col('rating', 'decimal(2,1)', '服务分'), col('x_m', 'int', '平面坐标 x（米，示意）'), col('y_m', 'int', '平面坐标 y（米，示意）'), col('status', 'varchar(8)', '状态')],
          rows: pool.riders.map((id) => { const r = RIDER_MAP[id]; return [`${id} ${r.short}`, r.load, r.rating, r.pos.x * 5, r.pos.y * 5, 'online']; }),
          note: '派单时从这里召回 3 公里内未满载的骑手。',
        },
      ];
    }
    case 'cart':
      return [
        {
          kind: 'app',
          title: '用户端 · 确认订单（价格试算）',
          card: {
            device: 'user',
            app: '橙子到家',
            heading: '确认订单',
            badge: sc.title,
            lines: [
              ...pr.lines.map((l) => [`${l.name} ×${l.qty}`, rmb(l.amount)] as [string, string]),
              ['包装费', rmb(pr.pack)],
              ['配送费', rmb(pr.delivery)],
              ['商家满减', pr.merchantOff ? `-${rmb(pr.merchantOff)}` : '未达门槛'],
              [w.coupon.name, pr.couponApplied ? `-${rmb(pr.couponOff)}` : '不可用'],
            ],
            foot: `实付 ${rmb(pr.payable)}${pr.couponHint ? ` · ${pr.couponHint}` : ''}`,
          },
          note: '每次加减菜、领券都会重新试算；平台券门槛按商家优惠后金额判断。',
        },
        { kind: 'json', title: '试算结果（Pricing）', value: { ...pr, explain: undefined }, note: '下单时把这份结果作为价格快照写进订单，之后不再变。' },
        { kind: 'code', title: '计算过程', code: pr.explain.join('\n'), note: '页面上的价格明细与这份计算过程同源。' },
      ];
    case 'order':
      return [
        {
          kind: 'app',
          title: '用户端 · 订单详情',
          card: { device: 'user', app: '橙子到家', heading: '订单已完成', badge: STATUS_LABEL[o.status], lines: [['订单号', o.no], ['实付', rmb(pr.payable)], ['骑手', RIDER_MAP[o.riderId!].short], ['承诺送达', clockLabel(o.promisedAt!)], ['实际送达', clockLabel(o.deliveredAt!)], ['收货地址', CUSTOMER.address]], foot: w.late ? `超时 ${w.late} 分钟 · 已赔付 3 元券` : '准时送达' },
          note: '用户端看到的是主状态的业务化文案；手机号与地址在骑手端脱敏展示。',
        },
        {
          kind: 'table',
          title: '订单库 · 订单主表',
          table: 'ord_order',
          store: '订单库（建议表名）',
          columns: [col('order_no', 'varchar(32)', '订单号'), col('status', 'varchar(16)', '主状态'), col('rider_state', 'varchar(16)', '配送子状态'), col('rider_id', 'varchar(16)', '骑手'), col('payable', 'int', '实付（分）'), col('trade_no', 'varchar(32)', '网关流水号'), col('promised_at', 'datetime', '承诺送达'), col('delivered_at', 'datetime', '送达')],
          rows: [[o.no, o.status, o.riderState, o.riderId, pr.payable, o.tradeNo ?? null, clockLabel(o.promisedAt!), clockLabel(o.deliveredAt!)]],
          note: '状态只能通过状态机迁移函数修改。',
        },
        {
          kind: 'table',
          title: '订单库 · 状态轨迹表',
          table: 'ord_trail',
          store: '订单库（建议表名）',
          columns: [col('at', 'datetime', '时间'), col('track', 'varchar(8)', '轨道'), col('action', 'varchar(24)', '动作'), col('from_state', 'varchar(16)', '从'), col('to_state', 'varchar(16)', '到'), col('actor', 'varchar(16)', '操作方'), col('note', 'varchar(128)', '说明')],
          rows: o.trail.map((t) => [clockLabel(t.at), t.track === 'order' ? '主状态' : '配送', t.label, t.track === 'order' ? (STATUS_LABEL as Record<string, string>)[t.from] ?? t.from : (RIDER_STATE_LABEL as Record<string, string>)[t.from] ?? t.from, t.track === 'order' ? (STATUS_LABEL as Record<string, string>)[t.to] ?? t.to : (RIDER_STATE_LABEL as Record<string, string>)[t.to] ?? t.to, t.by, t.note ?? null]),
          note: '每次迁移一条记录，可回放整单经过；改派会多出“改派 / 骑手接单”两条。',
        },
      ];
    case 'payment':
      return [
        { kind: 'json', title: '平台 → 网关：下单请求', value: w.payReq, note: '金额以分为单位；notify_url 为原型建议地址（.example 域名）。' },
        { kind: 'json', title: '网关 → 平台：异步回调与处理结果', value: w.callbacks.map((c) => ({ received_at: clockLabel(c.at), ...c.cb, platform_result: c.result })), note: sc.params.dupCallback ? '第 2 次回调的 trade_no 已处理过，平台直接回 ack，不重复改状态、不重复推送。' : '“回调重复”情景下这里会出现第 2 条被忽略的回调。' },
        {
          kind: 'table',
          title: '支付库 · 回调流水表（幂等）',
          table: 'pay_notify_log',
          store: '支付库（trade_no 唯一索引）',
          columns: [col('notify_id', 'varchar(32)', '通知编号'), col('trade_no', 'varchar(32)', '网关流水号（唯一）'), col('out_trade_no', 'varchar(32)', '平台订单号'), col('amount', 'int', '金额（分）'), col('result', 'varchar(16)', '处理结果'), col('received_at', 'datetime', '收到时间')],
          rows: w.callbacks.map((c) => [c.cb.notify_id, c.cb.trade_no, c.cb.out_trade_no, c.cb.total_amount, c.result.result, clockLabel(c.at)]),
          note: '先查后写 + 唯一索引兜底，并发重复回调也只会成功写入一次。',
        },
      ];
    case 'push':
      return [
        {
          kind: 'app',
          title: '商家端 · 新订单通知',
          card: { device: 'merchant', app: '橙子商家版', heading: '您有新订单 #12', badge: '语音播报', lines: pr.lines.map((l) => [l.name, `×${l.qty}`] as [string, string]), foot: '请在 3 分钟内接单' },
          note: '商家端通知会重复语音播报，直到接单；回调重复时也只推一次。',
        },
        {
          kind: 'table',
          title: '消息库 · 推送记录',
          table: 'msg_push',
          store: '消息库（建议表名）',
          columns: [col('at', 'datetime', '时间'), col('to_app', 'varchar(16)', '接收端'), col('title', 'varchar(64)', '标题'), col('body', 'varchar(256)', '内容')],
          rows: w.pushes.map((p) => [clockLabel(p.at), { user: '用户端', merchant: '商家端', rider: '骑手端' }[p.to], p.title, p.body]),
          total: w.pushes.length,
          note: '每次状态变化推送给相关的一端；文案不含完整手机号与地址。',
        },
      ];
    case 'dispatch': {
      const d = w.dispatch!;
      const best = d.candidates[0];
      return [
        {
          kind: 'trace',
          title: '派单决策过程',
          steps: [
            { tag: '召回', title: `3 公里内未满载骑手 ${d.candidates.filter((c) => !c.excluded).length} 名`, detail: d.candidates.map((c) => `${c.name} ${c.km.toFixed(1)}km/${c.load}单`).join('；') },
            { tag: '打分', title: '四个因子加权', detail: `权重：距离 ${d.weights.distance}、负载 ${d.weights.load}、顺路 ${d.weights.align}、服务分 ${d.weights.rating}` },
            ...d.candidates.slice(0, 3).map((c) => ({ tag: c.riderId === d.chosen ? '选中' : '候选', title: `${c.name} ${c.score.toFixed(2)}`, detail: `距离 ${c.parts.distance.toFixed(2)} · 负载 ${c.parts.load.toFixed(2)} · 顺路 ${c.parts.align.toFixed(2)} · 服务分 ${c.parts.rating.toFixed(2)}` })),
            { tag: 'ETA', title: `预计 ${clockLabel(d.eta.deliver)} 送达，承诺 ${clockLabel(d.promisedAt)} 前`, detail: `到店 ${clockLabel(d.eta.arrive)} · 出餐 ${clockLabel(d.eta.ready)} · 取餐 ${clockLabel(d.eta.pickup)}；配送 ${d.deliveryKm} km` },
            ...(w.reassign ? [{ tag: '改派', title: `${RIDER_MAP[w.reassign.from].short} → ${RIDER_MAP[w.reassign.to].short}`, detail: w.reassign.reason }] : []),
          ],
          verdict: `派给${best.name}：${d.reason}`,
          note: '算法为模拟实现，结果确定、可解释；正式环境的权重与召回半径需算法团队确认。',
        },
        { kind: 'json', title: '派单决策（DispatchDecision）', value: { ...d, candidates: d.candidates.map((c) => ({ ...c, parts: Object.fromEntries(Object.entries(c.parts).map(([k, v]) => [k, Math.round(v * 100) / 100])) })) }, note: '写入调度日志，便于事后复盘“为什么派给他”。' },
      ];
    }
    case 'track':
      return [
        {
          kind: 'table',
          title: '时序库 · 骑手轨迹（按分钟抽样）',
          table: 'rider_track',
          store: '时序库（保留 30 天，建议）',
          columns: [col('at', 'datetime', '时间'), col('rider_id', 'varchar(16)', '骑手'), col('x_m', 'int', '平面坐标 x（米，示意）'), col('y_m', 'int', '平面坐标 y（米，示意）'), col('speed', 'decimal(4,1)', '速度 km/h'), col('phase', 'varchar(8)', '阶段')],
          rows: w.track.map((t) => [clockLabel(t.at), `${t.riderId} ${RIDER_MAP[t.riderId].short}`, t.x, t.y, t.speed, t.phase]),
          total: w.track.length,
          note: '实际上报频率约 5 秒一次；“原地不动”超过 3 分钟触发预警（见改派情景）。',
        },
        { kind: 'json', title: '一条上报（TrackPoint）', value: w.track[Math.floor(w.track.length / 2)], note: '骑手位置属于个人敏感信息：只对本单用户、商家与平台可见，送达后停止向用户展示。' },
      ];
    case 'review':
      return [
        {
          kind: 'app',
          title: '商家端 · 新评价',
          card: { device: 'merchant', app: '橙子商家版', heading: `${'★'.repeat(w.review!.stars)}${'☆'.repeat(5 - w.review!.stars)}`, badge: `骑手 ${w.review!.riderStars} 星`, lines: [['标签', w.review!.tags.join('、')], ['内容', w.review!.text]], foot: '可回复评价' },
          note: '评价进入商家评分与骑手服务分；骑手服务分是派单打分的因子之一。',
        },
        { kind: 'json', title: '评价（Review）', value: w.review, note: '昵称脱敏后公开展示。' },
      ];
    case 'metrics': {
      const s = opsSnapshot();
      return [
        {
          kind: 'table',
          title: '实时数仓 · 片区半小时指标',
          table: 'ads_area_30min',
          store: '实时数仓（分钟级聚合）',
          columns: [col('slot', 'varchar(8)', '时段'), col('orders', 'int', '订单量'), col('late', 'int', '超时单'), col('on_time', 'varchar(8)', '准时率')],
          rows: s.hours.filter((h) => h.orders).map((h) => [h.label, h.orders, h.late, `${(100 - (h.late / h.orders) * 100).toFixed(1)}%`]),
          note: '截至 12:20 的快照；种子数据确定性生成，汇总与明细一致。',
        },
        { kind: 'json', title: '看板快照（OpsSnapshot）', value: { ...s, heat: `${s.heat.length} 个网格`, gmv: s.gmv }, note: 'GMV 以分为单位。' },
      ];
    }
    case 'recon': {
      const rc = w.recon!;
      return [
        {
          kind: 'table',
          title: '网关对账单（CSV，本商家相关）',
          table: `gateway_statement_${rc.date.replace(/-/g, '')}.csv`,
          store: '网关对账文件（每日 00:30 生成，模拟）',
          columns: [col('trade_no', 'string', '网关流水号'), col('out_trade_no', 'string', '平台订单号'), col('type', 'string', '类型'), col('amount', 'int', '金额（分）'), col('fee', 'int', '通道费（分）'), col('paid_at', 'datetime', '支付时间')],
          rows: rc.statement.slice(-8).map((l) => [l.trade_no, l.out_trade_no, l.type, l.amount, l.fee, l.paid_at]),
          total: rc.statement.length,
          note: '真实对账单是全平台的；这里只展示张记手擀面相关的行。',
        },
        {
          kind: 'code',
          title: '对账规则（伪代码）',
          code: `FOR line IN statement:                 -- 网关有\n  mine = pay_flow[line.trade_no]       -- 平台支付流水（只记处理成功的回调）\n  IF mine IS NULL      -> 长款：查单后补单或原路退款\n  ELIF mine != amount  -> 金额不符：挂账，转人工\n  ELSE                 -> 对平\nFOR flow IN pay_flow NOT IN statement -> 短款：次日再对，仍缺转人工\n-- 结果：${rc.matched} 笔对平，差异 ${rc.diffs.length} 笔${rc.dupIgnored ? `；重复回调 ${rc.dupIgnored} 次未进入流水` : ''}`,
          note: '差异订单不进入当期结算；对平才结算是资金安全的底线。',
        },
        { kind: 'json', title: '对账结果（ReconResult）', value: { ...rc, statement: `${rc.statement.length} 行（见上表）` }, note: '金额以分为单位。' },
      ];
    }
    case 'payout': {
      const po = w.payout!;
      const m = po.items[0];
      return [
        {
          kind: 'table',
          title: '资金库 · 打款批次明细',
          table: 'fin_payout',
          store: '资金库（建议表名）',
          columns: [col('batch_no', 'varchar(32)', '批次号'), col('payee', 'varchar(64)', '收款方'), col('kind', 'varchar(8)', '类型'), col('account', 'varchar(32)', '账户（脱敏）'), col('orders', 'int', '单数'), col('amount', 'int', '金额（分）'), col('status', 'varchar(16)', '状态')],
          rows: po.items.map((i) => [po.batchNo, i.payee, i.kind, i.account, i.orders, i.amount, po.status]),
          note: '商家按天合并打款；骑手收入打到骑手钱包，可随时提现。',
        },
        { kind: 'json', title: '平台 → 网关：代付请求与回执（模拟）', value: { request: { batch_no: po.batchNo, count: po.items.length, total_amount: po.total, items: po.items.map((i) => ({ payee: i.payee, account: i.account, amount: i.amount })) }, receipt: { batch_no: po.batchNo, status: po.status, finished_at: clockLabel(po.at + 0.5) } }, note: '代付失败的明细自动重试 3 次，仍失败转人工（原型不演示）。' },
        {
          kind: 'app',
          title: '商家端 · 到账通知',
          card: { device: 'merchant', app: '橙子商家版', heading: `到账 ${rmb(m.amount)}`, badge: '结算款', lines: [['结算日期', '2026-10-18'], ['订单数', `${m.orders} 单`], ['收款账户', m.account], ['到账时间', clockLabel(po.at + 0.5)]], foot: '明细见结算单与对账文件' },
          note: '骑手端同时收到“配送收入已到账”。',
        },
      ];
    }
    case 'offset': {
      const of = w.offset!;
      return [
        {
          kind: 'table',
          title: '结算库 · 冲减明细表',
          table: 'stl_adjust',
          store: '结算库（建议表名）',
          columns: [col('cycle', 'date', '计入周期'), col('order_no', 'varchar(32)', '原订单号'), col('refund_no', 'varchar(32)', '网关退款流水号'), col('refund', 'int', '退款（分）'), col('merchant_adj', 'int', '商家冲减（分）'), col('platform_adj', 'int', '平台承担（分）'), col('created_at', 'datetime', '生成时间')],
          rows: [[of.cycle, of.orderNo, of.refundNo, of.refund, of.merchantAdj, of.platformAdj, clockLabel(of.at)]],
          note: '冲减不改上一期已打款的结算单，而是计入本期，账期清楚、可追溯。',
        },
        {
          kind: 'app',
          title: '商家端 · 本期结算单（冲减行）',
          card: { device: 'merchant', app: '橙子商家版', heading: `冲减 ${rmb(-of.merchantAdj)}`, badge: '售后', lines: [['原订单', of.orderNo], ['原因', '部分退款：卤蛋漏送'], ['退给用户', rmb(of.refund)], ['商家承担', rmb(-of.merchantAdj)], ['平台承担', rmb(-of.platformAdj)]], foot: `计入 ${of.cycle} 结算周期` },
          note: '商家冲减 = 退款商品净额 − 退回的佣金（见 B-07）。',
        },
      ];
    }
    case 'settlement': {
      const st = w.settle!;
      return [
        { kind: 'sheet', title: '结算对账文件（Excel）', fileName: settleFileName(), sheet: settlementSheet(st.batch, st.line.orderNo), naming: '结算对账_商家编号_日期.xlsx', note: '与结算中心页面预览、下载文件是同一份版式模型；黄色行为演示订单。' },
        {
          kind: 'table',
          title: '结算库 · 结算明细表',
          table: 'stl_bill',
          store: '结算库（建议表名）',
          columns: [col('order_no', 'varchar(32)', '订单号'), col('payable', 'int', '实付'), col('commission', 'int', '佣金'), col('merchant_net', 'int', '商家应得'), col('rider_income', 'int', '骑手收入'), col('channel_fee', 'int', '通道费'), col('platform_net', 'int', '平台净收入')],
          rows: st.batch.slice(-6).map((l) => [l.orderNo, l.payable, l.commission, l.merchantNet, l.rider.total, l.channelFee, l.platformNet]),
          total: st.batch.length,
          note: '金额单位为分；每行满足 商家 + 骑手 + 通道费 + 平台 = 实付。',
        },
      ];
    }
    case 'refund': {
      const r = w.refund!;
      return [
        {
          kind: 'app',
          title: '用户端 · 退款进度',
          card: { device: 'user', app: '橙子到家', heading: `可退 ${rmb(r.calc.refund)}`, badge: '部分退款', lines: [['退款商品', '卤蛋 ×1'], ['原因', r.reason], ['已申请', clockLabel(r.appliedAt)], ['商家同意', clockLabel(r.approvedAt!)], ['退款成功', clockLabel(r.doneAt!)]], foot: '原路退回' },
          note: '退款金额已按比例扣除优惠；包装费、配送费不退。',
        },
        { kind: 'code', title: '退款分摊计算', code: r.calc.explain.join('\n'), note: '已结算订单在下一结算周期冲减（商家 / 平台各自承担的部分见最后两行）。' },
        { kind: 'json', title: '退款请求与网关回调', value: { request: r.req, callback: r.cb }, note: 'out_refund_no 为幂等键，重复提交不会重复退款。' },
      ];
    }
  }
}
