/**
 * 批次级国家/地区一致性索引（《资金收付管理制度》4.2.3：交易对方名称相同但国家/地区不同，三类单据合并核查）。
 * 同一批次内（收款单 / 付款单 / 进口结算单三类合并），同一境外交易对方对应的国家/地区应唯一：
 * - 名称完全相同：确定性统计各国别笔数（R405）；
 * - 名称相近：清洗 → 相似度聚类 → 智能体否决误合并（含地区限定词的子公司、通用名称）（R406）；
 * - 跨境电商 / 支付平台按站点在多国收付，国别不唯一属正常，由智能体复核排除（误报拦截）。
 * 只统计境外往来（往来类型 1、3）且国家/地区已填写、不为 CHN / ZZZ 的记录（这两种情况由 R401 / R407 单独处理）。
 */
import type { DocRecord } from '@/domain/docs';
import { cleanName, similarity } from '@/domain/names';

export const SIM_THRESHOLD = 0.85;

const REGION_TOKENS = ['MALAYSIA', 'VIETNAM', 'HK', 'HONG', 'TAIWAN', 'SINGAPORE', 'JAPAN', 'KOREA', 'USA', 'AMERICA', 'EUROPE', 'ASIA', 'INDIA', 'THAILAND', 'INDONESIA', 'GERMANY', 'UK', 'CHINA'];
const GENERIC_TOKENS = new Set(['LIMITED', 'LIABILITY', 'COMPANY', 'TRADING', 'GROUP', 'INTERNATIONAL', 'HOLDINGS', 'GLOBAL', 'CORPORATION', 'ENTERPRISE', 'ENTERPRISES']);
export const PLATFORM_CP_RE = /AMAZON|PAYPAL|EBAY|ALIBABA|ALIEXPRESS|SHOPEE|STRIPE|PAYONEER|亚马逊/;

