/**
 * 端到端业务流程（DAG）——4D 的“流程”与“时间”维度：一单外卖从开店准备到次日结算与售后。
 * 环节之间按真实依赖（数据传递或时序）连接：商家一支（接单 → 备餐出餐）与调度一支（运力 → 派单 → 骑手到店）并行，
 * 在“取餐配送”汇合；资金一支（渠道对账 → 结算 → 打款）只依赖支付流水与已完成订单，售后退款在下一周期冲减时与结算汇合。
 * 单一事实来源：导航、依赖图、泳道、“流程 · 数据”窗口、总览页、文档都从这里读；flow.test.ts 守住一致性。
 */
import type { RoleKey } from '@/state/session';
import type { ActorKey } from './actors';
import type { DataKey } from './dataObjects';

export type PhaseKey = 'prep' | 'order' | 'fulfil' | 'after' | 'settle';

export interface Phase {
  key: PhaseKey;
  title: string;
  when: string;
  desc: string;
}

export const PHASES: Phase[] = [
  { key: 'prep', title: '开店准备', when: '10:30–10:50', desc: '运营发布午市平台券；商家上架菜品、开店营业；调度预测午高峰运力，骑手上线听单。' },
  { key: 'order', title: '下单与支付', when: '11:51–11:52', desc: '用户加购、领券，平台实时试算价格；收银台调起支付网关，回调验签与幂等处理后订单变为已支付。' },
  { key: 'fulfil', title: '接单、调度与配送', when: '11:53–12:21', desc: '商家接单、备餐出餐的同时，智能调度为订单选骑手、骑手前往商家；两支在取餐时汇合，配送送达，三端实时同步。' },
  { key: 'after', title: '收货、评价与运营', when: '12:22 起', desc: '用户确认收货并评价；运营在实时看板上看准时率与超时预警。' },
  { key: 'settle', title: '对账、结算与售后', when: '次日起', desc: '次日 01:00 渠道对账、02:00 结算分账、08:00 打款到账；售后部分退款在下一结算周期冲减。' },
];

/** 触发方式（展示文案）：人工触发 | 自动衔接 | 定时调度 | 外部提交 */
export type Trigger = '人工触发' | '自动衔接' | '定时调度' | '外部提交';

export interface SubStep {
  title: string;
  actor: ActorKey;
  /** 这一子步骤正在产生或使用的数据对象（“流程 · 数据”窗口据此展示格式样例） */
  data: DataKey;
  /** 页面中对应区域的 data-flow-anchor：演示时自动定位并高亮 */
  anchor?: string;
  /** 由导演按时间推进（walk 型）时，该子步骤的停留时长（毫秒，虚拟时间） */
  ms?: number;
}

/** 环节在需求中的地位：required = 需求明确要求；optional = 原型补充、可选（去掉不影响主流程）。未标注 = 需求范围内的常规环节。 */
export type Necessity = 'required' | 'optional';

export const NECESSITY_LABEL: Record<Necessity, string> = { required: '需求必需', optional: '原型补充 · 可选' };

export type StepId = 'coupon' | 'menu' | 'shift' | 'order' | 'pay' | 'accept' | 'dispatch' | 'arrive' | 'cook' | 'deliver' | 'confirm' | 'ops' | 'reconcile' | 'settle' | 'payout' | 'refund' | 'offset';

export interface FlowStep {
  id: StepId;
  phase: PhaseKey;
  title: string;
  /** 泳道 / 节点上的短标题 */
  short: string;
  actor: ActorKey;
  with: ActorKey[];
  /** 演示时切换到的角色 */
  role: RoleKey;
  route: string;
  when: string;
  trigger: Trigger;
  narration: string;
  /** 平台服务 / 调度算法 / 外部系统在这一环做什么 */
  machine?: string;
  /** 人在哪里把关 */
  human?: string;
  inputs: DataKey[];
  outputs: DataKey[];
  subs: SubStep[];
  drive: 'page' | 'walk';
  chain?: boolean;
  necessity?: Necessity;
  basis?: string;
}

