/**
 * 端到端业务流程（DAG）：环节之间按真实依赖（数据传递或时序）连接，没有依赖关系的分支可以并行。
 * 四行业务分支：规则库（集团 → 区域 → 误报回流调优）、界面上传（核查岗 → 后台 → 复核岗 → 整改）、接口上传（RPA → 回写协同平台）、
 * 主数据与治理（组织同步 → 夜间跑批）；组织主数据同时喂给规则维护、两种上传的核查，各分支在区域查看与驾驶舱汇合。
 * 每个环节写明：谁在做（操作方）、什么时候（时点/触发方式）、在哪个页面、输入输出什么数据、智能体做什么、人工在哪里把关。
 * “一键运行完整流程”由 director 按依赖调度：上游全部完成的环节才可执行，多个可执行时按 STEPS 顺序（按业务时间写成的一种拓扑序）优先。
 */
import type { RoleKey } from '@/domain/orgs';
import type { ActorKey } from './actors';
import type { DataKey } from './dataObjects';

export type PhaseKey = 'rules' | 'check' | 'review' | 'govern';

export interface Phase {
  key: PhaseKey;
  title: string;
  when: string;
  desc: string;
}

export const PHASES: Phase[] = [
  { key: 'rules', title: '主数据与规则库', when: '每日 07:00 / 政策更新时', desc: '每日从统一认证与人力系统同步组织与人员（决定谁用哪个规则库、能看哪些结果）；集团用 AI 解读制度文件生成初始规则；各区域用自然语言维护本区域规则库。' },
  { key: 'check', title: '上传与核查：两种上传，一条流程', when: '日间（10:30 RPA / 14:00 界面上传）', desc: '核查数据全部来自上传：RPA 调接口上传供应商的待付款申请，核查完把结果回写协同平台（有疑点的挂起）；核查岗在界面上传 ERP 三类单据；后台按工号匹配区域规则库核查，自动导出并保存结果。' },
  { key: 'review', title: '复核与整改', when: '核查完成后', desc: '子公司复核岗在线查看结果（国别为一个大类）并确认疑点；核查岗按确认的疑点在 ERP 整改并登记；区域查看辖内全部结果。' },
  { key: 'govern', title: '汇总与治理', when: '日常 / 次日', desc: '驾驶舱按区域 / 集团分层聚合（含整改与挂起闭环）；夜间跑批预热语义缓存；误报判例回流为规则调优建议。' },
];

export type Trigger = '人工触发' | '自动衔接' | '定时调度' | '外部提交';

export interface SubStep {
  title: string;
  actor: ActorKey;
  /** 这一子步骤正在产生或使用的数据对象（浮动窗口据此展示文件 / 库表格式） */
  data: DataKey;
  /** 页面中对应区域的 data-flow-anchor，演示时自动定位并高亮 */
  anchor?: string;
  /** 由导演按时间推进时，该子步骤的停留时长（毫秒） */
  ms?: number;
}

/**
 * 环节在需求中的地位：required = 需求明确要求、必须执行；optional = 原型补充、可选（去掉不影响核查结果）。
 * 未标注的环节均在需求范围内（常规业务环节）。
 */
export type Necessity = 'required' | 'optional';

export const NECESSITY_LABEL: Record<Necessity, string> = { required: '需求必需', optional: '原型补充 · 可选' };

export type StepId = 'org-sync' | 'policy' | 'rule-nl' | 'upload-api' | 'writeback' | 'upload-ui' | 'check-run' | 'auto-export' | 'review' | 'rectify' | 'branch-view' | 'cockpit' | 'night-batch' | 'rule-tune';

export interface FlowStep {
  id: StepId;
  phase: PhaseKey;
  title: string;
  /** 泳道图中的短标题（不超过 10 个字左右） */
  short: string;
  actor: ActorKey;
  with: ActorKey[];
  /** 演示时切换到的角色 */
  role: RoleKey;
  route: string;
  when: string;
  trigger: Trigger;
  narration: string;
  agent?: string;
  human?: string;
  inputs: DataKey[];
  outputs: DataKey[];
  subs: SubStep[];
  /** page：页面执行动作并汇报进度；walk：导演按子步骤时长推进（页面可做准备） */
  drive: 'page' | 'walk';
  /** 上一环节完成后立即进入（同一个后台任务的延续） */
  chain?: boolean;
  /** 需求地位（见 Necessity），与依据说明 */
  necessity?: Necessity;
  basis?: string;
}

