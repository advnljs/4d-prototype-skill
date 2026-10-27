/**
 * 核查流水线阶段（用于可视化）。
 * 同一份核查结果，按“批量（推荐）”或“逐笔在线”两种运行方式展示不同的执行过程与成本，
 * 帮助业务理解为什么智能体适合离线跑批。
 */
import { BIZ_SHEET, inferValueDate, isRelatedParty, type BizType } from '@/domain/docs';
import type { CheckRun } from '@/rules/engine';
import type { ActorKey } from '@/flow/actors';
import type { RecordResult } from '@/rules/types';
import { fmtInt } from '@/lib/format';
import { inconsistentGroups } from './batchCountry';

export type RunMode = 'batch' | 'online';

export interface Stage {
  key: string;
  title: string;
  engine: 'code' | 'agent' | 'mixed' | 'rpa';
  /** 操作方：谁在执行这一阶段（与执行方式是两个维度） */
  actor?: ActorKey;
  summary: string;
  lines: string[];
  /** 演示时长（毫秒），与真实耗时无关 */
  ms: number;
  /** 估算的真实耗时文本 */
  real?: string;
  skipped?: boolean;
}

export function fmtDuration(ms: number) {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} 毫秒`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)} 秒`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  if (m < 60) return `${m} 分 ${r} 秒`;
  return `${Math.floor(m / 60)} 小时 ${m % 60} 分`;
}

export interface ParseMeta {
  fileName: string;
  source: 'ui' | 'api';
  sheets: { name: string; biz: BizType; matched: number; totalCols: number; rows: number }[];
  skipped: string[];
}

export function parseStage(m: ParseMeta): Stage {
  const rows = m.sheets.reduce((s, x) => s + x.rows, 0);
  return {
    key: 'parse',
    title: m.source === 'api' ? '接收接口上传并解析' : '文件解析与格式校验',
    engine: 'code',
    actor: 'batch',
    summary: `${m.sheets.length} 类单据，${fmtInt(rows)} 行`,
    lines: [
      m.source === 'api' ? `接口 POST /doc-audit/api/v1/batches 收到 RPA 上传的“${m.fileName}”` : `读取文件“${m.fileName}”`,
      ...m.sheets.map((x) => `工作表“${x.name}”→ ${BIZ_SHEET[x.biz]}：表头 ${x.matched}/${x.totalCols} 列一致，${fmtInt(x.rows)} 行`),
      ...m.skipped.map((x) => `跳过：${x}`),
    ],
    ms: 900,
  };
}

export interface CheckStageOpts {
  /** 用户工号与所属组织 → 规则库 */
  empNo: string;
  userOrg: string;
  libLabel: string;
  mode: RunMode;
  reportName: string;
  batchId: string;
}