export const STEPS: FlowStep[] = [
  {
    id: 'coupon',
    phase: 'prep',
    title: '运营配置并发布午市平台券',
    short: '发布午市券',
    actor: 'ops',
    with: [],
    role: 'ops',
    route: '/ops?tab=coupon',
    when: '10:30',
    trigger: '人工触发',
    narration: '城市运营陈楠在营销后台套用“午市满 40 减 8”模板：门槛按商家优惠后金额计算、平台承担、限量 5000 张、11:00–14:00 可用；看过补贴成本预估后发布。',
    human: '发布前核对门槛口径与补贴预算；发布即生效，版本留痕。',
    inputs: [],
    outputs: ['couponTpl'],
    subs: [
      { title: '套用模板并核对规则', actor: 'ops', data: 'couponTpl', anchor: 'coupon-form' },
      { title: '查看成本预估并发布', actor: 'ops', data: 'couponTpl', anchor: 'coupon-preview' },
    ],
    drive: 'page',
  },
  {
    id: 'menu',
    phase: 'prep',
    title: '商家上架菜品、设置库存与出餐时长，开店营业',
    short: '上架开店',
    actor: 'merchant',
    with: [],
    role: 'merchant',
    route: '/live',
    when: '10:45',
    trigger: '人工触发',
    narration: '张老板在商家版 App 上架今天的 5 个菜品，确认库存与出餐时长（牛肉面 12 分钟），打开“营业中”开关。',
    human: '商家对菜品、价格、库存与出餐时长负责。',
    inputs: [],
    outputs: ['menu'],
    subs: [
      { title: '核对菜品与库存', actor: 'merchant', data: 'menu', anchor: 'phone-merchant' },
      { title: '开店营业', actor: 'merchant', data: 'menu', anchor: 'phone-merchant' },
    ],
    drive: 'page',
  },
  {
    id: 'shift',
    phase: 'prep',
    title: '调度预测午高峰运力，骑手上线听单',
    short: '骑手上线',
    actor: 'dispatch',
    with: ['rider'],
    role: 'rider',
    route: '/live',
    when: '10:50',
    trigger: '定时调度',
    narration: '午高峰前，智能调度按天气与历史同期预测滨湖区 11:30–13:00 的订单量与所需骑手数，有缺口时向附近未上线的骑手推送冲单奖励。阿强等商家附近的 4 名骑手上线听单，组成这一单的候选运力池。',
    machine: '片区订单量与运力预测、缺口测算、冲单奖励推送；维护在线骑手池（位置、负载、服务分）。',
    human: '骑手自主决定是否上线；运营可调整奖励力度。',
    inputs: [],
    outputs: ['riderPool'],
    subs: [
      { title: '预测午高峰订单量与运力缺口', actor: 'dispatch', data: 'riderPool', anchor: 'dispatch-panel' },
      { title: '骑手上线听单', actor: 'rider', data: 'riderPool', anchor: 'phone-rider' },
      { title: '运力池就绪：地图上的在线骑手', actor: 'dispatch', data: 'riderPool', anchor: 'live-map' },
    ],
    drive: 'page',
  },
  {
    id: 'order',
    phase: 'order',
    title: '用户浏览、加购、领券，平台试算价格后提交订单',
    short: '加购下单',
    actor: 'user',
    with: ['platform'],
    role: 'user',
    route: '/live',
    when: '11:51',
    trigger: '人工触发',
    narration: '小林打开 App 进入张记手擀面，加购两碗面和两个卤蛋，领取午市券；平台实时试算：商家满 50 减 6，平台券按优惠后 50 元判断门槛，可用，实付 49 元。',
    machine: '价格试算：商家满减取最高档、平台券门槛口径与叠加规则、配送费（3.3 公里 + 天气）。',
    inputs: ['couponTpl', 'menu'],
    outputs: ['cart', 'order'],
    subs: [
      { title: '进店加购', actor: 'user', data: 'menu', anchor: 'phone-user' },
      { title: '领券并试算价格', actor: 'platform', data: 'cart', anchor: 'phone-user' },
      { title: '提交订单', actor: 'user', data: 'order', anchor: 'phone-user' },
    ],
    drive: 'page',
  },
  {
    id: 'pay',
    phase: 'order',
    title: '收银台支付，网关回调验签并幂等处理',
    short: '支付回调',
    actor: 'user',
    with: ['gateway', 'platform'],
    role: 'user',
    route: '/live',
    when: '11:52',
    trigger: '自动衔接',
    narration: '收银台调起支付网关（模拟环境），小林确认支付；网关异步回调平台，平台验签、核对金额、按 trade_no 幂等处理后，订单变为“已支付”，并推送给商家、提交调度。',
    machine: '网关下单与回调；验签、金额校验、trade_no 幂等；推送商家新订单；提交调度。',
    inputs: ['order'],
    outputs: ['payment', 'order', 'push'],
    subs: [
      { title: '确认支付', actor: 'user', data: 'payment', anchor: 'phone-user' },
      { title: '网关回调与验签', actor: 'gateway', data: 'payment', anchor: 'event-log' },
      { title: '订单已支付，推送商家', actor: 'platform', data: 'push', anchor: 'state-strip' },
    ],
    drive: 'page',
    chain: true,
  },
  {
    id: 'accept',
    phase: 'fulfil',
    title: '商家收到新订单提醒，接单并开始备餐',
    short: '商家接单',
    actor: 'merchant',
    with: ['platform'],
    role: 'merchant',
    route: '/live',
    when: '11:53',
    trigger: '人工触发',
    narration: '商家版 App 语音播报“您有新订单”，张老板接单；系统按最慢的菜（牛肉面 12 分钟）给出预计出餐时间 12:05，打印小票，后厨开始备餐。',
    human: '商家可拒单（需填原因，全额退款）；原型演示接单。',
    inputs: ['order', 'push'],
    outputs: ['order'],
    subs: [
      { title: '新订单语音提醒', actor: 'platform', data: 'push', anchor: 'phone-merchant' },
      { title: '接单，给出预计出餐时间', actor: 'merchant', data: 'order', anchor: 'phone-merchant' },
    ],
    drive: 'page',
  },
  {
    id: 'dispatch',
    phase: 'fulfil',
    title: '智能调度召回骑手、打分派单，骑手接单',
    short: '智能派单',
    actor: 'dispatch',
    with: ['rider'],
    role: 'rider',
    route: '/live',
    when: '11:53',
    trigger: '自动衔接',
    narration: '与商家备餐同时进行：调度从在线运力池召回 4 名骑手，按距离、负载、顺路度、服务分打分。老马离商家最近，但手上已有 3 单且方向相反；阿强手上 1 单正好顺路，得分最高。阿强接单，承诺 12:25 前送达。',
    machine: '候选召回、多因子打分、ETA 预测（到店、出餐、取餐、送达），给出可解释的选择理由。',
    human: '骑手可拒单（原型中顺延给下一名）；运营可人工改派。',
    inputs: ['order', 'riderPool'],
    outputs: ['dispatch'],
    subs: [
      { title: '召回候选骑手', actor: 'dispatch', data: 'dispatch', anchor: 'live-map' },
      { title: '打分与 ETA', actor: 'dispatch', data: 'dispatch', anchor: 'dispatch-panel' },
      { title: '骑手接单', actor: 'rider', data: 'dispatch', anchor: 'phone-rider' },
    ],
    drive: 'page',
  },
  {
    id: 'arrive',
    phase: 'fulfil',
    title: '骑手前往商家，平台监控轨迹，异常时预警改派',
    short: '骑手到店',
    actor: 'rider',
    with: ['dispatch'],
    role: 'rider',
    route: '/live',
    when: '12:02',
    trigger: '人工触发',
    narration: '阿强接单后骑行前往张记手擀面，位置每 5 秒上报一次；平台持续比对轨迹与预计到店时间，骑手原地不动超过 3 分钟即预警，并排除故障骑手重新打分改派（见“骑手故障”情景）。阿强 12:02 到店，面还差 3 分钟。',
    machine: '轨迹上报与地图展示；原地不动 3 分钟预警；排除故障骑手后重新打分改派。',
    human: '骑手确认到店；运营可人工改派。',
    inputs: ['dispatch'],
    outputs: ['track', 'order'],
    subs: [
      { title: '骑行前往商家（实时轨迹）', actor: 'rider', data: 'track', anchor: 'live-map' },
      { title: '轨迹监控：原地不动 3 分钟即预警改派', actor: 'dispatch', data: 'track', anchor: 'dispatch-panel' },
      { title: '到店，等待出餐', actor: 'rider', data: 'order', anchor: 'phone-rider' },
    ],
    drive: 'page',
  },
  {
    id: 'cook',
    phase: 'fulfil',
    title: '商家备餐出餐，出餐进度同步给骑手与用户',
    short: '备餐出餐',
    actor: 'merchant',
    with: ['platform'],
    role: 'merchant',
    route: '/live',
    when: '12:05',
    trigger: '人工触发',
    narration: '后厨按最慢的菜（牛肉面 12 分钟）备餐，商家版显示出餐倒计时；骑手到店等餐超过 10 分钟时，平台向商家发催单提醒、给骑手记等餐补贴（见“出餐慢”情景）。12:05 张老板点“出餐”，骑手端收到“商家已出餐”。',
    machine: '出餐倒计时、等餐时长监控与催单提醒、出餐推送。',
    human: '商家点“出餐完成”。',
    inputs: ['order'],
    outputs: ['order', 'push'],
    subs: [
      { title: '后厨备餐（按最慢的菜计时）', actor: 'merchant', data: 'order', anchor: 'phone-merchant' },
      { title: '等餐监控：超过 10 分钟催单', actor: 'platform', data: 'push', anchor: 'event-log' },
      { title: '出餐完成，通知骑手', actor: 'merchant', data: 'order', anchor: 'phone-merchant' },
    ],
    drive: 'page',
  },
  {
    id: 'deliver',
    phase: 'fulfil',
    title: '骑手扫码取餐、配送送达，用户实时看到位置与进度',
    short: '取餐配送',
    actor: 'rider',
    with: ['platform'],
    role: 'rider',
    route: '/live',
    when: '12:20',
    trigger: '人工触发',
    narration: '出餐与骑手到店两支在这里汇合：阿强 12:05:30 扫码取餐，沿梧桐路—枫林街—云杉大道配送 3.3 公里，用户端实时看到骑手位置与预计送达时间；12:20 送达，晚于承诺时间则自动发赔付券。',
    machine: '轨迹上报与地图展示、送达判定、超时赔付。',
    human: '骑手扫码取餐、确认送达。',
    inputs: ['order', 'track'],
    outputs: ['track', 'order'],
    subs: [
      { title: '扫码取餐', actor: 'rider', data: 'order', anchor: 'phone-rider' },
      { title: '配送中 · 实时轨迹', actor: 'rider', data: 'track', anchor: 'live-map' },
      { title: '确认送达', actor: 'rider', data: 'order', anchor: 'phone-rider' },
    ],
    drive: 'page',
  },
  {
    id: 'confirm',
    phase: 'after',
    title: '用户确认收货，评价商家与骑手',
    short: '收货评价',
    actor: 'user',
    with: [],
    role: 'user',
    route: '/live',
    when: '12:22',
    trigger: '人工触发',
    narration: '小林收到“已送达”推送，确认收货，给商家和骑手各打 5 星，选了“面很筋道”“送餐快”。',
    inputs: ['order'],
    outputs: ['order', 'review'],
    subs: [
      { title: '确认收货', actor: 'user', data: 'order', anchor: 'phone-user' },
      { title: '评价商家与骑手', actor: 'user', data: 'review', anchor: 'phone-user' },
    ],
    drive: 'page',
  },
  {
    id: 'ops',
    phase: 'after',
    title: '运营查看实时看板：订单量、准时率、热力与超时预警',
    short: '运营看板',
    actor: 'ops',
    with: ['platform'],
    role: 'ops',
    route: '/ops?tab=dashboard',
    when: '12:25',
    trigger: '人工触发',
    narration: '陈楠在实时看板上看滨湖区午高峰：订单量、准时率、平均送达时长、需求热力，以及等餐超时、骑手异常等预警；这一单约 29 分钟送达，计入准时。',
    human: '运营处理超时预警：催商家、提醒用户、人工改派。',
    inputs: ['track', 'review'],
    outputs: ['metrics'],
    subs: [
      { title: '查看实时指标', actor: 'ops', data: 'metrics', anchor: 'ops-kpi', ms: 2600 },
      { title: '需求热力与超时预警', actor: 'ops', data: 'metrics', anchor: 'ops-heat', ms: 2800 },
    ],
    drive: 'walk',
  },
  {
    id: 'reconcile',
    phase: 'settle',
    title: '次日 01:00 渠道对账：网关对账单与平台支付流水逐笔核对',
    short: '渠道对账',
    actor: 'scheduler',
    with: ['gateway'],
    role: 'ops',
    route: '/settle',
    when: '次日 01:00',
    trigger: '定时调度',
    narration: '凌晨定时任务下载支付网关前一天的对账单，按 trade_no 与平台支付流水逐笔核对：张记手擀面相关 24 笔全部对平。“支付回调重复”情景里的第 2 次回调已被幂等忽略、没有进入流水，所以不会多出一笔。差异订单（长款、短款、金额不符）挂账转人工，不进入当期结算。',
    machine: '下载对账单、逐笔匹配、差异分类与挂账。',
    human: '财务处理差异挂账（原型中无差异）。',
    inputs: ['payment'],
    outputs: ['recon'],
    subs: [
      { title: '下载网关对账单', actor: 'gateway', data: 'recon', anchor: 'settle-recon', ms: 2200 },
      { title: '与平台支付流水逐笔核对', actor: 'scheduler', data: 'payment', anchor: 'settle-recon', ms: 2600 },
      { title: '全部对平，差异挂账', actor: 'scheduler', data: 'recon', anchor: 'settle-recon', ms: 2200 },
    ],
    drive: 'walk',
  },
  {
    id: 'settle',
    phase: 'settle',
    title: '次日 02:00 定时结算分账，生成结算单与对账文件',
    short: 'T+1 结算',
    actor: 'scheduler',
    with: ['platform'],
    role: 'ops',
    route: '/settle',
    when: '次日 02:00',
    trigger: '定时调度',
    narration: '渠道对账之后，定时任务汇总张记手擀面前一天已对平的 24 笔已完成订单，逐笔拆分商家应得、骑手收入、平台佣金、支付通道费与平台净收入，勾稽全部平衡后生成结算单与对账 Excel。',
    machine: '汇总、分账计算、逐笔勾稽、生成对账文件；勾稽不平的订单转人工。',
    inputs: ['order', 'recon'],
    outputs: ['settlement'],
    subs: [
      { title: '汇总已对平的已完成订单', actor: 'scheduler', data: 'order', anchor: 'settle-run', ms: 2400 },
      { title: '逐笔分账与勾稽', actor: 'scheduler', data: 'settlement', anchor: 'settle-split', ms: 2800 },
      { title: '生成结算单与对账文件', actor: 'scheduler', data: 'settlement', anchor: 'settle-file', ms: 2600 },
    ],
    drive: 'walk',
    necessity: 'required',
    basis: '需求 §5 要求按 T+1 与商家、骑手结算并提供对账文件；要等售后窗口与支付到账，只能次日执行。',
  },
  {
    id: 'payout',
    phase: 'settle',
    title: '次日 08:00 打款：商家结算款与骑手收入到账',
    short: '打款到账',
    actor: 'platform',
    with: ['gateway', 'merchant', 'rider'],
    role: 'ops',
    route: '/settle',
    when: '次日 08:00',
    trigger: '定时调度',
    narration: '结算单确认后生成打款批次：张记手擀面 24 单的商家应得打到对公账户，骑手收入打到骑手钱包；网关代付回执成功后，商家与骑手各收到一条到账通知。',
    machine: '生成打款批次、网关代付、回执入账与到账通知。',
    human: '财务复核打款批次（大额双人复核，原型略）。',
    inputs: ['settlement'],
    outputs: ['payout', 'push'],
    subs: [
      { title: '生成打款批次（商家 + 骑手）', actor: 'platform', data: 'payout', anchor: 'settle-payout', ms: 2400 },
      { title: '网关代付并回执', actor: 'gateway', data: 'payout', anchor: 'settle-payout', ms: 2400 },
      { title: '商家与骑手收到到账通知', actor: 'merchant', data: 'push', anchor: 'settle-payout', ms: 2400 },
    ],
    drive: 'walk',
  },
  {
    id: 'refund',
    phase: 'settle',
    title: '售后：卤蛋漏送，部分退款并在下一结算周期冲减',
    short: '部分退款',
    actor: 'user',
    with: ['merchant', 'gateway', 'platform'],
    role: 'user',
    route: '/live',
    when: '次日 09:30',
    trigger: '人工触发',
    narration: '小林发现少了 1 个卤蛋，申请部分退款；平台按商品原价占比分摊这单的优惠，可退 2.25 元。张老板同意后网关原路退回；这单已经结算打款，冲减留到下一结算周期执行。',
    machine: '退款金额分摊、网关原路退款与回调、结算冲减。',
    human: '商家同意或拒绝（拒绝可申请平台介入）。',
    inputs: ['order'],
    outputs: ['refund'],
    subs: [
      { title: '申请部分退款', actor: 'user', data: 'refund', anchor: 'phone-user' },
      { title: '商家同意', actor: 'merchant', data: 'refund', anchor: 'phone-merchant' },
      { title: '网关原路退款', actor: 'gateway', data: 'refund', anchor: 'event-log' },
    ],
    drive: 'page',
    necessity: 'optional',
    basis: '原型补充：需求没有写售后流程；为讨论“部分退款怎么分摊优惠、已结算订单怎么冲减”而加，去掉不影响下单到结算的主流程。',
  },
  {
    id: 'offset',
    phase: 'settle',
    title: '下一结算周期冲减：退款从商家本期结算款中扣减',
    short: '下期冲减',
    actor: 'scheduler',
    with: ['merchant', 'platform'],
    role: 'ops',
    route: '/settle',
    when: '后天 02:00',
    trigger: '定时调度',
    narration: '这单的 10-18 结算已经打款，次日的部分退款不能再改上一期的账：后天 02:00 结算 10-19 的订单时，系统把这笔退款写成冲减明细，商家冲减 2.20 元、平台承担 0.05 元，从张记手擀面本期结算款中扣减，并通知商家。',
    machine: '汇总上一周期已结算订单的退款，生成冲减明细并计入本期结算。',
    human: '商家可在结算单中查看冲减明细。',
    inputs: ['refund', 'settlement'],
    outputs: ['offset'],
    subs: [
      { title: '汇总已结算订单的退款', actor: 'scheduler', data: 'refund', anchor: 'settle-offset', ms: 2200 },
      { title: '生成冲减明细（商家 / 平台）', actor: 'scheduler', data: 'offset', anchor: 'settle-offset', ms: 2400 },
      { title: '从本期结算款中扣减，通知商家', actor: 'scheduler', data: 'offset', anchor: 'settle-offset', ms: 2200 },
    ],
    drive: 'walk',
    necessity: 'optional',
    basis: '原型补充：依赖可选的售后退款；去掉售后，这一步也随之消失，不影响下单到结算打款的主流程。',
  },
];

