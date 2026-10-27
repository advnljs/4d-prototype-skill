/**
 * ERP 收付款单据导出格式（三类：收款单 / 付款单 / 进口结算单）。
 * 表头为原型设计的通用格式（虚构，不对应任何真实系统）。
 * 标准化模型：把三类表的不同列名映射到统一的逻辑字段，规则只面向逻辑字段编写。
 */
import { cleanName } from './names';

export type BizType = 'receipt' | 'payment' | 'settlement';

export const BIZ_LABEL: Record<BizType, string> = {
  receipt: '收款单',
  payment: '付款单',
  settlement: '进口结算单',
};

/** 单据种类（单据编号前两位字母） */
export const BIZ_FORM: Record<BizType, string> = {
  receipt: '收款单（SK）',
  payment: '付款单（FK）',
  settlement: '进口结算单（JS）',
};

export const BIZ_PREFIX: Record<BizType, string> = { receipt: 'SK', payment: 'FK', settlement: 'JS' };

/** 上传 Excel 中的工作表名 */
export const BIZ_SHEET: Record<BizType, string> = {
  receipt: '收款',
  payment: '付款',
  settlement: '进口结算',
};

/** 导出文件首行标题 */
export const BIZ_TITLE: Record<BizType, string> = {
  receipt: '收款单明细',
  payment: '付款单明细',
  settlement: '进口结算单明细',
};

export const HEADERS: Record<BizType, string[]> = {
  receipt: [
    '组织编码', '单据编号', '往来类型', '对方类型', '本方主体代码', '本方单位', '交易对方', '对方国家/地区', '结算方式',
    '收款币种', '收款金额', '折算汇率', '本币入账金额', '本币账号', '外币入账金额', '外币账号', '其他入账金额', '其他账号',
    '我方手续费币种', '我方手续费', '对方手续费币种', '对方手续费', '单据日期',
    '类别编码1', '用途说明1', '明细币种1', '明细金额1', '类别编码2', '用途说明2', '明细币种2', '明细金额2',
    '款项性质', '审批单号', '银行流水号', '折美元金额', '经办人', '经办人电话', '对方账号', '最后修改日', '数据来源',
  ],
  payment: [
    '组织编码', '单据编号', '往来类型', '对方类型', '本方主体代码', '本方单位', '交易对方', '对方国家/地区', '结算方式',
    '对方开户行', '付款币种', '付款金额', '折算汇率', '本币支付金额', '本币账号', '外币支付金额', '外币账号', '其他支付金额',
    '其他账号', '单据日期', '类别编码1', '用途说明1', '明细币种1', '明细金额1', '类别编码2', '用途说明2', '明细币种2',
    '明细金额2', '款项性质', '最迟交货日期', '银行流水号', '折美元金额', '对方账号', '经办人', '经办人电话', '审批单号',
    '合同号', '发票号', '最后修改日', '数据来源',
  ],
  settlement: [
    '组织编码', '单据编号', '往来类型', '对方类型', '本方主体代码', '本方单位', '交易对方', '对方国家/地区', '结算方式',
    '交单行', '结算币种', '结算金额', '折算汇率', '本币支付金额', '本币账号', '外币支付金额', '外币账号', '其他支付金额',
    '其他账号', '扣费币种', '扣费金额', '实付币种', '实付金额', '单据日期', '类别编码1', '用途说明1', '明细币种1',
    '明细金额1', '类别编码2', '用途说明2', '明细币种2', '明细金额2', '款项性质', '最迟交货日期', '银行流水号',
    '折美元金额', '经办人', '经办人电话', '合同号', '发票号', '运单号', '最后修改日', '数据来源', '审批单号',
  ],
};

