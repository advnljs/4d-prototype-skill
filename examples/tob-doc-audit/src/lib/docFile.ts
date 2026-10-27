/**
 * 上传文件校验：判断是否为 ERP 导出的标准格式文件。
 * validateSheets：按指定类别校验（单类）；parseWorkbook：三类工作表自动识别、合并为一个批次（一键核查使用）。
 * 规则：在每个工作表前 5 行中寻找与三类标准表头最匹配的一行；
 *   - 匹配度过低 → 非 ERP 标准格式；
 *   - 识别出的类别与所选不一致 → 类别不符；
 *   - 列不全 → 列出缺失列；
 *   - 通过 → 生成标准化记录。
 */
import { BIZ_LABEL, BIZ_TITLE, HEADERS, detectBiz, fromRaw, type BizType, type DocRecord } from '@/domain/docs';
import type { SheetData } from './xlsx/reader';

export interface FileCheck {
  ok: boolean;
  reason?: string;
  detail?: string[];
  sheet?: string;
  matched?: number;
  total?: number;
  records?: DocRecord[];
}

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function validateSheets(sheets: SheetData[], biz: BizType): FileCheck {
  type Cand = { sheet: SheetData; headerRow: number; det: ReturnType<typeof detectBiz> };
  const cands: Cand[] = [];
  for (const sheet of sheets) {
    for (let i = 0; i < Math.min(5, sheet.rows.length); i++) {
      const row = sheet.rows[i] ?? [];
      if (row.filter(Boolean).length < 3) continue;
      cands.push({ sheet, headerRow: i, det: detectBiz(row) });
    }
  }
  if (!cands.length) return { ok: false, reason: '文件中没有可识别的表格内容。', detail: ['请确认文件为 ERP“收付款单据”导出的 Excel 文件。'] };
  const ratio = (c: Cand) => c.det.matched / c.det.total;
  const same = cands.filter((c) => c.det.biz === biz).sort((a, b) => ratio(b) - ratio(a))[0];
  const best = [...cands].sort((a, b) => ratio(b) - ratio(a))[0];
  if (ratio(best) < 0.6) {
    return {
      ok: false,
      reason: '不是 ERP 导出的标准格式文件。',
      detail: [
        `未识别到收付款单据表头（最接近的“${BIZ_TITLE[best.det.biz]}”只匹配 ${best.det.matched}/${best.det.total} 列）。`,
        `缺少关键列：${best.det.missing.slice(0, 6).join('、')}${best.det.missing.length > 6 ? ' 等' : ''}。`,
      ],
    };
  }
  if (!same || ratio(same) < 0.6) {
    return {
      ok: false,
      reason: `文件内容为“${BIZ_TITLE[best.det.biz]}”，与所选单据种类“${BIZ_LABEL[biz]}”不一致。`,
      detail: [`请将单据种类切换为“${BIZ_LABEL[best.det.biz]}”，或选择对应的导出文件。`],
    };
  }
  if (same.det.missing.length) {
    return {
      ok: false,
      reason: `表头与 ERP ${BIZ_LABEL[biz]}标准格式不完全一致（${same.det.matched}/${same.det.total} 列）。`,
      detail: [`缺少列：${same.det.missing.join('、')}。`, '请直接使用 ERP 导出的原始文件，不要删除或改名列。'],
    };
  }
  const header = same.sheet.rows[same.headerRow].map((h) => (h ?? '').trim());
  const records = same.sheet.rows
    .slice(same.headerRow + 1)
    .map((row, i) => ({ row, line: same.headerRow + 2 + i }))
    .filter(({ row }) => row.some((c) => c && c.trim()))
    .map(({ row, line }) => fromRaw(biz, Object.fromEntries(header.map((h, j) => [h, row[j] ?? ''])), line));
  // 单据编号重复时追加行号，保证键唯一
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.key)) r.key = `${r.key}#${r.row}`;
    seen.add(r.key);
  }
  if (!records.length) return { ok: false, reason: '表头正确，但没有数据行。' };
  return { ok: true, sheet: same.sheet.name, matched: same.det.matched, total: HEADERS[biz].length, records };
}

/** 一个工作表的识别结果 */
export interface SheetCheck {
  name: string;
  ok: boolean;
  biz?: BizType;
  matched?: number;
  total?: number;
  rows?: number;
  reason?: string;
}

export interface WorkbookCheck {
  ok: boolean;
  reason?: string;
  sheets: SheetCheck[];
  records: DocRecord[];
}

/**
 * 上传文件 = 三类 Excel（收款 / 付款 / 进口结算单，三个工作表），可以是一个文件含多个工作表，也可以分开上传。
 * 每个工作表按表头自动识别类别；三类合并成一个核查批次，用同一规则库处理。
 */
export function parseWorkbook(sheets: SheetData[]): WorkbookCheck {
  const out: SheetCheck[] = [];
  const records: DocRecord[] = [];
  const seenBiz = new Set<BizType>();
  for (const sheet of sheets) {
    let best: { row: number; det: ReturnType<typeof detectBiz> } | null = null;
    for (let i = 0; i < Math.min(5, sheet.rows.length); i++) {
      const row = sheet.rows[i] ?? [];
      if (row.filter(Boolean).length < 3) continue;
      const det = detectBiz(row);
      if (!best || det.matched / det.total > best.det.matched / best.det.total) best = { row: i, det };
    }
    if (!best || best.det.matched / best.det.total < 0.6) {
      out.push({ name: sheet.name, ok: false, reason: '不是 ERP 收付款单据格式，已跳过' });
      continue;
    }
    const { det } = best;
    if (det.missing.length) {
      out.push({ name: sheet.name, ok: false, biz: det.biz, matched: det.matched, total: det.total, reason: `缺少列：${det.missing.slice(0, 4).join('、')}${det.missing.length > 4 ? ' 等' : ''}` });
      continue;
    }
    if (seenBiz.has(det.biz)) {
      out.push({ name: sheet.name, ok: false, biz: det.biz, reason: `与前面的工作表同为${BIZ_LABEL[det.biz]}，已跳过` });
      continue;
    }
    const header = sheet.rows[best.row].map((h) => (h ?? '').trim());
    const recs = sheet.rows
      .slice(best.row + 1)
      .map((row, i) => ({ row, line: best!.row + 2 + i }))
      .filter(({ row }) => row.some((c) => c && c.trim()))
      .map(({ row, line }) => fromRaw(det.biz, Object.fromEntries(header.map((h, j) => [h, row[j] ?? ''])), line));
    if (!recs.length) {
      out.push({ name: sheet.name, ok: false, biz: det.biz, reason: '表头正确，但没有数据行' });
      continue;
    }
    seenBiz.add(det.biz);
    out.push({ name: sheet.name, ok: true, biz: det.biz, matched: det.matched, total: HEADERS[det.biz].length, rows: recs.length });
    records.push(...recs);
  }
  // 单据编号重复时追加类别与行号，保证键唯一
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.key)) r.key = `${r.key}#${r.biz}${r.row}`;
    seen.add(r.key);
  }
  if (!records.length) return { ok: false, reason: '没有识别到收款、付款、进口结算任何一类单据。', sheets: out, records };
  return { ok: true, sheets: out, records };
}
