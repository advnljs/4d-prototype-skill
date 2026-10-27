import type { BizType, DocRecord } from '@/domain/docs';
import { preprocessRemark } from '@/agent/semantic';
import { buildBatchIndex } from '@/agent/batchCountry';
import { hash } from '@/lib/format';
import type { CheckContext, Finding, Judgement, MajorKey, RecordResult, RuleDef } from './types';

/** 适用于某类单据的规则（规则集来自用户所属区域的规则库，三类单据共用同一规则库） */
export function rulesForBiz(rules: RuleDef[], biz: BizType): RuleDef[] {
  return rules.filter((r) => r.biz.includes(biz));
}

function toFinding(rule: RuleDef, j: Judgement): Finding {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    major: rule.major,
    level: j.verdict === 'fail' && rule.level === 'error' ? 'error' : 'warn',
    engine: rule.engine,
    message: j.message ?? rule.name,
    suggestion: j.suggestion,
    confidence: j.confidence,
    fields: j.fields ?? [],
  };
}

export function checkRecord(rec: DocRecord, rules: RuleDef[], ctx: CheckContext): RecordResult {
  const findings: Finding[] = [];
  const cleared: RecordResult['cleared'] = [];
  for (const rule of rules) {
    if (!rule.biz.includes(rec.biz)) continue;
    const j = rule.check(rec, ctx, false);
    if (j.verdict === 'fail' || j.verdict === 'warn') findings.push(toFinding(rule, j));
    else if (j.cleared) cleared.push({ ruleId: rule.id, reason: j.cleared });
  }
  const status = findings.some((f) => f.level === 'error') ? 'fail' : findings.length ? 'warn' : 'pass';
  return { rec, findings, status, cleared };
}

/** 单条规则带推理轨迹地重新执行（用于详情抽屉） */
export function traceRule(rec: DocRecord, rule: RuleDef, ctx: CheckContext): Judgement {
  return rule.check(rec, ctx, true);
}

export interface RunStats {
  total: number;
  suspicious: number;
  failCount: number;
  warnCount: number;
  passCount: number;
  ruleHits: Record<string, number>;
  /** 各执行方式的规则调用次数（不含不适用） */
  evals: { code: number; agent: number; hybridPrefilter: number; hybridAgent: number };
  /** 语义归并：需要语义判断的（编码, 用途说明）组合 */
  semantic: { lines: number; uniqueCombos: number; cacheHits: number; llmCalls: number };
  cleared: number;
  /** 模拟耗时（毫秒）：逐笔在线 vs 批量 */
  estMs: { online: number; batch: number };
  /** 模拟 token 消耗 */
  estTokens: { online: number; batch: number };
}

export interface CheckRun {
  results: RecordResult[];
  stats: RunStats;
  rules: RuleDef[];
  /** 本次核查使用的上下文（含批次级索引），详情抽屉重算推理轨迹时使用 */
  ctx: CheckContext;
}

/** 整批核查的上下文：规则集含批次级规则时，先对三类单据合并建立批次索引 */
export function batchContext(records: DocRecord[], rules: RuleDef[], ctx: CheckContext): CheckContext {
  if (ctx.batch || !rules.some((r) => r.batchLevel)) return ctx;
  return { ...ctx, batch: buildBatchIndex(records, Number(ctx.params.R406?.sim ?? 0.85)) };
}

/**
 * 语义缓存命中模拟：真实方案中“（编码, 规范化用途说明）→ 判定”缓存跨天复用。
 * 原型按组合哈希给出可复现的命中结果，命中率参数化。
 */
export function isCacheHit(key: string, rate: number) {
  return hash(key) % 100 < rate * 100;
}

export function semanticKey(code: string, remark: string) {
  return `${code}|${preprocessRemark(remark).cleaned}`;
}