export function checkStages(run: CheckRun, opts: CheckStageOpts): Stage[] {
  const { stats, rules, results } = run;
  const n = stats.total;
  const recs = results.map((r) => r.rec);
  const inferred = recs.filter((r) => inferValueDate(r.f.bankRef)).length;
  const related = recs.filter((r) => isRelatedParty(r.f.counterparty)).length;
  const overseas = recs.filter((r) => r.f.tradeType === '1').length;
  const codeRules = rules.filter((r) => r.engine === 'code' && !r.batchLevel);
  const agentRules = rules.filter((r) => r.engine === 'agent' && !r.batchLevel);
  const hybridRules = rules.filter((r) => r.engine === 'hybrid' && !r.batchLevel);
  const batchRules = rules.filter((r) => r.batchLevel);
  const codeHits = sumHits(results, (f) => f.engine === 'code' && f.major !== 'country');
  const agentHits = sumHits(results, (f) => f.engine !== 'code' && f.major !== 'country');
  const countryHits = sumHits(results, (f) => f.major === 'country');
  const idx = run.ctx.batch;
  const bad = idx ? inconsistentGroups(idx) : [];
  const excluded = idx ? idx.groups.filter((g) => g.exclude && g.countries.length > 1) : [];
  const vetoes = idx ? idx.merges.filter((m) => m.decision === 'keep-apart').length : 0;
  const batch = opts.mode === 'batch';
  const calls = batch ? stats.semantic.llmCalls : stats.estTokens.online / 820;
  const tokens = batch ? stats.estTokens.batch : stats.estTokens.online;
  const realAgentMs = batch ? stats.estMs.batch : stats.estMs.online;
  const bizs = [...new Set(recs.map((r) => r.biz))].map((b) => BIZ_SHEET[b]);
  return [
    {
      key: 'normalize',
      actor: 'batch',
      title: '数据标准化（三类合并为一批）',
      engine: 'code',
      summary: `${fmtInt(n)} 笔单据记录`,
      lines: [`${bizs.join('、')}三类表的不同列名映射为统一的逻辑字段，合并成一个批次 ${fmtInt(n)} 笔`, `由银行流水号推断到账日期 ${fmtInt(inferred)} 笔`, `往来类型：境外客商 ${fmtInt(overseas)} 笔；按关联方名单识别集团关联方 ${fmtInt(related)} 笔`],
      ms: 700,
      real: fmtDuration(n * 0.05 + 20),
    },
    {
      key: 'load',
      actor: 'batch',
      title: '按工号匹配区域规则库',
      engine: 'code',
      summary: opts.libLabel,
      lines: [
        `统一认证工号 ${opts.empNo} → doc_user_org → 所属组织 ${opts.userOrg}`,
        `装载“${opts.libLabel}”：启用 ${rules.length} 条（三类单据共用同一规则库，按适用范围执行）`,
        `确定性 ${codeRules.length}、智能体 ${agentRules.length}、规则预筛 + 智能体复核 ${hybridRules.length}、批次级 ${batchRules.length}`,
      ],
      ms: 700,
      real: '约 50 毫秒',
    },
    {
      key: 'code',
      actor: 'batch',
      title: '确定性规则执行',
      engine: 'code',
      summary: `命中 ${fmtInt(codeHits)} 项`,
      lines: [`执行 ${codeRules.length + hybridRules.length} 条确定性规则 / 预筛 × ${fmtInt(n)} 笔`, `命中 ${fmtInt(codeHits)} 项（完整性、金额勾稽、款项性质、往来类型、审批、区域规则等）`, '确定性规则结论直接采纳，不调用大模型'],
      ms: 1000,
      real: fmtDuration(n * (codeRules.length + hybridRules.length) * 0.004 + 30),
    },
    {
      key: 'country',
      actor: 'agent',
      title: '批次级国别一致性',
      engine: 'mixed',
      summary: idx ? `${fmtInt(idx.groups.length)} 个交易对方，${bad.length} 个国别不唯一` : '规则库未启用',
      lines: idx
        ? [
            `三类单据合并统计：境外往来记录 ${fmtInt(idx.counted)} 笔，交易对方 ${fmtInt(idx.groups.length)} 个（名称清洗 + 相似度归并）`,
            `国别不唯一 ${bad.length} 个${bad.length ? `：${bad.slice(0, 3).map((g) => g.name).join('、')}${bad.length > 3 ? ' 等' : ''}` : ''}`,
            `智能体否决误合并 ${vetoes} 处（含地区限定词的子公司）；平台类排除 ${excluded.length} 个`,
            `国别大类共命中 ${fmtInt(countryHits)} 项（含国别为中国 / ZZZ、与地址不一致）`,
          ]
        : ['本区域规则库未启用批次级国别规则'],
      ms: 1300,
      real: '约 0.2 秒',
    },
    {
      key: 'dedupe',
      actor: 'batch',
      title: '语义归并与缓存',
      engine: 'code',
      summary: batch ? `${fmtInt(stats.semantic.lines)} 行 → ${fmtInt(stats.semantic.uniqueCombos)} 组合` : '逐笔模式未启用',
      lines: batch
        ? [
            `需语义判断的交易行 ${fmtInt(stats.semantic.lines)} 行`,
            `按（类别编码, 规范化用途说明）归并为 ${fmtInt(stats.semantic.uniqueCombos)} 个不重复组合（${Math.round((stats.semantic.uniqueCombos / Math.max(1, stats.semantic.lines)) * 100)}%）`,
            `命中历史判定缓存 ${fmtInt(stats.semantic.cacheHits)} 个，直接复用已确认结论`,
          ]
        : ['逐笔在线模式：每一笔、每一条语义规则都单独调用一次大模型，不做归并与缓存'],
      ms: batch ? 1100 : 500,
      skipped: !batch,
      real: batch ? '约 0.3 秒' : undefined,
    },
    {
      key: 'agent',
      actor: 'agent',
      title: '智能体语义核查',
      engine: 'agent',
      summary: `调用 ${fmtInt(Math.round(calls))} 次，命中 ${fmtInt(agentHits)} 项`,
      lines: [
        `大模型调用 ${fmtInt(Math.round(calls))} 次${batch ? '（批量接口，并发 8）' : '（逐笔串行）'}，约 ${fmtInt(tokens)} tokens`,
        `涉及规则：${[...agentRules, ...hybridRules].map((r) => r.name).join('、')}`,
        `命中 ${fmtInt(agentHits)} 项；每项均输出推理轨迹与置信度`,
      ],
      ms: batch ? 2800 : 6000,
      real: fmtDuration(realAgentMs),
    },
    {
      key: 'review',
      actor: 'agent',
      title: '结果复核与汇总',
      engine: 'mixed',
      summary: `疑点 ${fmtInt(stats.failCount)}，疑问 ${fmtInt(stats.warnCount)}`,
      lines: [`合并同一笔记录的多项疑点，按大类与规则类别排序`, `智能体自检：拦截预筛误报 ${fmtInt(stats.cleared)} 项`, `错误数据 ${fmtInt(stats.failCount)} 笔，疑问数据 ${fmtInt(stats.warnCount)} 笔，通过 ${fmtInt(stats.passCount)} 笔`],
      ms: 900,
      real: '约 0.1 秒',
    },
    {
      key: 'report',
      actor: 'batch',
      title: '自动导出 Excel 并保存结果',
      engine: 'code',
      summary: opts.batchId,
      lines: [`生成 ${opts.reportName}：${bizs.map((b) => `${b}疑点`).join('、')}、国别疑点（单独工作表）`, `保存批次 ${opts.batchId} 与疑点明细（doc_check_batch / doc_check_finding），本公司、所属区域与集团可查看`],
      ms: 600,
      real: '约 0.2 秒',
    },
  ];
}

function sumHits(results: RecordResult[], pred: (f: RecordResult['findings'][number]) => boolean) {
  let n = 0;
  for (const r of results) for (const f of r.findings) if (pred(f)) n++;
  return n;
}

/** 智能体工作台中滚动展示的判定样例 */
export interface TickerItem {
  key: string;
  docNo: string;
  rule: string;
  text: string;
  verdict: 'fail' | 'warn' | 'cleared';
  confidence?: number;
}

export function tickerItems(results: RecordResult[], limit = 40): TickerItem[] {
  const out: TickerItem[] = [];
  for (const r of results) {
    for (const f of r.findings) {
      if (f.engine === 'code') continue;
      out.push({ key: `${r.rec.key}-${f.ruleId}`, docNo: r.rec.f.docNo, rule: f.ruleName, text: f.suggestion ? `${f.message} ${f.suggestion}` : f.message, verdict: f.level === 'error' ? 'fail' : 'warn', confidence: f.confidence });
    }
    for (const c of r.cleared) out.push({ key: `${r.rec.key}-${c.ruleId}-c`, docNo: r.rec.f.docNo, rule: '误报拦截', text: c.reason, verdict: 'cleared' });
    if (out.length >= limit) break;
  }
  return out;
}