export interface Edge {
  from: StepId;
  to: StepId;
  data?: DataKey;
  label: string;
}

export const EDGES: Edge[] = [
  { from: 'coupon', to: 'order', data: 'couponTpl', label: '平台券 v1' },
  { from: 'menu', to: 'order', data: 'menu', label: '菜单与库存' },
  { from: 'shift', to: 'dispatch', data: 'riderPool', label: '在线运力池' },
  { from: 'order', to: 'pay', data: 'order', label: '订单（待支付）' },
  { from: 'pay', to: 'accept', data: 'order', label: '订单（已支付）' },
  { from: 'pay', to: 'dispatch', data: 'order', label: '派单请求' },
  { from: 'pay', to: 'reconcile', data: 'payment', label: '支付流水' },
  { from: 'accept', to: 'cook', data: 'order', label: '备餐中' },
  { from: 'dispatch', to: 'arrive', data: 'dispatch', label: '派单决策' },
  { from: 'cook', to: 'deliver', data: 'order', label: '已出餐' },
  { from: 'arrive', to: 'deliver', data: 'track', label: '骑手已到店' },
  { from: 'deliver', to: 'confirm', data: 'order', label: '已送达' },
  { from: 'deliver', to: 'ops', data: 'track', label: '轨迹与时长' },
  { from: 'confirm', to: 'ops', data: 'review', label: '评价' },
  { from: 'confirm', to: 'settle', data: 'order', label: '已完成订单（T+1）' },
  { from: 'reconcile', to: 'settle', data: 'recon', label: '已对平' },
  { from: 'confirm', to: 'refund', data: 'order', label: '已完成订单' },
  { from: 'settle', to: 'payout', data: 'settlement', label: '结算单' },
  { from: 'settle', to: 'offset', data: 'settlement', label: '已结算' },
  { from: 'refund', to: 'offset', data: 'refund', label: '退款单' },
];

