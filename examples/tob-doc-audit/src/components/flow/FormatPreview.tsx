import { Fragment, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import { formatSamples, type FormatSample } from '@/flow/formats';
import type { DataKey } from '@/flow/dataObjects';
import { downloadBytes } from '@/lib/exporters';
import { TraceTimeline } from '@/components/check/TraceTimeline';
import { buildXlsx, type CellStyle, type XCell } from '@/lib/xlsx/writer';

/** 与 xlsx 写入样式一致的预览配色（见 lib/xlsx/writer.ts STYLES） */
const CELL_CLS: Record<CellStyle, string> = {
  plain: 'bg-white text-[#1f1f1f]',
  bordered: 'bg-white text-[#1f1f1f]',
  header: 'bg-[#E6ECF2] font-semibold text-[#1f1f1f] text-center',
  summary: 'bg-[#FFF3D6] font-semibold text-[#1f1f1f]',
  flag: 'bg-[#FBE1DE] text-[#1f1f1f]',
  flagKey: 'bg-[#FBE1DE] font-semibold text-[#9B2420]',
  title: 'bg-white text-[14px] font-semibold text-[#1f1f1f]',
};

function colName(i: number) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const cellOf = (c: XCell | string | number | null | undefined): XCell => (c !== null && typeof c === 'object' ? c : { v: c });

/** Excel 风格的工作表预览：列字母、行号、单元格样式、冻结线、工作表页签 */
export function SheetPreview({ sample, maxRows = 12, maxCols = 9, compact }: { sample: Extract<FormatSample, { kind: 'sheet' }>; maxRows?: number; maxCols?: number; compact?: boolean }) {
  const { sheet } = sample;
  const totalCols = Math.max(...sheet.rows.map((r) => r.cells.length));
  const cols = Math.min(totalCols, maxCols);
  const rows = sheet.rows.slice(0, maxRows);
  const width = (i: number) => Math.min(260, Math.max(56, Math.round((sheet.widths?.[i] ?? 12) * 7 + 10)));
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#c9d1d9] bg-white shadow-raise">
      <div className="flex items-center gap-2 border-b border-[#d6dbe0] bg-[#f3f6f4] px-3 py-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#1f7a46] text-[10px] font-bold text-white">X</span>
        <span className="code truncate text-[12.5px] text-ink-800">{sample.fileName}</span>
        <span className="ml-auto shrink-0 text-2xs text-ink-500">
          共 {sheet.rows.length} 行 × {totalCols} 列{sheet.freezeRows ? ` · 冻结前 ${sheet.freezeRows} 行` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table
          className="border-collapse text-[12px] leading-[18px]"
          style={{ tableLayout: 'fixed', width: 36 + Array.from({ length: cols }, (_, i) => width(i)).reduce((a, b) => a + b, 0) + (totalCols > cols ? 64 : 0) }}
        >
          <colgroup>
            <col style={{ width: 36 }} />
            {Array.from({ length: cols }, (_, i) => (
              <col key={i} style={{ width: width(i) }} />
            ))}
            {totalCols > cols ? <col style={{ width: 64 }} /> : null}
          </colgroup>
          <thead>
            <tr className="bg-[#f0f2f4] text-center text-2xs text-ink-500">
              <th className="border border-[#d6dbe0] font-normal" />
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className="border border-[#d6dbe0] py-0.5 font-normal">
                  {colName(i)}
                </th>
              ))}
              {totalCols > cols ? <th className="border border-[#d6dbe0] font-normal">…</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => {
              const frozenEdge = !!sheet.freezeRows && ri === sheet.freezeRows - 1;
              return (
                <tr key={ri} className={cx(frozenEdge && '[&>td]:border-b-2 [&>td]:border-b-[#8a99a8]')}>
                  <td className="border border-[#d6dbe0] bg-[#f0f2f4] text-center text-2xs text-ink-500">{ri + 1}</td>
                  {Array.from({ length: cols }, (_, ci) => {
                    const c = cellOf(r.cells[ci]);
                    const style: CellStyle = c.s ?? r.style ?? 'plain';
                    const v = c.v === null || c.v === undefined ? '' : String(c.v);
                    return (
                      <td key={ci} title={v} className={cx('truncate border border-[#d6dbe0] px-1.5 py-[3px] align-top', CELL_CLS[style], typeof c.v === 'number' && 'text-right')}>
                        {v}
                      </td>
                    );
                  })}
                  {totalCols > cols ? <td className="border border-[#d6dbe0] bg-[#fafafa] text-center text-2xs text-ink-400">+{totalCols - cols} 列</td> : null}
                </tr>
              );
            })}
            {sheet.rows.length > rows.length ? (
              <tr>
                <td className="border border-[#d6dbe0] bg-[#f0f2f4] text-center text-2xs text-ink-500">…</td>
                <td colSpan={cols + (totalCols > cols ? 1 : 0)} className="border border-[#d6dbe0] px-2 py-1 text-2xs text-ink-500">
                  其余 {sheet.rows.length - rows.length} 行未展示
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className={cx('flex items-center gap-2 border-t border-[#d6dbe0] bg-[#f3f6f4] px-2 py-1', compact && 'hidden')}>
        <span className="rounded-t-[4px] border-b-2 border-[#1f7a46] bg-white px-3 py-0.5 text-2xs font-medium text-[#1f7a46]">{sheet.name}</span>
        <Button
          size="sm"
          variant="ghost"
          icon="download"
          className="ml-auto"
          onClick={() => downloadBytes(buildXlsx([sheet]), sample.fileName.replace(/\.csv$/, '.xlsx'))}
        >
          下载样例
        </Button>
      </div>
    </div>
  );
}