export const STEPS: FlowStep[] = [
  {
    id: 'org-sync',
    phase: 'rules',
    title: '每日同步组织与人员主数据，刷新规则库适用范围与结果可见范围',
    short: '主数据同步',
    actor: 'batch',
    with: [],
    role: 'tier1',
    route: '/rules?tab=users',
    when: '每日 07:00',
    trigger: '定时调度',
    narration: '每天 07:00 从统一认证与人力系统拉取人员与组织，比对出当天的变更（新入职、调岗、离职），写入 doc_user_org。工号 → 组织 → 区域规则库 → 结果可见范围都由这张表决定：今天许航入职温州子公司，核查时自动用华东区域规则库；王凯从杭州调到宁波，历史批次仍属原公司；周强离职，账号停用。',
    agent: '（不参与）主数据同步是确定性的系统集成。',
    human: '人力系统是唯一来源；同步异常（如组织编码不存在）转集团管理员处理。',
    inputs: [],
    outputs: ['userOrg'],
    subs: [
      { title: '从统一认证 / 人力系统拉取人员与组织', actor: 'batch', data: 'userOrg', anchor: 'org-sync', ms: 2400 },
      { title: '比对变更：入职、调岗、离职', actor: 'batch', data: 'userOrg', anchor: 'org-changes', ms: 2800 },
      { title: '写入 doc_user_org，刷新规则库与可见范围', actor: 'batch', data: 'userOrg', anchor: 'org-map', ms: 2600 },
    ],
    drive: 'walk',
  },
  {
    id: 'policy',
    phase: 'rules',
    title: '集团用 AI 解读资金收付管理制度与填写规范手册，生成初始规则',
    short: 'AI 解读制度文件',
    actor: 'tier1',
    with: ['agent', 'batch'],
    role: 'tier1',
    route: '/rules?tab=policy',
    when: '上线前 / 政策更新时',
    trigger: '人工触发',
    narration: '集团导入《资金收付管理制度（2026 版）》《单据填写规范手册（2025 版）》，智能体按条款 / 章节切分，判断哪些能由上传的单据数据校验，生成带“大类”和依据（条款号、手册章节）的规则草案，审核后成为集团规则库，并下发各区域作为初始版本。',
    agent: '读懂条文：判断可校验性（确定性 / 需语义 / 批次级 / 不可校验），检索已有规则查重，起草结构化规则、大类与 DSL。',
    human: '草案必须经集团审核后发布，全程留痕。',
    inputs: ['policyDoc', 'ruleLib'],
    outputs: ['ruleLib', 'ruleDiff'],
    subs: [
      { title: '解析文件，按条款 / 章节切分', actor: 'batch', data: 'policyDoc' },
      { title: '识别可由单据数据校验的条款', actor: 'agent', data: 'policyDoc' },
      { title: '与现有规则比对：已覆盖 / 建议新增 / 转人工', actor: 'agent', data: 'ruleLib' },
      { title: '生成规则草案（含大类与依据）', actor: 'agent', data: 'ruleLib' },
      { title: '集团提交审核（全程留痕）', actor: 'tier1', data: 'ruleDiff' },
    ],
    drive: 'page',
  },
  {
    id: 'rule-nl',
    phase: 'rules',
    title: '区域用自然语言维护本区域规则库，逐条确认后发布新版本',
    short: '自然语言维护规则库',
    actor: 'tier2',
    with: ['agent'],
    role: 'tier2',
    route: '/rules?tab=nl',
    when: '08:30',
    trigger: '人工触发',
    narration: '华东区域管理员用一句话描述要求，智能体按工号找到本区域规则库，把话拆成若干条变更（新增规则、调参数、改类别…），给出变更前后对比与演示数据回放影响；管理员逐条确认或全部确认，发布新版本并记录 diff，只影响本区域用户。',
    agent: '理解口语化要求，拆成结构化变更；检索已有规则查重；判断是否违反口径（集团刚性规则不可停用）；回放演示数据估算影响。',
    human: '每条变更由管理员确认才生效；未确认的变更也留痕，可随时查看各版本 diff。',
    inputs: ['ruleLib', 'userOrg'],
    outputs: ['ruleLib', 'ruleDiff'],
    subs: [
      { title: '输入要求（自然语言）', actor: 'tier2', data: 'ruleLib', anchor: 'nl-input' },
      { title: '智能体拆解为变更并查重', actor: 'agent', data: 'ruleDiff', anchor: 'nl-trace' },
      { title: '查看变更 diff 与回放影响', actor: 'tier2', data: 'ruleDiff', anchor: 'nl-diff' },
      { title: '逐条确认 / 全部确认', actor: 'tier2', data: 'ruleDiff', anchor: 'nl-diff' },
      { title: '发布新版本，记录变更', actor: 'tier2', data: 'ruleDiff', anchor: 'lib-versions' },
    ],
    drive: 'page',
  },
  {
    id: 'upload-api',
    phase: 'check',
    title: 'RPA 读取供应商协同平台的待付款申请，调用上传接口核查',
    short: 'RPA 接口上传',
    actor: 'rpa',
    with: ['portal', 'batch', 'agent'],
    role: 'checker',
    route: '/check?tab=api',
    when: '10:30',
    trigger: '定时调度',
    narration: 'RPA 登录供应商协同平台读取待付款申请，按付款单表头整理成 Excel，带上触发人工号调用 POST /doc-audit/api/v1/batches。后台与界面上传走同一流程：按工号匹配华东区域规则库核查、自动生成结果文件、保存批次，RPA 轮询取回结果——线上付款申请与 ERP 两条线合一，核查与抓取彻底解耦。',
    agent: '与界面上传完全相同的语义核查与批次级国别一致性判断。',
    human: 'RPA 只负责搬运数据；结果由子公司岗位在线查看与复核。',
    inputs: ['platformData', 'ruleLib', 'userOrg'],
    outputs: ['apiUpload', 'checkCtx', 'batchRecord'],
    subs: [
      { title: 'RPA 读取供应商协同平台的待付款申请', actor: 'rpa', data: 'platformData', anchor: 'api-panel' },
      { title: '整理为付款单 Excel，调用上传接口', actor: 'rpa', data: 'apiUpload', anchor: 'api-panel' },
      { title: '后台按工号匹配规则库并核查', actor: 'batch', data: 'checkCtx', anchor: 'run-process' },
      { title: '生成结果文件、保存批次，接口返回', actor: 'batch', data: 'batchRecord', anchor: 'api-batches' },
    ],
    drive: 'page',
  },
  {
    id: 'writeback',
    phase: 'check',
    title: 'RPA 取回结果并回写供应商协同平台：有疑点的付款申请挂起，其余放行',
    short: 'RPA 回写协同平台',
    actor: 'rpa',
    with: ['portal'],
    role: 'checker',
    route: '/check?tab=api',
    when: '10:35',
    trigger: '自动衔接',
    narration: 'RPA 轮询到批次完成，取回结果文件，逐笔回写供应商协同平台：有疑点的付款申请改为“挂起”并附上疑点说明，等子公司复核后再处理；没有疑点的放行进入付款审批。核查结论因此不止停在报表里，而是真的拦住了有问题的付款。',
    agent: '（不参与）回写只搬运核查结论。',
    human: '挂起的申请由子公司复核岗确认后放行或退回（原型演示到挂起为止）。',
    inputs: ['batchRecord'],
    outputs: ['writeback'],
    subs: [
      { title: 'RPA 轮询批次状态，取回结果', actor: 'rpa', data: 'batchRecord', anchor: 'api-batches' },
      { title: '有疑点的付款申请挂起，附疑点说明', actor: 'rpa', data: 'writeback', anchor: 'api-writeback' },
      { title: '无疑点的申请放行，进入付款审批', actor: 'portal', data: 'writeback', anchor: 'api-writeback' },
    ],
    drive: 'page',
    chain: true,
  },
  {
    id: 'upload-ui',
    phase: 'check',
    title: '子公司财务核查岗在界面上传三类单据 Excel',
    short: '界面上传三类 Excel',
    actor: 'checker',
    with: [],
    role: 'checker',
    route: '/check',
    when: '14:00',
    trigger: '人工触发',
    narration: '核查岗从 ERP 导出收款单、付款单、进口结算单三类单据（一个文件三个工作表），在“一键核查”页面上传；系统按表头自动识别每个工作表的类别并校验格式，三类合并成一个批次。',
    inputs: ['docFile'],
    outputs: ['docFile'],
    subs: [
      { title: '在 ERP 导出三类单据', actor: 'checker', data: 'docFile' },
      { title: '上传 Excel', actor: 'checker', data: 'docFile', anchor: 'check-upload' },
      { title: '自动识别三个工作表并校验格式', actor: 'batch', data: 'docFile' },
    ],
    drive: 'page',
  },
  {
    id: 'check-run',
    phase: 'check',
    title: '后台按工号匹配区域规则库，智能体批量核查（含批次级国别一致性）',
    short: '按区域规则库核查',
    actor: 'batch',
    with: ['agent', 'checker'],
    role: 'checker',
    route: '/check',
    when: '14:01',
    trigger: '人工触发',
    narration: '核查岗点击“一键核查”：统一认证工号 → doc_user_org → 杭州子公司 → 华东区域规则库；三类单据用同一规则库，先跑确定性规则，再做批次级国别一致性（同一交易对方国别唯一，三类合并），用途说明等语义判断归并去重后交给智能体批量处理。',
    agent: '语义核查（编码与用途说明、性质、地址国别）；交易对方名称归并并否决子公司误合并；平台类多国收付排除；输出置信度与推理轨迹。',
    inputs: ['docFile', 'ruleLib', 'userOrg'],
    outputs: ['docRecord', 'checkCtx', 'batchIndex', 'semKey', 'judgement', 'recordResult'],
    subs: [
      { title: '三类表标准化，合并为一个批次', actor: 'batch', data: 'docRecord', anchor: 'run-process' },
      { title: '按工号匹配区域规则库', actor: 'batch', data: 'checkCtx', anchor: 'run-process' },
      { title: '确定性规则执行', actor: 'batch', data: 'judgement', anchor: 'run-process' },
      { title: '批次级国别一致性（三类合并）', actor: 'agent', data: 'batchIndex', anchor: 'run-process' },
      { title: '语义归并与缓存', actor: 'batch', data: 'semKey', anchor: 'run-process' },
      { title: '智能体语义核查', actor: 'agent', data: 'judgement', anchor: 'run-process' },
      { title: '结果复核与汇总', actor: 'agent', data: 'recordResult', anchor: 'run-process' },
    ],
    drive: 'page',
    chain: true,
  },
  {
    id: 'auto-export',
    phase: 'check',
    title: '自动导出结果 Excel（国别单列一个工作表）并保存批次',
    short: '自动导出并保存',
    actor: 'batch',
    with: ['checker'],
    role: 'checker',
    route: '/check',
    when: '14:02',
    trigger: '自动衔接',
    narration: '核查完成即自动生成结果文件：收款疑点、付款疑点、进口结算单疑点各一张工作表（首行汇总、只导出疑点、第一列疑点类型），国别疑点三类合并单列一张；导出前弹出保密提示。批次与疑点明细同时保存，本人、辖内区域、集团均可查看。',
    human: '导出前保密提示；演示中不实际下载。',
    inputs: ['recordResult', 'runStats'],
    outputs: ['resultXlsx', 'batchRecord'],
    subs: [
      { title: '生成结果文件（各类疑点 + 国别疑点）', actor: 'batch', data: 'resultXlsx', anchor: 'run-result' },
      { title: '保存批次与疑点明细', actor: 'batch', data: 'batchRecord', anchor: 'run-result' },
      { title: '导出前保密提示', actor: 'checker', data: 'resultXlsx' },
    ],
    drive: 'page',
    chain: true,
  },
  {
    id: 'review',
    phase: 'review',
    title: '子公司财务复核岗在线查看结果，按大类复核疑点',
    short: '复核岗在线查看',
    actor: 'reviewer',
    with: ['agent'],
    role: 'reviewer',
    route: '/results',
    when: '14:20',
    trigger: '人工触发',
    narration: '复核岗打开“核查结果”，看到本公司的全部批次（界面上传与 RPA 接口上传）；在线查看时按大类筛选，国别问题作为一个大类：同一交易对方在本批次的国别分布与建议国别一目了然；打开疑点查看单据与智能体推理轨迹，确认疑点或判定误报，结论回流判例库。',
    agent: '提供推理轨迹与建议；判例库结论用于后续同类用途说明复用。',
    human: '复核岗确认疑点 / 判定误报（核查岗只查看）。',
    inputs: ['batchRecord', 'recordResult', 'batchIndex', 'judgement'],
    outputs: ['casebook'],
    subs: [
      { title: '查看本公司的核查批次', actor: 'reviewer', data: 'batchRecord', anchor: 'results-list' },
      { title: '打开批次，按大类查看疑点', actor: 'reviewer', data: 'recordResult', anchor: 'batch-detail' },
      { title: '国别大类：交易对方国别分布', actor: 'reviewer', data: 'batchIndex', anchor: 'country-groups' },
      { title: '打开疑点，查看推理轨迹', actor: 'reviewer', data: 'judgement', anchor: 'drawer-trace' },
      { title: '确认疑点，结论回流判例库', actor: 'reviewer', data: 'casebook', anchor: 'drawer-findings' },
    ],
    drive: 'page',
  },
  {
    id: 'rectify',
    phase: 'review',
    title: '核查岗按复核确认的疑点在 ERP 整改，登记整改结果',
    short: '疑点整改',
    actor: 'checker',
    with: ['reviewer'],
    role: 'checker',
    route: '/results',
    when: '15:30',
    trigger: '人工触发',
    narration: '复核岗确认的疑点进入核查岗的“待整改”清单：国别疑点在 ERP 里更正交易对方国别，编码与用途说明不匹配的更正类别编码或补充用途说明，然后登记整改结果。整改状态回传，驾驶舱据此统计整改率——疑点从“发现”走到“关闭”。',
    agent: '（不参与）整改由人完成。',
    human: '核查岗在 ERP 中更正并登记；复核岗可抽查整改结果（原型略）。',
    inputs: ['casebook'],
    outputs: ['rectify'],
    subs: [
      { title: '查看复核确认的待整改疑点', actor: 'checker', data: 'casebook', anchor: 'rectify-list' },
      { title: '在 ERP 更正单据并登记整改', actor: 'checker', data: 'rectify', anchor: 'rectify-list' },
      { title: '整改状态回传，计入整改率', actor: 'batch', data: 'rectify', anchor: 'rectify-list' },
    ],
    drive: 'page',
  },
  {
    id: 'branch-view',
    phase: 'review',
    title: '区域财务管理员查看辖内全部核查结果',
    short: '区域看辖内结果',
    actor: 'tier2',
    with: [],
    role: 'tier2',
    route: '/results',
    when: '16:30',
    trigger: '人工触发',
    narration: '系统集成：统一认证带入工号 F0010912，后台按 doc_user_org 确定为华东区域管理员，返回辖内 5 个子公司与本区域的全部批次（含 RPA 接口上传）；可按子公司、来源筛选，打开任一批次查看疑点明细、重新下载结果文件。',
    inputs: ['batchRecord', 'userOrg'],
    outputs: ['batchRecord'],
    subs: [
      { title: '按统一认证身份确定可见范围', actor: 'tier2', data: 'userOrg', anchor: 'scope-note' },
      { title: '辖内全部批次（界面 + 接口）', actor: 'tier2', data: 'batchRecord', anchor: 'results-list' },
      { title: '打开子公司批次查看疑点', actor: 'tier2', data: 'batchRecord', anchor: 'batch-detail' },
    ],
    drive: 'page',
  },
  {
    id: 'cockpit',
    phase: 'govern',
    title: '驾驶舱：区域看辖内、集团看全部',
    short: '核查驾驶舱',
    actor: 'tier1',
    with: ['tier2', 'batch'],
    role: 'tier1',
    route: '/cockpit',
    when: '次日 09:00',
    trigger: '人工触发',
    narration: '驾驶舱由核查批次实时汇总，按角色分层：区域看辖内各子公司，集团看各区域并可下钻到子公司。指标包括批次数、核查笔数、疑点率、各大类疑点分布（国别单列）、接口上传占比与每日趋势，以及闭环：被挂起的付款申请、确认疑点的整改率。',
    agent: '（不参与）驾驶舱只做聚合展示。',
    inputs: ['batchRecord', 'writeback', 'rectify'],
    outputs: ['cockpitAgg'],
    subs: [
      { title: '全集团核心指标', actor: 'tier1', data: 'cockpitAgg', anchor: 'cockpit-kpi' },
      { title: '闭环：付款挂起与疑点整改', actor: 'tier1', data: 'rectify', anchor: 'cockpit-loop' },
      { title: '各区域对比', actor: 'tier1', data: 'cockpitAgg', anchor: 'cockpit-orgs' },
      { title: '疑点大类分布（国别单列）', actor: 'tier1', data: 'cockpitAgg', anchor: 'cockpit-majors' },
      { title: '下钻区域看子公司', actor: 'tier1', data: 'cockpitAgg', anchor: 'cockpit-orgs' },
    ],
    drive: 'page',
  },
  {
    id: 'night-batch',
    phase: 'govern',
    title: '夜间跑批：语义缓存预热、判例库复用',
    short: '夜间跑批·缓存预热',
    actor: 'batch',
    with: ['agent'],
    role: 'tier2',
    route: '/agent-ops',
    when: '次日 02:00',
    trigger: '定时调度',
    narration: '夜间低峰批量调用大模型：把当天新出现的（编码, 用途说明）组合预先判定写入缓存，复用判例库结论，第二天日间核查直接命中缓存，减少大模型调用。',
    agent: '批量判定新组合；以判例库为提示词示例。',
    inputs: ['casebook', 'semKey'],
    outputs: ['semKey', 'runStats'],
    subs: [
      { title: '汇总当日新语义组合', actor: 'batch', data: 'semKey', anchor: 'night-batch' },
      { title: '复用判例库结论', actor: 'agent', data: 'casebook', anchor: 'night-batch' },
      { title: '批量判定并写入缓存', actor: 'agent', data: 'semKey', anchor: 'night-batch' },
    ],
    drive: 'page',
    necessity: 'optional',
    basis: '原型补充：需求没有要求夜间跑批，去掉不影响核查结果，只影响大模型调用量与日间耗时。',
  },
  {
    id: 'rule-tune',
    phase: 'govern',
    title: '误报回流：智能体按判例库生成规则调优建议，区域采纳为下一版本草稿',
    short: '误报回流·规则调优',
    actor: 'agent',
    with: ['tier2'],
    role: 'tier2',
    route: '/rules?tab=nl',
    when: '次日 10:00',
    trigger: '定时调度',
    narration: '智能体每天汇总判例库：哪些规则被判误报多、误报集中在哪些用途说明上。比如“快递费”被判为“用途说明笼统”的误报，建议把这类常见、明确的费用加入白名单。区域管理员采纳后，建议变成自然语言维护里的一条草稿，仍要逐条确认、发布新版本才生效。',
    agent: '统计判例、定位误报集中的规则与用途说明，生成可回放影响的调优建议。',
    human: '建议只是草稿：区域管理员采纳、确认并发布后才生效。',
    inputs: ['casebook'],
    outputs: ['ruleDiff'],
    subs: [
      { title: '汇总判例库：确认与误报', actor: 'agent', data: 'casebook', anchor: 'tune-suggest' },
      { title: '定位误报集中的规则与用途说明', actor: 'agent', data: 'ruleDiff', anchor: 'tune-suggest' },
      { title: '区域管理员采纳为下一版本草稿', actor: 'tier2', data: 'ruleDiff', anchor: 'nl-input' },
    ],
    drive: 'page',
    necessity: 'optional',
    basis: '原型补充：需求没有要求误报回流；去掉不影响当次核查，只影响规则库能否越用越准。',
  },
];