const TOKENS_PER_CALL = 820; // 单次语义判断（提示词 + 输出）平均 token，原型估算值
const MS_PER_CALL = 1600; // 单次大模型调用平均耗时
const BATCH_CONCURRENCY = 8;

export function runChecks(records: DocRecord[], rules: RuleDef[], baseCtx: CheckContext, cacheRate = 0.72): CheckRun {
  const ctx = batchContext(records, rules, baseCtx);
  const results = records.map((r) => checkRecord(r, rules, ctx));
  const ruleHits: Record<string, number> = {};
  const evals = { code: 0, agent: 0, hybridPrefilter: 0, hybridAgent: 0 };
  let cleared = 0;
  for (const res of results) {
    for (const f of res.findings) ruleHits[f.ruleId] = (ruleHits[f.ruleId] ?? 0) + 1;
    cleared += res.cleared.length;
  }
  // 规则调用次数：按适用记录数估算（不重复执行，避免二次开销）
  for (const rule of rules) {
    const n = records.filter((r) => rule.biz.includes(r.biz)).length;
    if (rule.engine === 'code') evals.code += n;
    else if (rule.engine === 'agent') evals.agent += n;
    else {
      evals.hybridPrefilter += n;
      evals.hybridAgent += ruleHits[rule.id] ?? 0;
    }
  }
  // 语义归并
  const combos = new Set<string>();
  let lines = 0;
  const usesSemantic = rules.some((r) => r.engine !== 'code');
  if (usesSemantic) {
    for (const r of records) {
      for (const [c, m] of [
        [r.f.code1, r.f.remark1],
        [r.f.code2, r.f.remark2],
      ]) {
        if (!c && !m) continue;
        lines++;
        combos.add(semanticKey(c, m));
      }
    }
  }
  let cacheHits = 0;
  combos.forEach((k) => isCacheHit(k, cacheRate) && cacheHits++);
  // 国别、用途说明、性质复核等不可归并的语义判断按记录计
  const perRecordAgent =
    rules.filter((r) => r.engine === 'agent' && !['R101', 'R102'].includes(r.id)).length * records.length + evals.hybridAgent;
  const llmCallsBatch = combos.size - cacheHits + Math.ceil(perRecordAgent * 0.15); // 国别等判断 85% 可由确定性线索直接得出
  const llmCallsOnline = lines + perRecordAgent;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const warnCount = results.filter((r) => r.status === 'warn').length;
  return {
    results,
    rules,
    ctx,
    stats: {
      total: records.length,
      suspicious: failCount + warnCount,
      failCount,
      warnCount,
      passCount: records.length - failCount - warnCount,
      ruleHits,
      evals,
      semantic: { lines, uniqueCombos: combos.size, cacheHits, llmCalls: Math.max(0, llmCallsBatch) },
      cleared,
      estMs: {
        online: llmCallsOnline * MS_PER_CALL,
        batch: Math.ceil(Math.max(0, llmCallsBatch) / BATCH_CONCURRENCY) * MS_PER_CALL + records.length * 2,
      },
      estTokens: { online: llmCallsOnline * TOKENS_PER_CALL, batch: Math.max(0, llmCallsBatch) * TOKENS_PER_CALL },
    },
  };
}

/** 导出用的“疑点类型”文本 */
export function suspicionLabel(res: RecordResult) {
  return res.findings.map((f) => (f.level === 'warn' ? `${f.ruleName}（需人工确认）` : f.ruleName)).join('；');
}

export function suspicionDetail(res: RecordResult) {
  return res.findings.map((f) => `${f.message}${f.suggestion ? `建议：${f.suggestion}。` : ''}`).join('\n');
}

/** 按大类统计疑点（每笔记录在每个大类最多计一次） */
export function hitsByMajor(results: RecordResult[]): Record<MajorKey, number> {
  const out = {} as Record<MajorKey, number>;
  for (const r of results) for (const m of new Set(r.findings.map((f) => f.major))) out[m] = (out[m] ?? 0) + 1;
  return out;
}
