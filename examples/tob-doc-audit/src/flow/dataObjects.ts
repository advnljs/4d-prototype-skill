/**
 * 数据对象目录：全流程中流转的每一种数据结构（字段、类型、在哪里、谁产生、谁使用、敏感程度）。
 * 字段与 src 中的 TypeScript 类型一一对应，便于业务与科技对齐“数据长什么样、在哪一步发生了什么变化”。
 */
import type { ActorKey } from './actors';

export type DataKey =
  | 'policyDoc'
  | 'userOrg'
  | 'ruleLib'
  | 'ruleDiff'
  | 'docFile'
  | 'platformData'
  | 'apiUpload'
  | 'docRecord'
  | 'checkCtx'
  | 'batchIndex'
  | 'semKey'
  | 'judgement'
  | 'recordResult'
  | 'runStats'
  | 'resultXlsx'
  | 'batchRecord'
  | 'writeback'
  | 'casebook'
  | 'rectify'
  | 'cockpitAgg';

export interface DataField {
  name: string;
  type: string;
  desc: string;
}

export interface DataObj {
  key: DataKey;
  name: string;
  /** 代码中的类型名 */
  type: string;
  /** 载体与存放位置 */
  carrier: string;
  sensitivity: '高' | '中' | '低';
  sensNote: string;
  producer: ActorKey;
  desc: string;
  fields: DataField[];
}