/* ---------------- DAG：依赖边与布局 ---------------- */

export interface FlowEdge {
  from: StepId;
  to: StepId;
  /** 沿这条边传递的数据对象；无则为时序依赖（如日终、T+1 回流） */
  data?: DataKey;
  label: string;
}

export const EDGES: FlowEdge[] = [
  { from: 'org-sync', to: 'rule-nl', data: 'userOrg', label: '工号 → 区域' },
  { from: 'org-sync', to: 'upload-api', data: 'userOrg', label: '组织映射' },
  { from: 'org-sync', to: 'check-run', data: 'userOrg', label: '组织映射' },
  { from: 'policy', to: 'rule-nl', data: 'ruleLib', label: '初始规则库' },
  { from: 'rule-nl', to: 'upload-api', data: 'ruleLib', label: '规则库 v+1' },
  { from: 'rule-nl', to: 'check-run', data: 'ruleLib', label: '规则库 v+1' },
  { from: 'upload-api', to: 'writeback', data: 'batchRecord', label: '接口批次结果' },
  { from: 'upload-ui', to: 'check-run', data: 'docFile', label: '三类 Excel' },
  { from: 'check-run', to: 'auto-export', data: 'recordResult', label: '核查结果' },
  { from: 'auto-export', to: 'review', data: 'batchRecord', label: '结果批次' },
  { from: 'review', to: 'rectify', data: 'casebook', label: '确认的疑点' },
  { from: 'upload-api', to: 'branch-view', data: 'batchRecord', label: '接口批次' },
  { from: 'review', to: 'branch-view', label: '复核完成' },
  { from: 'branch-view', to: 'cockpit', data: 'batchRecord', label: '全部批次' },
  { from: 'writeback', to: 'cockpit', data: 'writeback', label: '挂起 / 放行' },
  { from: 'rectify', to: 'cockpit', data: 'rectify', label: '整改进度' },
  { from: 'review', to: 'night-batch', data: 'casebook', label: '判例库' },
  { from: 'review', to: 'rule-tune', data: 'casebook', label: '误报判例' },
];

