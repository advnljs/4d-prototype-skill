/**
 * 最小 xlsx 读取：返回每个工作表的二维字符串数组。
 * 只做核查所需的解析（共享字符串、内联字符串、数字、布尔），不处理公式重算与日期格式。
 */
import { unzip, ZipError } from './zip';

export interface SheetData {
  name: string;
  rows: string[][];
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e];
  });
}

function textOf(xml: string) {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] ?? '';
  return decode(out);
}

function colIndex(ref: string) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function normalizeNumber(v: string) {
  // Excel 中的浮点误差（如 8170.0000000001）按 10 位小数修正后去掉多余 0
  if (!/^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(v)) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n) && Math.abs(n) >= 1e15) return BigInt(Math.round(n)).toString();
  return String(Math.round(n * 1e10) / 1e10);
}

export async function readXlsx(buf: ArrayBuffer, maxRows = 200000): Promise<SheetData[]> {
  const files = await unzip(buf, (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || n.startsWith('xl/worksheets/sheet'));
  const dec = new TextDecoder();
  const wbXml = files.get('xl/workbook.xml');
  if (!wbXml) throw new ZipError('不是有效的 Excel 文件（缺少 workbook.xml）');
  const wb = dec.decode(wbXml);
  const relsXml = dec.decode(files.get('xl/_rels/workbook.xml.rels') ?? new Uint8Array());
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''));
  }
  const shared: string[] = [];
  const ssXml = files.get('xl/sharedStrings.xml');
  if (ssXml) {
    const ss = dec.decode(ssXml);
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  }
  const sheets: SheetData[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(/name="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1] ?? '';
    const target = rels.get(rid);
    const data = target ? files.get(`xl/${target}`) : undefined;
    if (!data) continue;
    const xml = dec.decode(data);
    const rows: string[][] = [];
    let rowNo = 0;
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const attrs = rm[1] ?? rm[3] ?? '';
      const r = Number(/\br="(\d+)"/.exec(attrs)?.[1] ?? rowNo + 1);
      rowNo = r;
      if (r > maxRows) break;
      const cells: string[] = [];
      let col = 0;
      for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const cattrs = cm[1];
        const ref = /\br="([A-Z]+\d+)"/.exec(cattrs)?.[1];
        if (ref) col = colIndex(ref);
        const t = /\bt="([^"]+)"/.exec(cattrs)?.[1];
        const inner = cm[2] ?? '';
        let v = '';
        if (t === 'inlineStr') v = textOf(inner);
        else {
          const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          if (raw !== undefined) {
            if (t === 's') v = shared[Number(raw)] ?? '';
            else if (t === 'str' || t === 'e') v = decode(raw);
            else if (t === 'b') v = raw === '1' ? 'TRUE' : 'FALSE';
            else v = normalizeNumber(raw);
          }
        }
        cells[col] = v;
        col++;
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
      rows[r - 1] = cells;
    }
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name, rows });
  }
  return sheets;
}
