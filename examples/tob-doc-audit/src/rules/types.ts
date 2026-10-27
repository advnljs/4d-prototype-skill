import type { BizType, DocRecord, FieldKey } from '@/domain/docs';
import type { BatchIndex } from '@/agent/batchCountry';

/** 规则执行方式：确定性规则（代码）/ 智能体语义判断（LLM）/ 规则预筛 + 智能体复核 */
export type Engine = 'code' | 'agent' | 'hybrid';
/** error = 错误数据（疑点）；warn = 疑问数据（需人工确认）——与《资金收付管理制度》的问题分级对应 */
export type Level = 'error' | 'warn';

export const LEVEL_LABEL: Record<Level, string> = { error: '错误数据', warn: '疑问数据' };

/**
 * 规则大类：参照（虚构的）《远帆集团资金收付管理制度（2026 版）》第四章“单据核查要点”的结构
 * （及时性、完整性、准确性下的收付方向、国家/地区、交易对方、币种金额账户、往来类型、款项性质、审批与合同、类别与用途），
 * 按本系统可核查的单据要素归并。
 */
export type MajorKey = 'timeliness' | 'completeness' | 'direction' | 'country' | 'counterparty' | 'amount' | 'subject' | 'payType' | 'approval' | 'codeRemark';

export interface MajorDef {
  key: MajorKey;
  label: string;
  /** 对应《资金收付管理制度》的章节 */
  ref: string;
  desc: string;
}

export const MAJORS: MajorDef[] = [
  { key: 'codeRemark', label: '类别编码与用途说明', ref: '第四章（十）类别与用途核查', desc: '类别编码与用途说明描述的交易性质是否一致、用途说明是否规范；口径参照《单据填写规范与常见问题手册（2025 版）》各章节示例。' },
  { key: 'country', label: '国家/地区', ref: '第四章（二）国家/地区核查', desc: '境外往来国家/地区不应为中国、与对方地址一致；同一批次内同一境外交易对方的国家/地区应唯一（三类单据合并核查）。' },
  { key: 'amount', label: '币种、金额及账户', ref: '第四章（四）币种、金额及账户核查', desc: '金额勾稽是否平衡、币种是否一致、金额与账户是否对应。' },
  { key: 'completeness', label: '完整性', ref: '第三章 单据完整性要求', desc: '类别编码、用途说明、交易对方、国家/地区、发票号等要素是否填写完整。' },
  { key: 'payType', label: '款项性质与结算方式', ref: '第四章（六）结算方式、（七）款项性质核查', desc: '预收预付、到货付款、退款等款项性质与用途说明、编码、交货日期是否一致。' },
  { key: 'counterparty', label: '交易对方', ref: '第四章（三）交易对方核查', desc: '集团关联方往来的用途说明格式是否规范。' },
  { key: 'direction', label: '收付方向', ref: '第四章（一）收付方向核查', desc: '收款单 / 付款单与用途说明描述的资金方向是否一致。' },
  { key: 'subject', label: '往来类型', ref: '第四章（五）往来类型核查', desc: '往来类型与交易对方（是否集团关联方）、类别编码是否一致。' },
  { key: 'approval', label: '审批与合同', ref: '第五章 授权审批', desc: '大额收付是否具备审批单号、合同号等授权与依据。' },
  { key: 'timeliness', label: '及时性', ref: '第二章 单据及时性要求', desc: '是否在规定时限内完成单据录入。' },
];

export const MAJOR_LABEL = Object.fromEntries(MAJORS.map((m) => [m.key, m.label])) as Record<MajorKey, string>;

/** 规则依据：资金收付管理制度条款号、单据填写规范手册章节或区域要求 */
export interface RuleRef {
  doc: 'policy' | 'manual' | 'local' | 'guide';
  no?: string;
  title: string;
}

export const REF_DOC_LABEL: Record<RuleRef['doc'], string> = {
  policy: '资金收付管理制度（2026 版）',
  manual: '单据填写规范手册（2025 版）',
  local: '区域要求',
  guide: '财务操作指引',
};

/** 智能体推理轨迹的一步 */
export type StepKind = 'perceive' | 'tool' | 'retrieve' | 'reason' | 'verdict' | 'reflect' | 'cache';

export interface TraceStep {
  kind: StepKind;
  title: string;
  text?: string;
  io?: { label: string; value: string }[];
  /** 模拟耗时（毫秒）与 token 消耗，仅用于演示成本量级 */
  ms?: number;
  tokens?: number;
}

export type Verdict = 'pass' | 'warn' | 'fail' | 'skip';

export interface Judgement {
  verdict: Verdict;
  confidence?: number;
  message?: string;
  suggestion?: string;
  /** 涉及的字段，用于在单据视图中高亮 */
  fields?: FieldKey[];
  steps?: TraceStep[];
  /** 预筛命中但智能体判定为非疑点时的说明（误报拦截） */
  cleared?: string;
}

export interface RuleParam {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface CheckContext {
  today: Date;
  /** ruleId → 参数键 → 值（各组织规则库独立维护） */
  params: Record<string, Record<string, number | string>>;
  /** 战略项目主体（本方主体代码；由区域维护名单） */
  projectEntities: Set<string>;
  /** 批次级索引（同一批次内三类单据合并）：同一境外交易对方的国家/地区分布等，供批次级规则使用 */
  batch?: BatchIndex;
}

export interface RuleDef {
  id: string;
  /** 规则名称，同时作为导出文件中的“疑点类型” */
  name: string;
  major: MajorKey;
  engine: Engine;
  level: Level;
  /** 刚性规则：集团统一口径，区域不可停用 */
  rigid: boolean;
  biz: BizType[];
  owner: string;
  desc: string;
  basis: string;
  refs: RuleRef[];
  /** 批次级规则：需要整批数据（三类单据合并）才能判断 */
  batchLevel?: boolean;
  /** AI 生成的规则逻辑（DSL 伪代码，供审核） */
  logic: string;
  params?: RuleParam[];
  version: string;
  updatedAt: string;
  updatedBy: string;
  check: (rec: DocRecord, ctx: CheckContext, trace: boolean) => Judgement;
}

export interface Finding {
  ruleId: string;
  ruleName: string;
  major: MajorKey;
  level: Level;
  engine: Engine;
  message: string;
  suggestion?: string;
  confidence?: number;
  fields: FieldKey[];
}

export interface RecordResult {
  rec: DocRecord;
  findings: Finding[];
  /** fail = 疑点；warn = 仅有需人工确认的提示；pass = 合规 */
  status: 'pass' | 'warn' | 'fail';
  /** 智能体复核后排除的规则（预筛命中但判定为非疑点），用于展示“误报拦截” */
  cleared: { ruleId: string; reason: string }[];
}