/** 规范化原始名称（只统一大小写与空白，保留地址等其余内容）：用于“名称完全相同”的判断 */
export function normName(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

export interface MergeNote {
  a: string;
  b: string;
  sim: number;
  decision: 'merge' | 'keep-apart';
  reason: string;
}

export interface CpGroup {
  id: string;
  /** 代表名称（清洗后） */
  name: string;
  /** 组内不同的原始名称（规范化后）→ 国别 → 记录 key */
  variants: { raw: string; cleaned: string; countries: Record<string, string[]> }[];
  /** 国别分布（按笔数降序） */
  countries: [string, number][];
  total: number;
  /** 多数国别；平局为 null */
  majority: string | null;
  /** 智能体复核排除：平台按站点多国收付 / 名称无识别性 */
  exclude?: { kind: 'platform' | 'generic'; reason: string };
}

export interface BatchIndex {
  records: number;
  /** 参与统计的记录数（境外往来、国家/地区有效） */
  counted: number;
  /** 规范化原名 → 国别 → 记录 key */
  exact: Map<string, Record<string, string[]>>;
  /** 清洗后名称 → 所属组 */
  groupOf: Map<string, CpGroup>;
  groups: CpGroup[];
  merges: MergeNote[];
}

export function countsOf(dist: Record<string, string[]>): [string, number][] {
  return Object.entries(dist)
    .map(([c, ks]) => [c, ks.length] as [string, number])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function majorityOf(counts: [string, number][]): string | null {
  if (!counts.length) return null;
  if (counts.length > 1 && counts[0][1] === counts[1][1]) return null;
  return counts[0][0];
}

/** 参与国别一致性统计的记录 */
export function countable(rec: DocRecord) {
  return ['1', '3'].includes(rec.f.tradeType) && !!rec.f.counterparty.trim() && !!rec.f.country && rec.f.country !== 'CHN' && rec.f.country !== 'ZZZ';
}

export function buildBatchIndex(records: DocRecord[], threshold = SIM_THRESHOLD): BatchIndex {
  const exact = new Map<string, Record<string, string[]>>();
  const cleanedOf = new Map<string, string>();
  let counted = 0;
  for (const r of records) {
    if (!countable(r)) continue;
    counted++;
    const k = normName(r.f.counterparty);
    const d = exact.get(k) ?? {};
    (d[r.f.country] ??= []).push(r.key);
    exact.set(k, d);
    if (!cleanedOf.has(k)) cleanedOf.set(k, cleanName(r.f.counterparty));
  }
  // 清洗后同名先归并，再做相似度聚类；智能体否决“含地区限定词”的合并（集团在当地的子公司是不同主体）
  const byCleaned = new Map<string, string[]>();
  for (const [raw, c] of cleanedOf) byCleaned.set(c.replace(/\s/g, ''), [...(byCleaned.get(c.replace(/\s/g, '')) ?? []), raw]);
  const keys = [...byCleaned.keys()];
  const parent = keys.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const merges: MergeNote[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = cleanedOf.get(byCleaned.get(keys[i])![0])!;
      const b = cleanedOf.get(byCleaned.get(keys[j])![0])!;
      const sim = similarity(a, b);
      if (sim < threshold) continue;
      const ta = new Set(a.split(' '));
      const tb = new Set(b.split(' '));
      const extra = [...ta].filter((t) => !tb.has(t)).concat([...tb].filter((t) => !ta.has(t)));
      const region = extra.find((t) => REGION_TOKENS.includes(t));
      if (region) {
        merges.push({ a, b, sim, decision: 'keep-apart', reason: `字面相似度 ${sim.toFixed(2)} 超过阈值，但一方含地区限定词“${region}”，通常是集团在当地的子公司，属于不同境外主体，不合并。` });
        continue;
      }
      merges.push({ a, b, sim, decision: 'merge', reason: extra.length ? `差异仅为“${extra.join('、')}”（单复数 / 拼写差异），判定为同一交易对方。` : '仅空格、标点或地址差异，判定为同一交易对方。' });
      parent[find(j)] = find(i);
    }
  }
  const rootsToRaws = new Map<number, string[]>();
  keys.forEach((k, i) => rootsToRaws.set(find(i), [...(rootsToRaws.get(find(i)) ?? []), ...byCleaned.get(k)!]));
  const groups: CpGroup[] = [];
  const groupOf = new Map<string, CpGroup>();
  let n = 0;
  for (const raws of rootsToRaws.values()) {
    const variants = raws.map((raw) => ({ raw, cleaned: cleanedOf.get(raw)!, countries: exact.get(raw)! }));
    const dist: Record<string, string[]> = {};
    variants.forEach((v) => Object.entries(v.countries).forEach(([c, ks]) => (dist[c] = [...(dist[c] ?? []), ...ks])));
    const counts = countsOf(dist);
    const name = [...variants].sort((a, b) => Object.values(b.countries).flat().length - Object.values(a.countries).flat().length)[0].cleaned;
    const g: CpGroup = { id: `g${n++}`, name, variants, countries: counts, total: counts.reduce((s, [, x]) => s + x, 0), majority: majorityOf(counts) };
    if (raws.some((r) => PLATFORM_CP_RE.test(r))) g.exclude = { kind: 'platform', reason: '交易对方为跨境电商 / 支付平台，按站点在多个国家（地区）收付款，同一名称对应多个国别属正常，不适用“国家/地区唯一”。' };
    else if (name.split(' ').every((t) => GENERIC_TOKENS.has(t))) g.exclude = { kind: 'generic', reason: `名称“${name}”只有法律形式或通用词，不能唯一识别交易对方，不做国家/地区一致性判断。` };
    groups.push(g);
    variants.forEach((v) => groupOf.set(v.cleaned, g));
  }
  return { records: records.length, counted, exact, groupOf, groups, merges };
}

/** 本批次中国家/地区不唯一的交易对方（导出“国别疑点”工作表、在线查看国家/地区大类时使用） */
export function inconsistentGroups(idx: BatchIndex) {
  return idx.groups.filter((g) => g.countries.length > 1 && !g.exclude);
}
