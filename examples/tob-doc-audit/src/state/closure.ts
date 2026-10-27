import { DEMO_DATA_VERSION, createStore, useStore } from '@/lib/store';
import { MAJOR_LABEL, type RecordResult } from '@/rules/types';
import type { CaseEntry } from './casebook';

/**
 * 闭环：核查结论怎样落到业务里——
 * - 接口上传（RPA）：结果逐笔回写供应商协同平台，有疑点的付款申请挂起，其余放行；
 * - 复核确认的疑点：核查岗在 ERP 整改并登记，驾驶舱统计整改率。
 */

/* ---------------- 回写协同平台 ---------------- */

export interface WritebackItem {
  applyNo: string;
  payee: string;
  amount: string;
  currency: string;
  action: 'HOLD' | 'RELEASE';
  reason: string;
}

export const WRITEBACK_LABEL: Record<WritebackItem['action'], string> = { HOLD: '挂起', RELEASE: '放行' };

/** 由接口批次的核查结果确定性地生成回写报文：疑点（fail）挂起并附第一条疑点的大类与规则，其余（含仅需人工确认的提示）放行 */
export function writebackOf(results: RecordResult[]): WritebackItem[] {
  return results.map((r) => {
    const f = r.findings.find((x) => x.level === 'error') ?? r.findings[0];
    return {
      applyNo: r.rec.f.docNo || r.rec.key,
      payee: r.rec.f.counterparty || r.rec.f.domesticName || '—',
      amount: r.rec.f.amount,
      currency: r.rec.f.currency,
      action: r.status === 'fail' ? 'HOLD' : 'RELEASE',
      reason: r.status === 'fail' && f ? `${MAJOR_LABEL[f.major]}：${f.ruleName}` : '',
    };
  });
}

/* ---------------- 疑点整改 ---------------- */

export interface RectifyEntry {
  caseId: string;
  docNo: string;
  ruleId: string;
  ruleName: string;
  action: string;
  who: string;
  at: string;
}

/** 按规则给出整改动作（原型口径，见 C-14） */
export function rectifyActionOf(ruleId: string) {
  if (ruleId.startsWith('R4')) return '已在 ERP 更正交易对方国家/地区，重新提交';
  if (ruleId === 'R101') return '已更正类别编码，重新提交';
  if (ruleId === 'R102') return '已补充用途说明（合同号与服务内容）';
  return '已在 ERP 更正单据并重新提交';
}

const SEED: RectifyEntry[] = [{ caseId: 'c-seed-1', docNo: 'SK110102202610120007', ruleId: 'R101', ruleName: '类别编码与用途说明不匹配', action: rectifyActionOf('R101'), who: '周敏（F0021578）', at: '2026-10-13 16:20' }];

export const rectifyStore = createStore<{ items: RectifyEntry[] }>('rectify', () => ({ items: SEED }), { version: DEMO_DATA_VERSION });

export function useRectified() {
  return useStore(rectifyStore, (s) => s.items);
}

export function rectify(c: CaseEntry, who: string, at: string) {
  const s = rectifyStore.get();
  if (s.items.some((x) => x.caseId === c.id)) return;
  rectifyStore.set({ items: [{ caseId: c.id, docNo: c.docNo, ruleId: c.ruleId, ruleName: c.ruleName, action: rectifyActionOf(c.ruleId), who, at }, ...s.items] });
}

/** 判例里的单据编号第 3–8 位是组织编码（如 SK110102… → 110102） */
export const orgOfDoc = (docNo: string) => docNo.slice(2, 8);

/** 整改率：已整改 / 复核确认 */
export function rectifyRate(cases: CaseEntry[], items: RectifyEntry[]) {
  const confirmed = cases.filter((c) => c.decision === 'confirm');
  const done = confirmed.filter((c) => items.some((x) => x.caseId === c.id)).length;
  return { confirmed: confirmed.length, done, rate: confirmed.length ? done / confirmed.length : 0 };
}
