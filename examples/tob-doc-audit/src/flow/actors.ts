import type { IconName } from '@/components/ui/Icon';

/**
 * 操作方（谁在做这一步）。
 * 与“执行方式”（确定性规则 / 智能体）是两个维度：同一个“后台批量”任务里既有代码规则也有智能体调用。
 * 人工岗位与系统权限一致：集团财务管理员、区域财务管理员（维护规则库 + 一键核查）；子公司财务核查岗、复核岗（一键核查）。
 */
export type ActorKey = 'portal' | 'checker' | 'reviewer' | 'tier2' | 'tier1' | 'rpa' | 'batch' | 'agent';

export interface ActorDef {
  key: ActorKey;
  label: string;
  short: string;
  icon: IconName;
  kind: '外部' | '人工' | '机器';
  desc: string;
  /** CSS 颜色（token），用于圆点、泳道边线 */
  color: string;
}

export const ACTORS: Record<ActorKey, ActorDef> = {
  portal: { key: 'portal', label: '外部平台', short: '外部平台', icon: 'globe', kind: '外部', desc: '供应商协同平台：供应商在此提交付款申请，是 RPA 读取待付款申请的来源（原型中为模拟）', color: 'var(--color-act-portal)' },
  checker: { key: 'checker', label: '子公司财务核查岗', short: '核查岗', icon: 'user', kind: '人工', desc: '从 ERP 导出三类单据，界面上传一键核查，导出疑点整改', color: 'var(--color-act-checker)' },
  reviewer: { key: 'reviewer', label: '子公司财务复核岗', short: '复核岗', icon: 'checkCircle', kind: '人工', desc: '在线查看核查结果，按大类复核疑点：确认疑点 / 判定误报', color: 'var(--color-act-reviewer)' },
  tier2: { key: 'tier2', label: '区域财务管理员', short: '区域', icon: 'users', kind: '人工', desc: '维护本区域规则库（自然语言 + 逐条确认），查看辖内全部结果与驾驶舱', color: 'var(--color-act-tier2)' },
  tier1: { key: 'tier1', label: '集团财务管理员', short: '集团', icon: 'shield', kind: '人工', desc: '维护集团规则库，查看全集团各区域结果与驾驶舱', color: 'var(--color-act-tier1)' },
  rpa: { key: 'rpa', label: 'RPA 机器人', short: 'RPA', icon: 'robot', kind: '机器', desc: '登录供应商协同平台读取待付款申请，整理成付款单 Excel，调用上传接口', color: 'var(--color-act-rpa)' },
  batch: { key: 'batch', label: '后台批量任务', short: '后台批量', icon: 'cpu', kind: '机器', desc: '解析、标准化、确定性规则、批次级统计、归并缓存、自动导出与保存结果', color: 'var(--color-act-batch)' },
  agent: { key: 'agent', label: '智能体（大模型）', short: '智能体', icon: 'sparkle', kind: '机器', desc: '读懂用途说明、地址、名称与制度条文：语义核查、交易对方归并、生成规则库变更', color: 'var(--color-act-agent)' },
};

export const ACTOR_ORDER: ActorKey[] = ['checker', 'reviewer', 'tier2', 'tier1', 'rpa', 'batch', 'agent', 'portal'];
