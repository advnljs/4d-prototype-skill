/**
 * 核查结果留存：每次核查（界面上传或 RPA 接口上传）保存为一个批次——批次信息、统计、疑点明细（不含业务原始数据）。
 * 查看范围按统一认证带入的工号确定（系统集成）：子公司岗位看本公司；区域看辖内全部；集团看全集团。
 * 历史批次来自演示种子（mock/batches.ts），按需用初始规则库重算明细；本次会话核查的批次保存在本机浏览器。
 * 正式环境建议落在业务库 doc_check_batch（批次）/ doc_check_finding（疑点明细）。
 */
import { DEMO_DATA_VERSION, createStore, useStore } from '@/lib/store';
import { orgByCode, ruleLibOrgOf, scopeOrgs, type RoleKey } from '@/domain/orgs';
import type { BizType } from '@/domain/docs';
import { inconsistentGroups } from '@/agent/batchCountry';
import { hitsByMajor, runChecks, type CheckRun } from '@/rules/engine';
import type { Level, MajorKey } from '@/rules/types';
import { seedRecords, seedSpecs, type SeedSpec, type UploadSource } from '@/mock/batches';
import { buildContext } from './context';
import { initialLibs, libName, libParams, libRules, versionAt } from './ruleLibs';

export interface FindingRow {
  docNo: string;
  bankRef: string;
  biz: BizType;
  ruleId: string;
  ruleName: string;
  major: MajorKey;
  level: Level;
  message: string;
  suggestion?: string;
  counterparty: string;
  country: string;
}

export interface CheckBatch {
  id: string;
  time: string;
  empNo: string;
  userName: string;
  orgCode: string;
  source: UploadSource;
  fileName: string;
  sheets: { biz: BizType; rows: number }[];
  libOrg: string;
  libVersion: string;
  total: number;
  /** 有疑点的记录数（含疑问数据） */
  suspicious: number;
  /** 只有疑问数据的记录数 */
  warnOnly: number;
  byMajor: Partial<Record<MajorKey, number>>;
  /** 有国别疑点的记录数、国别不唯一的交易对方数 */
  countryRecs: number;
  countryCps: number;
  /** 自动导出的结果文件名 */
  reportName: string;
  /** 本机核查的批次保存疑点明细；种子批次按需重算 */
  findings?: FindingRow[];
  seed?: boolean;
}

interface ResultsState {
  batches: CheckBatch[];
  /** 导出文件流水号：key = 前缀-日期-员工号 */
  seq: Record<string, number>;
  /** 批次号流水：key = 日期 */
  batchSeq: Record<string, number>;
}

export const resultsStore = createStore<ResultsState>('results', () => ({ batches: [], seq: {}, batchSeq: {} }), { version: DEMO_DATA_VERSION });

/** 本次会话内的完整核查结果（含原始记录，用于打开单据详情）；刷新即清除，不落地业务数据 */
export const runCache = new Map<string, CheckRun>();

/* ---------------- 编号 ---------------- */

/** 生成导出文件名：前缀-核查日期-员工编号-流水号 */
export function nextFileName(parts: string[], date: string, empNo: string) {
  const key = [...parts, date, empNo].join('-');
  const s = resultsStore.get().seq;
  const n = (s[key] ?? 0) + 1;
  resultsStore.set({ seq: { ...s, [key]: n } });
  return `${key}-${String(n).padStart(3, '0')}.xlsx`;
}

/** 批次号：B + 日期 + 当日流水（演示种子当天已用到 0100 以内，本机从 0101 起） */
export function nextBatchId(date: string) {
  const s = resultsStore.get().batchSeq;
  const n = (s[date] ?? 100) + 1;
  resultsStore.set({ batchSeq: { ...s, [date]: n } });
  return `B${date}-${String(n).padStart(4, '0')}`;
}

/* ---------------- 汇总 ---------------- */

export function findingRows(run: CheckRun): FindingRow[] {
  return run.results.flatMap((r) =>
    r.findings.map((f) => ({
      docNo: r.rec.f.docNo,
      bankRef: r.rec.f.bankRef,
      biz: r.rec.biz,
      ruleId: f.ruleId,
      ruleName: f.ruleName,
      major: f.major,
      level: f.level,
      message: f.message,
      suggestion: f.suggestion,
      counterparty: r.rec.f.counterparty,
      country: r.rec.f.country,
    })),
  );
}

