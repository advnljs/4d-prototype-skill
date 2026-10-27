/**
 * 演示数据的语义归并统计（由虚构单据实时计算，不来自任何真实数据）：
 * 需语义判断的明细行 → 不重复的（类别编码, 用途说明）组合 → 规范化后的组合。
 * 用于“智能体运行设计”页说明：语义判断的工作量取决于组合数而不是笔数。
 */
import type { BizType } from '@/domain/docs';
import { semanticKey } from '@/rules/engine';
import { mockLedger } from './ledger';

export interface SemanticStats {
  rows: number;
  txLines: number;
  uniqueRaw: number;
  uniqueNormalized: number;
}

let cache: SemanticStats | null = null;

export function demoSemanticStats(): SemanticStats {
  if (cache) return cache;
  const recs = (['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b));
  const lines = recs.flatMap((r) =>
    [
      [r.f.code1, r.f.remark1],
      [r.f.code2, r.f.remark2],
    ].filter(([c, m]) => c || m),
  );
  cache = {
    rows: recs.length,
    txLines: lines.length,
    uniqueRaw: new Set(lines.map(([c, m]) => `${c}|${m}`)).size,
    uniqueNormalized: new Set(lines.map(([c, m]) => semanticKey(c, m))).size,
  };
  return cache;
}
