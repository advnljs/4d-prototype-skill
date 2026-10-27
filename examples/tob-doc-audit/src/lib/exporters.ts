/**
 * 导出文件版式（每次核查自动导出、国别单列）：
 * - 每次核查自动生成一个结果文件；上传了几类单据（收款 / 付款 / 进口结算单）就有几张疑点工作表：
 *   首行汇总（总核查笔数、疑点笔数、批次号、规则库版本）；只导出疑点数据；第一列“疑点类型”，其后按原导入数据项全部展示；
 * - 国别疑点（三类合并，按交易对方归组，含本批次国别分布与建议国别）单独一张“国别疑点”工作表。
 */
import { BIZ_SHEET, HEADERS, type BizType } from '@/domain/docs';
import { cleanName } from '@/domain/names';
import type { BatchIndex } from '@/agent/batchCountry';
import { suspicionDetail, suspicionLabel } from '@/rules/engine';
import type { Finding, RecordResult } from '@/rules/types';
import { buildXlsx, type XRow, type XSheet } from './xlsx/writer';

export function downloadBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/*
 * 每种导出都先生成工作表模型（XSheet），再写成 xlsx。
 * 页面上的“文件格式预览”直接渲染同一个模型，保证预览与下载的文件一致。
 */

export interface BatchMeta {
  batchId: string;
  time: string;
  /** 规则库名称与版本，如“华东区域规则库 v2026.10.3” */
  lib: string;
  empNo: string;
  source: string;
}

const isCountry = (f: Finding) => f.major === 'country';

/** 某类单据的疑点工作表：首行汇总；只导出有非国别疑点的记录；第一列“疑点类型”，其后为原导入数据项（国别疑点单列在“国别疑点”工作表） */
export function bizResultSheet(biz: BizType, results: RecordResult[], meta: BatchMeta): XSheet {
  const mine = results.filter((r) => r.rec.biz === biz);
  const flagged = mine
    .map((r) => ({ ...r, findings: r.findings.filter((f) => !isCountry(f)) }))
    .filter((r) => r.findings.length);
  const warn = flagged.filter((r) => r.findings.every((f) => f.level === 'warn')).length;
  const headers = HEADERS[biz];
  const rows: XRow[] = [
    {
      style: 'summary',
      cells: ['总核查笔数', mine.length, '疑点笔数', flagged.length, '其中疑问数据（需人工确认）', warn, '批次号', meta.batchId, '核查时间', meta.time, '规则库', meta.lib, '操作人', meta.empNo, '数据来源', meta.source],
    },
    { style: 'header', cells: ['疑点类型', '核查说明（原型补充列）', ...headers], height: 30 },
    ...flagged.map((r) => ({
      style: 'flag' as const,
      cells: [{ v: suspicionLabel(r), s: 'flagKey' as const }, suspicionDetail(r), ...headers.map((h) => r.rec.raw[h] ?? '')],
    })),
  ];
  return {
    name: `${BIZ_SHEET[biz]}疑点`,
    rows,
    freezeRows: 2,
    widths: [28, 46, ...headers.map((h) => (/名称|用途说明/.test(h) ? 34 : /号码|账号|编号/.test(h) ? 24 : 13))],
  };
}

/** 国别疑点工作表：三类单据合并，按交易对方归组；同一交易对方的本批次国别分布与建议国别写在每行，便于整组修改 */
export function countrySheet(results: RecordResult[], idx: BatchIndex | undefined, meta: BatchMeta): XSheet {
  const rows = results.flatMap((r) => r.findings.filter(isCountry).map((f) => ({ r, f })));
  const groupOf = (r: RecordResult) => idx?.groupOf.get(cleanName(r.rec.f.counterparty));
  rows.sort((a, b) => (groupOf(a.r)?.name ?? '~').localeCompare(groupOf(b.r)?.name ?? '~') || a.r.rec.f.docNo.localeCompare(b.r.rec.f.docNo));
  const cps = new Set(rows.map(({ r }) => groupOf(r)?.id ?? r.rec.f.counterparty));
  const dist = (r: RecordResult) => {
    const g = groupOf(r);
    return g && g.countries.length > 1 ? g.countries.map(([c, n]) => `${c}×${n}`).join('、') : '';
  };
  return {
    name: '国别疑点',
    rows: [
      { style: 'summary', cells: ['国别疑点笔数', rows.length, '涉及交易对方', cps.size, '批次号', meta.batchId, '核查时间', meta.time, '规则库', meta.lib, '操作人', meta.empNo] },
      { style: 'header', cells: ['疑点类型', '交易对方（清洗后）', '本批次国别分布', '建议国别', '单据类别', '单据编号', '银行流水号', '交易对方名称（原始）', '填报国别', '核查说明'], height: 30 },
      ...rows.map(({ r, f }) => ({
        style: 'flag' as const,
        cells: [
          { v: f.level === 'warn' ? `${f.ruleName}（需人工确认）` : f.ruleName, s: 'flagKey' as const },
          groupOf(r)?.name ?? cleanName(r.rec.f.counterparty),
          dist(r),
          groupOf(r)?.majority ?? '',
          BIZ_SHEET[r.rec.biz],
          r.rec.f.docNo,
          r.rec.f.bankRef,
          r.rec.f.counterparty,
          r.rec.f.country,
          `${f.message}${f.suggestion ? `建议：${f.suggestion}。` : ''}`,
        ],
      })),
    ],
    freezeRows: 2,
    widths: [30, 30, 22, 10, 12, 26, 22, 44, 10, 60],
  };
}

/** 一次核查的结果文件：上传了哪几类单据就有哪几张疑点工作表，外加“国别疑点”工作表 */
export function batchResultSheets(results: RecordResult[], idx: BatchIndex | undefined, meta: BatchMeta): XSheet[] {
  const bizs = (['receipt', 'payment', 'settlement'] as BizType[]).filter((b) => results.some((r) => r.rec.biz === b));
  return [...bizs.map((b) => bizResultSheet(b, results, meta)), countrySheet(results, idx, meta)];
}

export function batchResultXlsx(results: RecordResult[], idx: BatchIndex | undefined, meta: BatchMeta) {
  return buildXlsx(batchResultSheets(results, idx, meta));
}

/** ERP 导出明细的版式：首行标题、第二行中文表头，其后每行一笔单据 */
export function ledgerSheet(title: string, headers: string[], records: { raw: Record<string, string> }[]): XSheet {
  return {
    name: title,
    rows: [{ cells: [title], style: 'title' }, { style: 'header', cells: headers }, ...records.map((r) => ({ cells: headers.map((h) => r.raw[h] ?? '') }))],
    widths: headers.map((h) => (/名称|用途说明/.test(h) ? 30 : /号码|账号|编号/.test(h) ? 24 : 12)),
  };
}

/** 原样导出 mock 台账（供下载后再上传，演示“ERP 导出文件”长什么样） */
export function ledgerXlsx(title: string, headers: string[], records: { raw: Record<string, string> }[]) {
  return buildXlsx([ledgerSheet(title, headers, records)]);
}

export function rawXlsx(name: string, header: string[], rows: string[][]) {
  return buildXlsx([{ name, rows: [{ style: 'header', cells: header }, ...rows.map((r) => ({ cells: r }))] }]);
}