export function summarize(
  meta: Pick<CheckBatch, 'id' | 'time' | 'empNo' | 'userName' | 'orgCode' | 'source' | 'fileName' | 'libOrg' | 'libVersion' | 'reportName'>,
  run: CheckRun,
): CheckBatch {
  const flagged = run.results.filter((r) => r.findings.length);
  const bizs = (['receipt', 'payment', 'settlement'] as BizType[]).filter((b) => run.results.some((r) => r.rec.biz === b));
  return {
    ...meta,
    sheets: bizs.map((biz) => ({ biz, rows: run.results.filter((r) => r.rec.biz === biz).length })),
    total: run.results.length,
    suspicious: flagged.length,
    warnOnly: flagged.filter((r) => r.findings.every((f) => f.level === 'warn')).length,
    byMajor: hitsByMajor(run.results),
    countryRecs: run.results.filter((r) => r.findings.some((f) => f.major === 'country')).length,
    countryCps: run.ctx.batch ? inconsistentGroups(run.ctx.batch).length : 0,
  };
}

export function saveBatch(b: CheckBatch, run: CheckRun) {
  runCache.set(b.id, run);
  resultsStore.set((s) => ({ batches: [{ ...b, findings: findingRows(run) }, ...s.batches] }));
}

/* ---------------- 演示种子 ---------------- */

let seeds: CheckBatch[] | null = null;
const specById = new Map<string, SeedSpec>();

function runSeed(spec: SeedSpec): { run: CheckRun; libOrg: string } {
  const libOrg = ruleLibOrgOf(spec.empNo) ?? '100000';
  const lib = initialLibs()[libOrg];
  return { run: runChecks(seedRecords(spec), libRules(lib), buildContext(libParams(lib))), libOrg };
}

/** 历史种子批次（首次访问时计算，约一万余笔，耗时约数百毫秒） */
export function seedBatches(): CheckBatch[] {
  if (seeds) return seeds;
  seeds = seedSpecs().map((spec) => {
    specById.set(spec.id, spec);
    const { run, libOrg } = runSeed(spec);
    const lib = initialLibs()[libOrg];
    const date = spec.time.slice(0, 10).replace(/-/g, '');
    return {
      ...summarize(
        {
          id: spec.id,
          time: spec.time,
          empNo: spec.empNo,
          userName: spec.userName,
          orgCode: spec.orgCode,
          source: spec.source,
          fileName: spec.fileName,
          libOrg,
          libVersion: versionAt(lib, spec.time),
          reportName: `核查结果-${date}-${spec.empNo}-${spec.id.slice(-3)}.xlsx`,
        },
        run,
      ),
      seed: true,
    };
  });
  return seeds;
}

/** 批次明细：本次会话核查的用缓存；种子批次重算（结果与列表统计一致） */
export function batchRun(b: CheckBatch): CheckRun | undefined {
  const hit = runCache.get(b.id);
  if (hit) return hit;
  if (!b.seed) return undefined;
  const spec = specById.get(b.id);
  if (!spec) return undefined;
  const { run } = runSeed(spec);
  runCache.set(b.id, run);
  return run;
}

export function batchFindings(b: CheckBatch): FindingRow[] {
  if (b.findings) return b.findings;
  const run = batchRun(b);
  return run ? findingRows(run) : [];
}

/* ---------------- 查询 ---------------- */

export function useAllBatches(): CheckBatch[] {
  const mine = useStore(resultsStore, (s) => s.batches);
  return [...mine, ...seedBatches()];
}

/** 当前用户可见的批次（按组织范围过滤） */
export function visibleBatches(all: CheckBatch[], user: { role: RoleKey; orgCode: string }) {
  const scope = new Set(scopeOrgs(user));
  return all.filter((b) => scope.has(b.orgCode));
}

export function orgLabel(code: string) {
  return orgByCode(code)?.name ?? code;
}

export function libLabelOf(b: CheckBatch) {
  return `${libName(b.libOrg)} ${b.libVersion}`;
}