/**
 * 依赖图布局：行 = 业务分支，列 = 依赖深度（col 必须大于全部上游的 col）。
 * “渠道对账”只依赖支付流水，放在它真实的依赖深度（第 4 层）、独占“资金 · 结算”一行：钱这一支从支付起就与履约无关，
 * 虽然它在次日 01:00 才执行（节点上标着时点；一键运行按 STEPS 的业务时间顺序走）。
 */
export const DAG_POS: Record<StepId, { col: number; row: number }> = {
  coupon: { col: 0, row: 0 },
  menu: { col: 0, row: 1 },
  shift: { col: 0, row: 2 },
  order: { col: 1, row: 0.5 },
  pay: { col: 2, row: 0.5 },
  accept: { col: 3, row: 1 },
  dispatch: { col: 3, row: 2 },
  cook: { col: 4, row: 1 },
  arrive: { col: 4, row: 2 },
  deliver: { col: 5, row: 1.5 },
  confirm: { col: 6, row: 1 },
  reconcile: { col: 3, row: 3 },
  ops: { col: 7, row: 0 },
  refund: { col: 7, row: 1.25 },
  settle: { col: 7, row: 2.5 },
  offset: { col: 8, row: 1.9 },
  payout: { col: 8, row: 3 },
};

export const DAG_ROWS: { row: number; label: string; desc: string }[] = [
  { row: 0, label: '营销 · 运营', desc: '运营 → 用户' },
  { row: 1, label: '交易 · 商家', desc: '用户 → 商家' },
  { row: 2, label: '调度 · 骑手', desc: '调度 → 骑手' },
  { row: 3, label: '资金 · 结算', desc: '对账 → 打款' },
];