/** 依赖图布局：行 = 业务分支，列 = 依赖深度（同列可并行；col 必须大于全部上游的 col） */
export const DAG_POS: Record<StepId, { col: number; row: number }> = {
  policy: { col: 0, row: 0 },
  'rule-nl': { col: 1, row: 0 },
  'rule-tune': { col: 5, row: 0 },
  'upload-ui': { col: 1, row: 1 },
  'check-run': { col: 2, row: 1 },
  'auto-export': { col: 3, row: 1 },
  review: { col: 4, row: 1 },
  rectify: { col: 5, row: 1 },
  'upload-api': { col: 2, row: 2 },
  writeback: { col: 3, row: 2 },
  'branch-view': { col: 5, row: 2 },
  cockpit: { col: 6, row: 1.5 },
  'org-sync': { col: 0, row: 3 },
  'night-batch': { col: 5, row: 3 },
};

export const DAG_ROWS: { row: number; label: string; desc: string }[] = [
  { row: 0, label: '规则库', desc: '集团 → 区域' },
  { row: 1, label: '界面上传', desc: '核查 → 整改' },
  { row: 2, label: '接口上传', desc: 'RPA · 回写' },
  { row: 3, label: '主数据 · 治理', desc: '同步 · 跑批' },
];

export const DAG_COLS = 7;
/** 最大行号（布局高度用） */
export const DAG_MAX_ROW = 3;
/** 汇合区从第几列开始，及其标题 */
export const DAG_MERGE_COL = 5;
export const DAG_MERGE_LABEL = '复核之后（各分支在此汇合）';

