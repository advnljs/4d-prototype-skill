/**
 * 境外交易对方名称清洗与相似度：
 * 大小写统一、去首尾空格、压缩中间连续空格、剔除行业后缀（LTD、LIMITED、CO、INC、CORP、GMBH、LLC 等），
 * 再做字符串相似度模糊匹配，高相似度判定为同一交易对方。
 */
export const SUFFIX_TOKENS = [
  'CO', 'COMPANY', 'LTD', 'LIMITED', 'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'GMBH', 'LLC', 'PTE', 'PLC',
  'SDN', 'BHD', 'JSC', 'PVT', 'SA', 'SAC', 'LTDA', 'FZE', 'KK', 'AG', 'BV', 'NV', 'SRL', 'SPA', 'AB', 'OY', 'AS',
];

export interface CleanStep {
  op: string;
  before: string;
  after: string;
}

/** 清洗并返回每一步的前后对比（用于过程可视化） */
export function cleanNameSteps(raw: string): { result: string; steps: CleanStep[] } {
  const steps: CleanStep[] = [];
  let s = raw;
  const push = (op: string, next: string) => {
    if (next !== s) steps.push({ op, before: s, after: next });
    s = next;
  };
  push('截去分号后的地址信息', s.split(/[;；]/)[0] ?? s);
  push('统一转为大写', s.toUpperCase());
  // 单字母缩写（L.L.C.、S.A.）去掉点号合并；其余点号（AMAZON.COM、PTE.）与标点替换为空格
  push('合并缩写点号、其余标点替换为空格', s.replace(/\b([A-Za-z])\./g, '$1').replace(/[.,，。()（）&'"/\\-]/g, ' '));
  push('去除首尾空格', s.trim());
  push('压缩中间连续空格', s.replace(/\s+/g, ' '));
  const tokens = s.split(' ');
  const kept = tokens.filter((t) => !SUFFIX_TOKENS.includes(t));
  // 剔除后只剩虚词或为空时（如“LIMITED LIABILITY COMPANY”）保留原样，避免清洗成无意义的词
  const meaningful = kept.filter((t) => !['LIABILITY', 'THE', 'AND', 'OF'].includes(t));
  push('剔除行业后缀（LTD、LIMITED、CO、INC、CORP、GMBH、LLC…）', meaningful.length ? kept.join(' ') : s);
  return { result: s, steps };
}

export function cleanName(raw: string): string {
  return cleanNameSteps(raw).result;
}

/** Jaro-Winkler 相似度（0~1） */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array<boolean>(a.length).fill(false);
  const bm = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - range);
    const hi = Math.min(i + range + 1, b.length);
    for (let j = lo; j < hi; j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** 词元 Jaccard（忽略词序；词尾复数 S 视为同一词） */
const stem = (t: string) => (t.length > 3 && t.endsWith('S') ? t.slice(0, -1) : t);

export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean).map(stem));
  const tb = new Set(b.split(' ').filter(Boolean).map(stem));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach((t) => tb.has(t) && inter++);
  return inter / (ta.size + tb.size - inter);
}

/** 综合相似度：去空格后完全相同记 1；否则取去空格 Jaro-Winkler 与词元 Jaccard 的加权 */
export function similarity(a: string, b: string): number {
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 1;
  const jw = jaroWinkler(a.replace(/\s/g, ''), b.replace(/\s/g, ''));
  const tj = tokenJaccard(a, b);
  return Math.round((jw * 0.7 + tj * 0.3) * 1000) / 1000;
}