export const DAG_COLS = 9;
/** 最大行号（布局高度用） */
export const DAG_MAX_ROW = 3;
/** 汇合区从第几列开始，及其标题（送达后各分支汇合） */
export const DAG_MERGE_COL = 6;
export const DAG_MERGE_LABEL = '送达之后（各分支在此汇合）';

const DEFAULT_TAB: Record<string, string> = { '/ops': 'dashboard' };

export function depsOf(id: StepId): StepId[] {
  return EDGES.filter((e) => e.to === id).map((e) => e.from);
}

export function succOf(id: StepId): StepId[] {
  return EDGES.filter((e) => e.from === id).map((e) => e.to);
}

export function ancestorsOf(id: StepId): Set<StepId> {
  const out = new Set<StepId>();
  const walk = (x: StepId) =>
    depsOf(x).forEach((d) => {
      if (!out.has(d)) {
        out.add(d);
        walk(d);
      }
    });
  walk(id);
  return out;
}

export function readySteps(done: Iterable<StepId>): StepId[] {
  const set = new Set(done);
  return STEPS.filter((s) => !set.has(s.id) && depsOf(s.id).every((d) => set.has(d))).map((s) => s.id);
}

/**
 * 可执行环节的优先顺序：按 STEPS 顺序（STEPS 按业务时间写成一种拓扑序），可选环节最后。
 * 不再“先沿刚完成环节的下游继续”：并行分支各有多步时（接单 → 备餐出餐 ∥ 派单 → 骑手到店），那样会先演示 12:05 出餐、再回头演示 11:53 派单。
 */
export function orderReady(done: Iterable<StepId>): StepId[] {
  const ready = readySteps(done);
  const optional = (id: StepId) => stepById(id).necessity === 'optional';
  return [...ready.filter((id) => !optional(id)), ...ready.filter(optional)];
}

export function levelOf(id: StepId): number {
  const d = depsOf(id);
  return d.length ? 1 + Math.max(...d.map(levelOf)) : 0;
}

export const STEP_INDEX: Record<StepId, number> = Object.fromEntries(STEPS.map((s, i) => [s.id, i])) as Record<StepId, number>;

export function stepById(id: StepId): FlowStep {
  return STEPS[STEP_INDEX[id]];
}

export function pathOf(route: string) {
  return route.split('?')[0] || '/';
}

export function tabOf(route: string) {
  return new URLSearchParams(route.split('?')[1] ?? '').get('tab');
}

export function stepsForRoute(path: string, tab: string | null): { step: FlowStep; exact: boolean }[] {
  const cur = tab ?? DEFAULT_TAB[path] ?? null;
  return STEPS.filter((s) => pathOf(s.route) === path).map((s) => {
    const t = tabOf(s.route);
    return { step: s, exact: !t || t === cur };
  });
}