export function depsOf(id: StepId): StepId[] {
  return EDGES.filter((e) => e.to === id).map((e) => e.from);
}

export function succOf(id: StepId): StepId[] {
  return EDGES.filter((e) => e.from === id).map((e) => e.to);
}

/** 全部上游（祖先）环节 */
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

/** 可执行环节：未完成且上游全部完成，按 STEPS 顺序排列 */
export function readySteps(done: Iterable<StepId>): StepId[] {
  const set = new Set(done);
  return STEPS.filter((s) => !set.has(s.id) && depsOf(s.id).every((d) => set.has(d))).map((s) => s.id);
}

/**
 * 可执行环节的优先顺序：按 STEPS 顺序（按业务时间写成的拓扑序），原型补充 · 可选的环节放在最后、不打断主流程。
 * 不“先沿刚完成环节的下游继续”：并行分支各有多步时，那样会打乱业务时间顺序。
 */
export function orderReady(done: Iterable<StepId>): StepId[] {
  const ready = readySteps(done);
  const optional = (id: StepId) => stepById(id).necessity === 'optional';
  return [...ready.filter((id) => !optional(id)), ...ready.filter(optional)];
}

/** 最长依赖链深度（第几层，从 0 开始） */
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

/** 当前页面（路径 + 页签）对应的流程环节 */
export function stepsForRoute(path: string, tab: string | null): { step: FlowStep; exact: boolean }[] {
  // 页签缺省时视为该页面的默认页签
  const cur = tab ?? defaultTab(path);
  return STEPS.filter((s) => pathOf(s.route) === path).map((s) => {
    const t = tabOf(s.route);
    return { step: s, exact: !t || t === cur };
  });
}

function defaultTab(path: string) {
  return path === '/rules' ? 'catalog' : path === '/check' ? 'ui' : null;
}
