/** 金额一律以“分”为整数单位计算，展示时再换算成元，避免浮点误差。 */
const yuanFmt = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('zh-CN');

/** 分 → “49.00” */
export function yuan(fen: number) {
  return yuanFmt.format(fen / 100);
}

/** 分 → “¥49.00”（负数显示为 “-¥2.20”） */
export function rmb(fen: number) {
  return `${fen < 0 ? '-' : ''}¥${yuan(Math.abs(fen))}`;
}

/** 分 → 精简显示：整元不带小数（“¥8”），否则保留两位 */
export function rmbShort(fen: number) {
  const v = Math.abs(fen) / 100;
  return `${fen < 0 ? '-' : ''}¥${Number.isInteger(v) ? v : v.toFixed(2)}`;
}

export function fmtInt(n: number) {
  return intFmt.format(n);
}

export function pct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

export function pad(n: number, len = 2) {
  return String(n).padStart(len, '0');
}

/** 业务时钟：自 0 点起的分钟数（可带小数）→ “11:52” */
export function hm(min: number) {
  const m = Math.floor(min + 1e-6);
  const h = Math.floor(m / 60) % 24;
  return `${pad(h)}:${pad(m % 60)}`;
}

/** 业务时钟 → “11:52:30” */
export function hms(min: number) {
  const s = Math.round(min * 60);
  return `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** 字符串哈希（FNV-1a）：让模拟数据“看起来随机”但每次一样 */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 可复现的伪随机数（mulberry32） */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function round2(v: number) {
  return Math.round(v * 100) / 100;
}