const D: DataObj[] = [
  {
    key: 'policyDoc',
    name: '制度文件与手册',
    type: 'PolicyDoc',
    carrier: 'PDF / Word 原文（原型为条款示意摘要）',
    sensitivity: '低',
    sensNote: '集团内部制度',
    producer: 'tier1',
    desc: '《资金收付管理制度（2026 版）》与《单据填写规范手册（2025 版）》：智能体按条款 / 章节切分，判断能否由单笔或整批数据校验，生成带大类与依据的规则。',
    fields: [
      { name: 'title', type: 'string', desc: '文件名称' },
      { name: 'clauses[].no', type: 'string', desc: '条款号（如 4.2.3.1）或手册章节号（如 3.1）' },
      { name: 'clauses[].checkable', type: "'code' | 'agent' | 'none'", desc: '可转确定性规则 / 需语义判断 / 不可由单据数据校验' },
      { name: 'clauses[].map', type: 'covered | new | manual', desc: '已被规则覆盖 / 建议新增（含草案）/ 转人工' },
    ],
  },
  {
    key: 'userOrg',
    name: '用户与组织对应表',
    type: 'UserOrg（doc_user_org）',
    carrier: '业务库（由统一认证 / 人力系统每日同步）',
    sensitivity: '中',
    sensNote: '含员工姓名、工号',
    producer: 'batch',
    desc: '统一认证只带工号；后台据此查出所属组织与岗位，确定使用哪个规则库、能看哪些核查结果。',
    fields: [
      { name: 'empNo', type: 'string', desc: '工号（统一认证中的用户 id）' },
      { name: 'name', type: 'string', desc: '姓名' },
      { name: 'orgCode', type: 'string', desc: '所属组织（子公司 / 区域 / 集团，6 位组织编码）' },
      { name: 'post', type: "'checker' | 'reviewer' | 'tier2' | 'tier1'", desc: '岗位：子公司财务核查岗 / 复核岗 / 区域财务管理员 / 集团财务管理员' },
      { name: '→ 规则库', type: '派生', desc: '子公司 → 所属区域规则库；区域 → 本区域；集团 → 集团规则库' },
    ],
  },
  {
    key: 'ruleLib',
    name: '组织规则库',
    type: 'RuleLib + RuleDef（doc_rule_lib）',
    carrier: '业务库（原型在浏览器内）',
    sensitivity: '低',
    sensNote: '不含业务数据',
    producer: 'tier2',
    desc: '集团与各区域各一套规则库，独立维护启停、参数与类别；规则记录带大类与依据。三类单据共用同一规则库。',
    fields: [
      { name: 'orgCode / version', type: 'string', desc: '规则库所属组织、当前版本（如 v2026.10.3）' },
      { name: 'items[ruleId]', type: '{ enabled, params, level? }', desc: '本组织选用的规则：启停、参数、类别调整（错误 / 疑问数据）' },
      { name: 'rule.major', type: 'MajorKey', desc: '大类：类别编码与用途说明、国家/地区、币种金额账户、完整性…（参照资金收付管理制度结构）' },
      { name: 'rule.refs', type: 'RuleRef[]', desc: '依据：资金收付管理制度条款号、填写规范手册章节、区域要求' },
      { name: 'rule.engine / level / rigid', type: 'string / boolean', desc: '执行方式；错误数据 / 疑问数据；集团制度不可停用' },
      { name: 'rule.logic / check()', type: 'DSL / 实现', desc: 'AI 生成的规则逻辑（供审核）与执行实现' },
    ],
  },
  {
    key: 'ruleDiff',
    name: '规则库版本与变更',
    type: 'LibVersion + RuleChange[]（doc_rule_lib_version）',
    carrier: '业务库',
    sensitivity: '低',
    sensNote: '含员工工号',
    producer: 'agent',
    desc: '自然语言维护时智能体把一句话拆成若干条变更（diff），管理员逐条确认或全部确认后发布新版本；未确认的也留痕。',
    fields: [
      { name: 'version / at / who', type: 'string', desc: '新版本号、发布时间、发布人' },
      { name: 'via / instruction', type: "'nl' | 'manual' | 'init' / string", desc: '自然语言维护（含原话）/ 手工调整 / 初始化' },
      { name: 'changes[].kind', type: "'add' | 'disable' | 'param' | 'level'…", desc: '新增规则 / 停用 / 参数调整 / 类别调整' },
      { name: 'changes[].before / after', type: 'string', desc: '变更前后（diff 展示）' },
      { name: 'changes[].reason', type: 'string', desc: '智能体给出的理由（引用的条款或原话）' },
      { name: 'rejected[]', type: 'RuleChange[]', desc: '未被确认的变更' },
    ],
  },
  {
    key: 'docFile',
    name: '三类单据 Excel',
    type: 'xlsx：收款 / 付款 / 进口结算工作表',
    carrier: '界面上传或 RPA 接口上传（原型只在浏览器解析）',
    sensitivity: '高',
    sensNote: '含客商名称、账号、经办人电话',
    producer: 'checker',
    desc: '核查数据全部来自上传：ERP 导出的三类单据，可放在一个文件的多个工作表里，也可分开上传；按表头自动识别类别。',
    fields: [
      { name: '工作表', type: '收款 / 付款 / 进口结算', desc: '可只含其中一两类；每类最多一张' },
      { name: '第 1 行', type: 'string', desc: '标题（收款单明细 / 付款单明细 / 进口结算单明细）' },
      { name: '第 2 行（表头）', type: 'string[40 | 40 | 44]', desc: '中文列名，三类表各不相同，用于识别类别与校验格式' },
      { name: '数据行', type: 'string[]', desc: '组织编码、单据编号、交易对方、类别编码1、用途说明1、银行流水号…' },
    ],
  },
  {
    key: 'platformData',
    name: '供应商待付款申请',
    type: '供应商协同平台页面 → 付款单 Excel',
    carrier: '外部平台：供应商协同平台（RPA 读取后整理成 Excel）',
    sensitivity: '高',
    sensNote: '含供应商名称、账号；RPA 凭据随任务清除',
    producer: 'portal',
    desc: '供应商在协同平台提交付款申请后进入“待付款”列表。RPA 读取后按付款单表头整理成 Excel，再走统一上传接口——协同平台与 ERP 两条数据线就此合一。',
    fields: [
      { name: '列表 / 详情', type: '约 30 项', desc: '申请编号、供应商、金额、类别、用途说明、收款账户、国家/地区…' },
      { name: '→ 付款工作表', type: 'xlsx', desc: '映射为与 ERP 付款单相同的表头，核查逻辑完全一致' },
    ],
  },
  {
    key: 'apiUpload',
    name: '接口上传请求',
    type: 'POST /doc-audit/api/v1/batches',
    carrier: 'HTTPS 接口（集团内网络）',
    sensitivity: '高',
    sensNote: '文件内容含客商信息；只接受集团内网调用',
    producer: 'rpa',
    desc: 'RPA（或其他系统）把 Excel 以 multipart 上传，并带上触发人的工号；后台与界面上传走同一核查流程、同一规则库，返回批次号，结果可轮询或回调。',
    fields: [
      { name: 'file', type: 'multipart xlsx', desc: '三类单据中的一类或多类' },
      { name: 'operator', type: 'string', desc: '触发人工号（决定规则库与结果归属）' },
      { name: 'source', type: "'rpa-supplier-portal' | …", desc: '数据来源标识' },
      { name: '→ 返回', type: '{ batchId, status, resultUrl }', desc: '批次号、状态（queued / running / done）、结果文件地址' },
    ],
  },
  {
    key: 'docRecord',
    name: '标准化单据记录',
    type: 'DocRecord',
    carrier: '核查任务内存',
    sensitivity: '高',
    sensNote: '含客商信息，不持久化',
    producer: 'batch',
    desc: '把三类表（收款 / 付款 / 进口结算）不同的中文列名映射到约 45 个统一逻辑字段，三类合并成一个批次，规则只面向逻辑字段编写。',
    fields: [
      { name: 'key', type: 'string', desc: '单据编号（重复时追加行号）' },
      { name: 'biz', type: "'receipt' | 'payment' | 'settlement'", desc: '单据种类' },
      { name: 'row', type: 'number', desc: '原文件行号（导出、定位用）' },
      { name: 'f.docNo / f.domesticName / f.counterparty', type: 'string', desc: '单据编号、本方单位、交易对方' },
      { name: 'f.code1 / f.remark1 / f.txAmt1', type: 'string', desc: '类别编码、用途说明、明细金额' },
      { name: 'f.country / f.bankRef / f.usdAmt', type: 'string', desc: '对方国家/地区、银行流水号、折美元金额' },
      { name: 'raw', type: 'Record<中文列名, string>', desc: '原始整行，导出时按原表头完整展示' },
    ],
  },
  {
    key: 'checkCtx',
    name: '核查上下文',
    type: 'CheckContext',
    carrier: '核查任务内存',
    sensitivity: '低',
    sensNote: '不含业务明细',
    producer: 'batch',
    desc: '一次核查共享的环境：按工号匹配到的规则库参数、战略项目名单、核查日期，以及整批数据的批次级索引。',
    fields: [
      { name: 'today', type: 'Date', desc: '核查日期（时效类规则）' },
      { name: 'params', type: 'ruleId → 参数', desc: '所属组织规则库中的参数' },
      { name: 'projectEntities', type: 'Set<本方主体代码>', desc: '战略项目子公司（R702 使用）' },
      { name: 'batch', type: 'BatchIndex', desc: '批次级索引（国别一致性规则使用）' },
    ],
  },
  {
    key: 'batchIndex',
    name: '批次级国家/地区索引',
    type: 'BatchIndex',
    carrier: '核查任务内存',
    sensitivity: '中',
    sensNote: '含境外交易对方名称',
    producer: 'agent',
    desc: '三类单据合并统计每个境外交易对方在本批次中的国别分布：名称完全相同的直接统计（R405）；写法不同的清洗后按相似度聚类、智能体否决子公司误合并（R406）；平台类排除。',
    fields: [
      { name: 'exact', type: 'Map<规范化名称, 国别 → 记录>', desc: '名称完全相同的国别分布' },
      { name: 'groups[]', type: 'CpGroup', desc: '交易对方组：写法、国别分布、多数国别（平局为空）、排除原因' },
      { name: 'merges[]', type: 'MergeNote', desc: '相似度合并 / 否决的判断与理由' },
      { name: 'counted', type: 'number', desc: '参与统计的境外往来记录数（国别为空 / CHN / ZZZ 的另由规则处理）' },
    ],
  },
  {
    key: 'semKey',
    name: '语义组合与判定缓存',
    type: '（类别编码, 规范化用途说明）→ 判定',
    carrier: '判定缓存（服务端，跨天复用）',
    sensitivity: '低',
    sensNote: '用途说明已去除单据号、长数字',
    producer: 'batch',
    desc: '语义判断按组合去重：大量单据共用少量（编码, 用途说明）组合；命中缓存直接复用已确认结论。',
    fields: [
      { name: 'code', type: 'string', desc: '类别编码' },
      { name: 'cleaned', type: 'string', desc: '规范化用途说明（去项目标注、关联方前缀、单据号、长数字、“退款”等）' },
      { name: 'key', type: 'string', desc: 'code|cleaned' },
      { name: 'cacheHit', type: 'boolean', desc: '是否命中历史判定' },
      { name: 'verdict', type: 'Judgement', desc: '缓存的结论（人工确认后优先）' },
    ],
  },
  {
    key: 'judgement',
    name: '规则判定与推理轨迹',
    type: 'Judgement',
    carrier: '随结果留存（可审计）',
    sensitivity: '中',
    sensNote: '轨迹引用字段值',
    producer: 'agent',
    desc: '每条规则对每笔记录的结论；智能体规则附完整推理轨迹（感知 → 工具 → 检索 → 推理 → 结论 → 自检）。',
    fields: [
      { name: 'verdict', type: "'fail' | 'warn' | 'pass' | 'skip'", desc: '错误数据 / 疑问数据（需人工确认）/ 通过 / 不适用' },
      { name: 'confidence', type: 'number', desc: '置信度；低于阈值转人工' },
      { name: 'message / suggestion', type: 'string', desc: '疑点说明与整改建议' },
      { name: 'fields', type: 'FieldKey[]', desc: '涉及字段（单据视图标红）' },
      { name: 'steps', type: 'TraceStep[]', desc: '推理轨迹：kind、title、io、ms、tokens' },
      { name: 'cleared', type: 'string', desc: '预筛命中但智能体判定非疑点（误报拦截）' },
    ],
  },
  {
    key: 'recordResult',
    name: '单笔核查结果',
    type: 'RecordResult',
    carrier: '核查任务内存 → 结果文件',
    sensitivity: '高',
    sensNote: '含原记录',
    producer: 'batch',
    desc: '合并同一笔记录在所有规则上的结论，决定整笔状态。',
    fields: [
      { name: 'rec', type: 'DocRecord', desc: '原记录' },
      { name: 'findings[]', type: 'Finding', desc: 'ruleId、ruleName、major（大类）、level、engine、message、suggestion、confidence、fields' },
      { name: 'status', type: "'fail' | 'warn' | 'pass'", desc: '有错误数据 / 仅疑问数据 / 通过' },
      { name: 'cleared[]', type: '{ ruleId, reason }', desc: '智能体拦截的误报' },
    ],
  },
  {
    key: 'runStats',
    name: '批次统计',
    type: 'RunStats',
    carrier: '核查批次、驾驶舱',
    sensitivity: '低',
    sensNote: '只有数字',
    producer: 'batch',
    desc: '一次核查的汇总：笔数、疑点、各规则命中、语义归并与大模型调用量估算。',
    fields: [
      { name: 'total / suspicious', type: 'number', desc: '总核查笔数、疑点笔数（导出首行汇总）' },
      { name: 'failCount / warnCount / passCount', type: 'number', desc: '疑点 / 需确认 / 通过' },
      { name: 'ruleHits', type: 'ruleId → number', desc: '各规则命中次数（疑点分布）' },
      { name: 'semantic', type: '{ lines, uniqueCombos, cacheHits, llmCalls }', desc: '语义归并与缓存效果' },
      { name: 'estMs / estTokens', type: '{ online, batch }', desc: '逐笔 vs 批量的耗时与 token 估算' },
    ],
  },
  {
    key: 'resultXlsx',
    name: '核查结果文件',
    type: 'xlsx（多工作表）',
    carrier: '每次核查自动导出（保密提示后下载）',
    sensitivity: '高',
    sensNote: '含客商信息，导出前弹窗提示',
    producer: 'batch',
    desc: '每次核查自动导出：上传了几类单据就有几张疑点工作表（首行汇总、只导出疑点、第一列疑点类型、其后原导入全部列）；国别疑点三类合并，单独一张“国别疑点”工作表。',
    fields: [
      { name: '收款疑点 / 付款疑点 / 进口结算疑点', type: '工作表', desc: '首行汇总（总笔数、疑点笔数、批次号、规则库版本、来源）；整行标红' },
      { name: '国别疑点', type: '工作表', desc: '疑点类型、交易对方（清洗后）、本批次国别分布、建议国别、单据类别、单据编号…' },
      { name: '命名', type: 'string', desc: '核查结果-核查日期-员工编号-流水号.xlsx' },
    ],
  },
  {
    key: 'batchRecord',
    name: '核查批次与疑点明细',
    type: 'CheckBatch + FindingRow（doc_check_batch / doc_check_finding）',
    carrier: '业务库（原型：浏览器本地 + 演示种子）',
    sensitivity: '中',
    sensNote: '不留存原始明细；疑点含单据编号与交易对方',
    producer: 'batch',
    desc: '保存每次核查：批次信息、统计、按大类的疑点数、疑点明细。子公司看本公司；区域看辖内全部；集团看全部（按统一认证工号确定范围）。',
    fields: [
      { name: 'id / time / source', type: 'string', desc: '批次号、核查时间、来源（界面上传 / 接口上传 RPA）' },
      { name: 'empNo / orgCode', type: 'string', desc: '操作人工号、所属组织' },
      { name: 'libOrg / libVersion', type: 'string', desc: '使用的规则库与版本' },
      { name: 'total / suspicious / byMajor', type: 'number / 大类 → 笔数', desc: '核查笔数、疑点笔数、各大类疑点' },
      { name: 'countryRecs / countryCps', type: 'number', desc: '国别疑点笔数、国别不唯一的交易对方数' },
      { name: 'findings[]', type: 'FindingRow', desc: '单据编号、类别、规则、大类、说明、建议' },
    ],
  },
  {
    key: 'writeback',
    name: '协同平台回写报文',
    type: 'WritebackItem[]',
    carrier: 'RPA → 供应商协同平台（页面操作 / 开放接口，原型中为模拟）',
    sensitivity: '中',
    sensNote: '含付款申请号与疑点摘要',
    producer: 'rpa',
    desc: 'RPA 取回接口批次的核查结果后逐笔回写协同平台：有疑点的付款申请挂起并附疑点说明，没有疑点的放行进入付款审批。',
    fields: [
      { name: 'applyNo', type: 'string', desc: '付款申请号（= 付款单单据编号）' },
      { name: 'payee / amount', type: 'string / number', desc: '收款方 / 金额' },
      { name: 'action', type: "'HOLD' | 'RELEASE'", desc: '挂起 / 放行' },
      { name: 'reason', type: 'string', desc: '挂起原因：疑点大类与规则名称' },
      { name: 'batchId / at', type: 'string', desc: '来源批次 / 回写时间' },
    ],
  },
  {
    key: 'casebook',
    name: '判例库（人工反馈）',
    type: 'CaseEntry',
    carrier: '判例库 / 判定缓存（服务端）',
    sensitivity: '低',
    sensNote: '只保留编码与规范化用途说明',
    producer: 'reviewer',
    desc: '复核岗“确认疑点 / 判定误报”的结论回流：同类用途说明直接复用，并作为提示词中的示例。',
    fields: [
      { name: 'key', type: 'string', desc: '语义组合 code|cleaned' },
      { name: 'ruleId / ruleName', type: 'string', desc: '对应规则' },
      { name: 'decision', type: "'confirm' | 'reject'", desc: '确认疑点 / 判定误报' },
      { name: 'who / at', type: 'string', desc: '反馈人、时间' },
    ],
  },
  {
    key: 'rectify',
    name: '疑点整改记录',
    type: 'RectifyEntry',
    carrier: '业务库（建议表 doc_check_rectify；原型：浏览器本地 + 演示种子）',
    sensitivity: '低',
    sensNote: '只含单据编号与整改说明',
    producer: 'checker',
    desc: '复核确认的疑点由核查岗在 ERP 整改后登记：整改动作、整改人、时间；驾驶舱据此统计整改率。',
    fields: [
      { name: 'caseId / docNo', type: 'string', desc: '对应判例（确认的疑点）/ 单据编号' },
      { name: 'ruleId / ruleName', type: 'string', desc: '疑点规则' },
      { name: 'action', type: 'string', desc: '整改动作（如更正交易对方国别）' },
      { name: 'who / at', type: 'string', desc: '整改人 / 时间' },
    ],
  },
  {
    key: 'cockpitAgg',
    name: '驾驶舱聚合',
    type: '按组织 / 大类 / 日期聚合',
    carrier: '驾驶舱（由核查批次实时汇总）',
    sensitivity: '低',
    sensNote: '只有聚合数字',
    producer: 'batch',
    desc: '区域看辖内各子公司，集团看各区域并可下钻：批次数、核查笔数、疑点率、各大类分布、国别疑点、接口上传占比、每日趋势。',
    fields: [
      { name: 'org', type: 'string', desc: '子公司（区域视角）或区域（集团视角）' },
      { name: 'batches / total / suspicious', type: 'number', desc: '批次数、核查笔数、疑点笔数' },
      { name: 'byMajor', type: '大类 → 笔数', desc: '各大类疑点（国别为一个大类）' },
      { name: 'api', type: 'number', desc: '接口上传（RPA）批次数' },
      { name: 'daily[]', type: '{ date, total, suspicious }', desc: '每日趋势' },
    ],
  },
];

export const DATA_OBJECTS: Record<DataKey, DataObj> = Object.fromEntries(D.map((d) => [d.key, d])) as Record<DataKey, DataObj>;
export const DATA_ORDER: DataKey[] = D.map((d) => d.key);
