/**
 * 最小 xlsx 写入：inlineStr 字符串、数字、5 种单元格样式（表头、汇总、疑点行、疑点类型列、普通带框）。
 * 满足需求中的导出规范：首行汇总栏、第一列疑点类型、疑点整行标红。
 */
import { zipStore } from './zip';

export type CellStyle = 'plain' | 'header' | 'summary' | 'flag' | 'flagKey' | 'bordered' | 'title';

export interface XCell {
  v: string | number | null | undefined;
  s?: CellStyle;
}

export interface XRow {
  cells: (XCell | string | number | null | undefined)[];
  style?: CellStyle;
  height?: number;
}

export interface XSheet {
  name: string;
  rows: XRow[];
  widths?: number[];
  merges?: string[];
  freezeRows?: number;
}

const STYLE_ID: Record<CellStyle, number> = { plain: 0, header: 1, summary: 2, flag: 3, flagKey: 4, bordered: 5, title: 6 };

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="10.5"/><name val="等线"/><family val="2"/><charset val="134"/></font>
<font><b/><sz val="10.5"/><name val="等线"/><family val="2"/><charset val="134"/></font>
<font><b/><sz val="10.5"/><color rgb="FF9B2420"/><name val="等线"/><family val="2"/><charset val="134"/></font>
<font><b/><sz val="13"/><name val="等线"/><family val="2"/><charset val="134"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE6ECF2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFBE1DE"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D6"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFC9D1D9"/></left><right style="thin"><color rgb="FFC9D1D9"/></right><top style="thin"><color rgb="FFC9D1D9"/></top><bottom style="thin"><color rgb="FFC9D1D9"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="常规" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

export function colName(i: number) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(sh: XSheet) {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  if (sh.freezeRows) {
    parts.push(
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRows}" topLeftCell="A${sh.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`,
    );
  }
  parts.push('<sheetFormatPr defaultRowHeight="16"/>');
  if (sh.widths?.length) {
    parts.push('<cols>');
    sh.widths.forEach((w, i) => parts.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
    parts.push('</cols>');
  }
  parts.push('<sheetData>');
  sh.rows.forEach((row, ri) => {
    const r = ri + 1;
    parts.push(`<row r="${r}"${row.height ? ` ht="${row.height}" customHeight="1"` : ''}>`);
    row.cells.forEach((c, ci) => {
      const cell: XCell = c !== null && typeof c === 'object' ? c : { v: c };
      const style = cell.s ?? row.style ?? 'plain';
      const sid = STYLE_ID[style];
      const ref = `${colName(ci)}${r}`;
      const v = cell.v;
      if (v === null || v === undefined || v === '') {
        if (sid) parts.push(`<c r="${ref}" s="${sid}"/>`);
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        parts.push(`<c r="${ref}" s="${sid}"><v>${v}</v></c>`);
      } else {
        parts.push(`<c r="${ref}" s="${sid}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`);
      }
    });
    parts.push('</row>');
  });
  parts.push('</sheetData>');
  if (sh.merges?.length) {
    parts.push(`<mergeCells count="${sh.merges.length}">`);
    sh.merges.forEach((m) => parts.push(`<mergeCell ref="${m}"/>`));
    parts.push('</mergeCells>');
  }
  parts.push('</worksheet>');
  return parts.join('');
}

export function buildXlsx(sheets: XSheet[]): Uint8Array {
  const enc = new TextEncoder();
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: 'xl/workbook.xml', data: enc.encode(wb) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES) },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc.encode(sheetXml(s)) })),
  ]);
}