/** 逻辑字段 → 三类表的列名（null 表示该类表无此字段） */
const MAP = {
  orgCode: ['组织编码', '组织编码', '组织编码'],
  docNo: ['单据编号', '单据编号', '单据编号'],
  tradeType: ['往来类型', '往来类型', '往来类型'],
  partyType: ['对方类型', '对方类型', '对方类型'],
  entityCode: ['本方主体代码', '本方主体代码', '本方主体代码'],
  domesticName: ['本方单位', '本方单位', '本方单位'],
  counterparty: ['交易对方', '交易对方', '交易对方'],
  country: ['对方国家/地区', '对方国家/地区', '对方国家/地区'],
  settle: ['结算方式', '结算方式', '结算方式'],
  bankName: [null, '对方开户行', '交单行'],
  currency: ['收款币种', '付款币种', '结算币种'],
  amount: ['收款金额', '付款金额', '结算金额'],
  rate: ['折算汇率', '折算汇率', '折算汇率'],
  convAmt: ['本币入账金额', '本币支付金额', '本币支付金额'],
  cnyAcct: ['本币账号', '本币账号', '本币账号'],
  fxAmt: ['外币入账金额', '外币支付金额', '外币支付金额'],
  fxAcct: ['外币账号', '外币账号', '外币账号'],
  otherAmt: ['其他入账金额', '其他支付金额', '其他支付金额'],
  otherAcct: ['其他账号', '其他账号', '其他账号'],
  feeDomCur: ['我方手续费币种', null, '扣费币种'],
  feeDomAmt: ['我方手续费', null, '扣费金额'],
  feeForCur: ['对方手续费币种', null, null],
  feeForAmt: ['对方手续费', null, null],
  actualCur: [null, null, '实付币种'],
  actualAmt: [null, null, '实付金额'],
  docDate: ['单据日期', '单据日期', '单据日期'],
  code1: ['类别编码1', '类别编码1', '类别编码1'],
  remark1: ['用途说明1', '用途说明1', '用途说明1'],
  txCur1: ['明细币种1', '明细币种1', '明细币种1'],
  txAmt1: ['明细金额1', '明细金额1', '明细金额1'],
  code2: ['类别编码2', '类别编码2', '类别编码2'],
  remark2: ['用途说明2', '用途说明2', '用途说明2'],
  txCur2: ['明细币种2', '明细币种2', '明细币种2'],
  txAmt2: ['明细金额2', '明细金额2', '明细金额2'],
  nature: ['款项性质', '款项性质', '款项性质'],
  latestShipDate: [null, '最迟交货日期', '最迟交货日期'],
  approvalNo: ['审批单号', '审批单号', '审批单号'],
  bankRef: ['银行流水号', '银行流水号', '银行流水号'],
  usdAmt: ['折美元金额', '折美元金额', '折美元金额'],
  filler: ['经办人', '经办人', '经办人'],
  fillerPhone: ['经办人电话', '经办人电话', '经办人电话'],
  cpAcct: ['对方账号', '对方账号', null],
  contractNo: [null, '合同号', '合同号'],
  invoiceNo: [null, '发票号', '发票号'],
  billNo: [null, null, '运单号'],
  lastModified: ['最后修改日', '最后修改日', '最后修改日'],
  source: ['数据来源', '数据来源', '数据来源'],
} as const satisfies Record<string, readonly [string | null, string | null, string | null]>;

export type FieldKey = keyof typeof MAP;
export type Fields = Record<FieldKey, string>;

const BIZ_IDX: Record<BizType, 0 | 1 | 2> = { receipt: 0, payment: 1, settlement: 2 };

export function columnOf(biz: BizType, key: FieldKey): string | null {
  return MAP[key][BIZ_IDX[biz]];
}

export interface DocRecord {
  /** 唯一键（单据编号；重复时追加行号） */
  key: string;
  biz: BizType;
  /** 原文件中的行号（含标题与表头，从 1 开始） */
  row: number;
  f: Fields;
  /** 原始列值（导出时按原表头完整展示） */
  raw: Record<string, string>;
}

const FIELD_KEYS = Object.keys(MAP) as FieldKey[];

export function fromRaw(biz: BizType, raw: Record<string, string>, row: number): DocRecord {
  const f = {} as Fields;
  for (const k of FIELD_KEYS) {
    const col = columnOf(biz, k);
    f[k] = col ? (raw[col] ?? '').trim() : '';
  }
  return { key: f.docNo || `row-${row}`, biz, row, f, raw };
}

export function toRaw(biz: BizType, f: Partial<Fields>): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const h of HEADERS[biz]) raw[h] = '';
  for (const k of FIELD_KEYS) {
    const col = columnOf(biz, k);
    if (col && f[k] !== undefined) raw[col] = f[k] as string;
  }
  return raw;
}

export function emptyFields(): Fields {
  const f = {} as Fields;
  for (const k of FIELD_KEYS) f[k] = '';
  return f;
}

