import { DEMO_DATA_VERSION, createStore, useStore } from '@/lib/store';
import { semanticKey } from '@/rules/engine';
import type { Finding, RecordResult } from '@/rules/types';

/**
 * 判例库：子公司复核岗对疑点的人工结论（确认疑点 / 判定误报）。
 * 正式方案中按（类别编码, 规范化用途说明）回流判定缓存，下次同类用途说明直接复用，并作为提示词中的示例；
 * 原型只保存编码与规范化用途说明，不保存客商名称等敏感字段。
 */
export interface CaseEntry {
  id: string;
  at: string;
  who: string;
  docNo: string;
  ruleId: string;
  ruleName: string;
  decision: 'confirm' | 'reject';
  /** 语义组合：类别编码|规范化用途说明 */
  key: string;
}

const SEED: CaseEntry[] = [
  { id: 'c-seed-1', at: '2026-10-13 15:02', who: '刘洋（F0021602）', docNo: 'SK110102202610120007', ruleId: 'R101', ruleName: '类别编码与用途说明不匹配', decision: 'confirm', key: '110100|空运代理费' },
  { id: 'c-seed-2', at: '2026-10-13 11:20', who: '刘洋（F0021602）', docNo: 'FK110102202610120013', ruleId: 'R102', ruleName: '用途说明表述笼统', decision: 'reject', key: '210400|快递费' },
  { id: 'c-seed-3', at: '2026-10-12 16:47', who: '刘洋（F0021602）', docNo: 'SK110102202610090021', ruleId: 'R403', ruleName: '国家/地区与交易对方地址不一致', decision: 'confirm', key: 'R403|SK110102202610090021' },
];

export const casebookStore = createStore<{ cases: CaseEntry[] }>('casebook', () => ({ cases: SEED }), { version: DEMO_DATA_VERSION });

export function useCases() {
  return useStore(casebookStore, (s) => s.cases);
}

export function caseKeyOf(res: RecordResult, f: Pick<Finding, 'ruleId'>) {
  return ['R101', 'R102'].includes(f.ruleId) ? semanticKey(res.rec.f.code1, res.rec.f.remark1) : `${f.ruleId}|${res.rec.f.docNo}`;
}

export function findCase(cases: CaseEntry[], res: RecordResult, ruleId: string) {
  return cases.find((c) => c.docNo === res.rec.f.docNo && c.ruleId === ruleId);
}

export function addCase(res: RecordResult, f: Pick<Finding, 'ruleId' | 'ruleName'>, decision: CaseEntry['decision'], who: string, at: string) {
  const s = casebookStore.get();
  if (findCase(s.cases, res, f.ruleId)) return;
  const entry: CaseEntry = { id: `c-${Date.now()}-${f.ruleId}`, at, who, docNo: res.rec.f.docNo, ruleId: f.ruleId, ruleName: f.ruleName, decision, key: caseKeyOf(res, f) };
  casebookStore.set({ cases: [entry, ...s.cases] });
}