/** 数据库表：表名、所在库、列（名称 / 类型，悬停看说明）与样例行 */
export function TablePreview({ sample, maxRows = 12 }: { sample: Extract<FormatSample, { kind: 'table' }>; maxRows?: number }) {
  const rows = sample.rows.slice(0, maxRows);
  const total = sample.total ?? sample.rows.length;
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#cfd6e4] bg-white shadow-raise">
      <div className="flex items-center gap-2 border-b border-[#dde3ee] bg-[#eef2f8] px-3 py-1.5">
        <Icon name="database" size={14} className="shrink-0 text-[#3b5b92]" />
        <span className="code truncate text-[12.5px] font-semibold text-[#24324d]">{sample.table}</span>
        <span className="truncate text-2xs text-ink-500">{sample.store}</span>
        <span className="ml-auto shrink-0 text-2xs text-ink-500">
          {sample.columns.length} 列 · 共 {total} 行
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px] leading-[18px]">
          <thead>
            <tr className="bg-[#f6f8fb] text-left">
              {sample.columns.map((c) => (
                <th key={c.name} title={c.comment} className="border-b border-r border-[#e3e8f0] px-2 py-1 align-bottom font-normal last:border-r-0">
                  <div className="code whitespace-nowrap font-semibold text-[#24324d]">{c.name}</div>
                  <div className="code whitespace-nowrap text-2xs text-agent-600">{c.type}</div>
                  <div className="max-w-[220px] truncate text-2xs text-ink-500">{c.comment}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 ? 'bg-[#fafbfd]' : 'bg-white'}>
                {r.map((v, j) => (
                  <td key={j} title={v === null ? 'NULL' : String(v)} className={cx('max-w-[280px] truncate border-b border-r border-[#eef1f6] px-2 py-[3px] last:border-r-0', v === null ? 'italic text-ink-400' : typeof v === 'number' ? 'num text-right text-ink-900' : 'text-ink-900')}>
                    {v === null ? 'NULL' : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > rows.length ? <div className="border-t border-[#eef1f6] px-3 py-1 text-2xs text-ink-500">其余 {total - rows.length} 行未展示</div> : null}
    </div>
  );
}

/** JSON 样例：按类型着色 */
export function JsonPreview({ value, maxHeight = 360 }: { value: unknown; maxHeight?: number }) {
  const text = useMemo(() => JSON.stringify(value, null, 2), [value]);
  const lines = text.split('\n');
  return (
    <pre className="code overflow-auto rounded-[12px] bg-[#1d1f24] px-4 py-3 text-[12.5px] leading-[20px] text-[#d4d7dd]" style={{ maxHeight }}>
      {lines.map((ln, i) => (
        <Fragment key={i}>
          <JsonLine line={ln} />
          {'\n'}
        </Fragment>
      ))}
    </pre>
  );
}

function JsonLine({ line }: { line: string }) {
  const m = /^(\s*)("(?:[^"\\]|\\.)*")(\s*:\s*)?(.*)$/.exec(line);
  if (!m) return <span>{colorValue(line)}</span>;
  const [, indent, str, colon, rest] = m;
  if (colon) {
    return (
      <span>
        {indent}
        <span className="text-[#8fb8ff]">{str}</span>
        {colon}
        {colorValue(rest)}
      </span>
    );
  }
  return (
    <span>
      {indent}
      {colorValue(str + rest)}
    </span>
  );
}

function colorValue(v: string) {
  const t = v.trim().replace(/,$/, '');
  const cls = /^".*"$/.test(t) ? 'text-[#a8d8a0]' : /^-?\d/.test(t) ? 'text-[#f4c37d]' : /^(true|false|null)$/.test(t) ? 'text-[#d6a8f0]' : '';
  return <span className={cls}>{v}</span>;
}

export function FormPreview({ sample }: { sample: Extract<FormatSample, { kind: 'form' }> }) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-[#9db7cf] bg-[#f6f9fc] font-[SimSun,'Songti_SC',serif]">
      <div className="bg-gradient-to-b from-[#2f6fa8] to-[#245a8a] px-3 py-1.5 text-[13px] font-semibold text-white">{sample.title}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 p-3">
        {sample.fields.map(([k, v, wide]) =>
          wide ? (
            <div key={k} className="col-span-2 flex items-start gap-2 text-[12.5px]">
              <span className="w-[132px] shrink-0 pt-0.5 text-right text-[#333]">{k}：</span>
              <span className="min-h-[64px] min-w-0 flex-1 whitespace-pre-wrap border border-[#9db7cf] bg-white px-2 py-1 leading-[20px] text-[#222]">{v || '—'}</span>
            </div>
          ) : (
            <div key={k} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-[132px] shrink-0 text-right text-[#333]">{k}：</span>
              <span className="min-w-0 flex-1 truncate border border-[#9db7cf] bg-[#eef1f4] px-1.5 leading-[22px] text-[#222]" title={v}>
                {v || '—'}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<FormatSample['kind'], string> = { sheet: 'Excel 表格', table: '数据库表', json: 'JSON', form: '系统页面', code: '规则 DSL', doc: '文件原文', trace: '推理轨迹' };

/** 文书原样：公文版式（标题居中、发文信息、条款正文） */
export function DocPreview({ sample }: { sample: Extract<FormatSample, { kind: 'doc' }> }) {
  return (
    <div className="rounded-[6px] bg-[#e9e9ec] p-3">
      <article className="relative mx-auto max-w-[760px] bg-white px-10 py-8 shadow-[0_1px_4px_rgb(0_0_0/0.18)]" style={{ fontFamily: "'Songti SC', SimSun, 'Noto Serif SC', serif" }}>
        <span className="pointer-events-none absolute right-6 top-4 rotate-[-8deg] rounded-[4px] border border-seal-200 px-2 text-2xs text-seal-500">示意摘要</span>
        <h4 className="text-center text-[19px] font-bold leading-snug text-[#1a1a1a]">{sample.docTitle}</h4>
        <p className="mt-2 text-center text-[12px] text-[#555]">{sample.meta.join('　')}</p>
        <div className="mx-auto mt-3 h-px w-full bg-seal-500/70" />
        <div className="mt-4 space-y-2.5">
          {sample.clauses.map((c) => (
            <p key={c.no} className="text-[13.5px] leading-[26px] text-[#1f1f1f]" style={{ textIndent: '2em' }}>
              <span className="font-bold">{c.no}</span>　{c.text}
            </p>
          ))}
        </div>
      </article>
    </div>
  );
}

function SampleView({ s, compact }: { s: FormatSample; compact?: boolean }) {
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {!compact ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-ink-900">{s.title}</span>
          {s.kind === 'sheet' && s.naming ? <span className="text-xs text-ink-500">命名规则：{s.naming}</span> : null}
        </div>
      ) : null}
      {s.kind === 'sheet' ? (
        <SheetPreview sample={s} compact={compact} maxRows={compact ? 7 : 12} maxCols={compact ? 7 : 9} />
      ) : s.kind === 'table' ? (
        <TablePreview sample={s} maxRows={compact ? 6 : 12} />
      ) : s.kind === 'json' ? (
        <JsonPreview value={s.value} maxHeight={compact ? 196 : 360} />
      ) : s.kind === 'form' ? (
        <FormPreview sample={s} />
      ) : s.kind === 'doc' ? (
        <DocPreview sample={s} />
      ) : s.kind === 'trace' ? (
        <div className="rounded-[12px] border border-agent-100 bg-surface px-4 pt-3">
          <div className="mb-2 text-xs font-medium text-agent-700">结论：{s.verdict}</div>
          <TraceTimeline steps={s.steps} compact={compact} />
        </div>
      ) : (
        <pre className="code overflow-x-auto rounded-[12px] bg-ink-50 px-4 py-3 text-[12.5px] leading-6 text-ink-800">{s.code}</pre>
      )}
      <p className={cx('flex gap-1.5 leading-relaxed text-ink-600', compact ? 'text-2xs' : 'text-xs')}>
        <Icon name="help" size={13} className="mt-[2px] shrink-0 text-ink-400" />
        <span className={compact ? 'line-clamp-1' : ''}>{s.note}</span>
      </p>
    </div>
  );
}

/** 某个数据对象的全部格式样例；compact（浮动窗口）时一次显示一个，用页签切换文件 / 库表 / JSON */
export function FormatSamplesView({ k, compact }: { k: DataKey; compact?: boolean }) {
  const samples = useMemo(() => formatSamples(k), [k]);
  const [i, setI] = useState(0);
  if (!samples.length) return <p className="text-sm text-ink-500">暂无样例。</p>;
  if (compact) {
    const cur = samples[Math.min(i, samples.length - 1)];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-xs font-semibold text-ink-900">{cur.title}</span>
          <span className="ml-auto flex shrink-0 gap-1">
            {samples.map((x, j) => (
              <button
                key={j}
                type="button"
                onClick={() => setI(j)}
                className={cx('rounded-full px-2 text-2xs leading-[20px] transition-colors', j === i ? 'bg-ink-900 text-white' : 'bg-black/[0.05] text-ink-600 hover:bg-black/[0.09]')}
              >
                {KIND_LABEL[x.kind]}
              </button>
            ))}
          </span>
        </div>
        <SampleView s={cur} compact />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {samples.map((s, j) => (
        <SampleView key={j} s={s} />
      ))}
    </div>
  );
}

/** 全流程总览：按“文件 / 数据”分组浏览格式样例 */
export function FormatGallery({ groups }: { groups: { title: string; desc: string; items: { k: DataKey; label: string; hint: string }[] }[] }) {
  const [cur, setCur] = useState<DataKey>(groups[0].items[0].k);
  return (
    <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
      <nav aria-label="格式样例" className="space-y-4">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="px-2 text-xs font-semibold text-ink-800">{g.title}</div>
            <div className="px-2 pb-1.5 text-2xs leading-relaxed text-ink-500">{g.desc}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => (
                <li key={it.k}>
                  <button
                    type="button"
                    onClick={() => setCur(it.k)}
                    aria-current={cur === it.k ? 'true' : undefined}
                    className={cx('w-full rounded-[10px] px-2.5 py-2 text-left transition-colors', cur === it.k ? 'bg-primary-50 ring-1 ring-primary-100' : 'hover:bg-black/[0.035]')}
                  >
                    <div className={cx('text-[13px]', cur === it.k ? 'font-semibold text-ink-900' : 'text-ink-800')}>{it.label}</div>
                    <div className="text-2xs text-ink-500">{it.hint}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="sticky top-16 min-w-0 self-start">
        <FormatSamplesView key={cur} k={cur} />
      </div>
    </div>
  );
}