/** 金额解析：空串/空格返回 null */
export function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function n0(v: string | undefined): number {
  return num(v) ?? 0;
}

/* ---------------- 字典 ---------------- */

/** 往来类型：1 境外客商；3 集团内关联方（境外）；4 境内往来 */
export const TRADE_TYPE: Record<string, string> = {
  '1': '境外客商往来',
  '3': '集团内关联方往来',
  '4': '境内往来',
};

export const NATURE_LABEL: Record<BizType, Record<string, string>> = {
  receipt: { A: '预收款', R: '退款', O: '其他' },
  payment: { A: '预付款', P: '到货付款', R: '退款', O: '其他' },
  settlement: { A: '预付款', P: '到货付款', R: '退款', O: '其他' },
};

export const SETTLE_LABEL: Record<string, string> = {
  T: '电汇',
  L: '信用证',
  C: '托收',
  G: '保函',
  D: '汇票',
  O: '其他',
};

export function labelOf(dict: Record<string, string>, v: string) {
  if (!v) return '';
  return dict[v] ? `${v}-${dict[v]}` : v;
}

/** 单据编号结构：2 位单据种类 + 6 位组织编码 + 8 位日期 + 4 位序号，如 SK110102202610120007 */
export function parseDocNo(no: string) {
  if (!/^(SK|FK|JS)\d{18}$/.test(no)) return null;
  return { form: no.slice(0, 2), org: no.slice(2, 8), date: no.slice(8, 16), seq: no.slice(16) };
}

export const DOC_NO_RE = /(SK|FK|JS)\d{18}/;

/**
 * 银行流水号中的到账日期：演示数据的流水号为“BK + YYMMDD + 6 位序号”，
 * 原型据此推断到账日期用于时效检查（假设，见“假设与待确认”A-07）。
 */
export function inferValueDate(bankRef: string): string | null {
  const m = /^BK(\d{2})(\d{2})(\d{2})/.exec(bankRef);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const mi = Number(mm);
  const di = Number(dd);
  if (mi < 1 || mi > 12 || di < 1 || di > 31) return null;
  return `20${yy}${mm}${dd}`;
}

export function fmtDate8(d: string) {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d;
}

export function date8ToDate(d: string): Date | null {
  if (!/^\d{8}$/.test(d)) return null;
  return new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6)));
}

/** 两个日期之间的工作日数（不含起始日，含结束日；不考虑法定节假日调休） */
export function workdaysBetween(from: Date, to: Date): number {
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (end <= d) return 0;
  let n = 0;
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

/**
 * 集团内关联方名单（境外子公司与关联公司，虚构；正式环境由集团主数据维护）。
 * 往来类型 3 的单据，交易对方应在名单内；名单内的交易对方，往来类型应为 3。
 */
export const RELATED_PARTIES = ['YUANFAN HOLDINGS (HK) LIMITED', 'YUANFAN TRADING PTE. LTD.', 'YUANFAN LOGISTICS (SINGAPORE) PTE. LTD.'];

const RELATED = new Set(RELATED_PARTIES.map((n) => cleanName(n)));

export function isRelatedParty(name: string): boolean {
  return !!name && RELATED.has(cleanName(name));
}

/** 脱敏：保留首尾，中间以 * 代替（导出、下载等场景使用） */
export function maskName(name: string) {
  const s = name.trim();
  if (s.length <= 4) return s.slice(0, 1) + '*'.repeat(Math.max(1, s.length - 1));
  const keepHead = Math.min(2, Math.floor(s.length / 4));
  const tail = /(有限公司|股份有限公司|有限责任公司)$/.exec(s)?.[0] ?? s.slice(-2);
  return s.slice(0, keepHead) + '****' + tail;
}

/** 根据表头识别文件属于哪类单据：返回匹配度最高的类型及匹配列数 */
export function detectBiz(header: string[]): { biz: BizType; matched: number; total: number; missing: string[] } {
  const set = new Set(header.map((h) => h.trim()));
  let best: { biz: BizType; matched: number; total: number; missing: string[] } | null = null;
  for (const biz of ['receipt', 'payment', 'settlement'] as BizType[]) {
    const hs = HEADERS[biz];
    const missing = hs.filter((h) => !set.has(h));
    const matched = hs.length - missing.length;
    if (!best || matched / hs.length > best.matched / best.total) best = { biz, matched, total: hs.length, missing };
  }
  return best!;
}
