import { useMemo, useRef, useState } from 'react';
import { cx } from '@/components/ui/primitives';

/* dataviz 参考调色：单色顺序色阶（蓝，浅 → 深） */
const SEQ = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281'];
const GRID = '#ececf0';
const AXIS = '#d2d2d7';
const MUTED = '#86868b';
const SERIES = '#0071e3';

/* ---------------- 折线图（单系列，十字准线 + 悬停提示） ---------------- */

export function LineChart({
  data,
  height = 240,
  yFormat = (v: number) => String(v),
  label,
  marks = [],
}: {
  data: { x: string; y: number; sub?: string }[];
  height?: number;
  yFormat?: (v: number) => string;
  label: string;
  marks?: { x: string; text: string }[];
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 900;
  const H = height;
  const pad = { l: 48, r: 56, t: 16, b: 28 };
  const ys = data.map((d) => d.y);
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  const span = max - min || 1;
  const lo = Math.max(0, min - span * 0.2);
  const hi = max + span * 0.15;
  const x = (i: number) => pad.l + (i / Math.max(1, data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);
  }, [lo, hi]);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.y).toFixed(1)}`).join('');
  const area = `${path}L${x(data.length - 1)},${H - pad.b}L${x(0)},${H - pad.b}Z`;
  const last = data.length - 1;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={i === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={MUTED} className="num">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % 5 === 0 || i === last ? (
            <text key={d.x} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill={MUTED}>
              {d.x.slice(5)}
            </text>
          ) : null,
        )}
        {marks.map((m) => {
          const i = data.findIndex((d) => d.x === m.x);
          if (i < 0) return null;
          return (
            <g key={m.x}>
              <line x1={x(i)} x2={x(i)} y1={pad.t} y2={H - pad.b} stroke={AXIS} strokeWidth={1} />
              <text x={x(i) + 4} y={pad.t + 10} fontSize={11} fill={MUTED}>
                {m.text}
              </text>
            </g>
          );
        })}
        <path d={area} fill={SERIES} opacity={0.1} />
        <path d={path} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(last)} cy={y(data[last].y)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />
        <text x={x(last) + 8} y={y(data[last].y) + 4} fontSize={12} fill="#172230" fontWeight={600}>
          {yFormat(data[last].y)}
        </text>
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#8d96a1" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(data[hover].y)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-2 rounded-[12px] border border-black/[0.07] bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: `calc(${(x(hover) / W) * 100}% + ${hover > data.length * 0.7 ? -150 : 12}px)` }}
        >
          <div className="num text-sm font-semibold text-ink-900">{yFormat(data[hover].y)}</div>
          <div className="text-ink-500">{data[hover].x}</div>
          {data[hover].sub ? <div className="text-ink-500">{data[hover].sub}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- 热力图（单色顺序色阶） ---------------- */

export function Heatmap({
  rows,
  cols,
  values,
  format = (v: number) => String(v),
  label,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  format?: (v: number) => string;
  label: string;
}) {
  const flat = values.flat();
  const max = Math.max(...flat, 1);
  const color = (v: number) => SEQ[Math.min(SEQ.length - 1, Math.floor((v / max) * (SEQ.length - 1)))];
  const ink = (v: number) => (v / max > 0.55 ? '#ffffff' : '#172230');
  const [hover, setHover] = useState<[number, number] | null>(null);
  return (
    <div role="img" aria-label={label}>
      <div className="grid gap-[2px]" style={{ gridTemplateColumns: `minmax(8rem,auto) repeat(${cols.length}, minmax(0,1fr))` }}>
        <div />
        {cols.map((c) => (
          <div key={c} className="px-1 pb-1 text-center text-2xs leading-tight text-ink-500">
            {c}
          </div>
        ))}
        {rows.map((r, i) => (
          <div key={r} className="contents">
            <div className="flex items-center pr-3 text-xs text-ink-700">{r}</div>
            {cols.map((c, j) => {
              const v = values[i][j];
              const on = hover && hover[0] === i && hover[1] === j;
              return (
                <div
                  key={c}
                  tabIndex={0}
                  onPointerEnter={() => setHover([i, j])}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover([i, j])}
                  onBlur={() => setHover(null)}
                  title={`${r}，${c}：${format(v)}`}
                  className={cx('num flex h-9 items-center justify-center rounded-[4px] text-xs transition-[outline] duration-100', on && 'outline outline-2 outline-ink-800')}
                  style={{ background: color(v), color: ink(v) }}
                >
                  {format(v)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-2xs text-ink-500">
        <span>少</span>
        <span className="flex h-2 w-40 overflow-hidden rounded-full">
          {SEQ.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </span>
        <span>多</span>
        {hover ? (
          <span className="ml-3 text-ink-700">
            {rows[hover[0]]}，{cols[hover[1]]}：<span className="num font-semibold">{format(values[hover[0]][hover[1]])}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- 条形列表（单系列，数值在条端） ---------------- */

export function BarList({ items, format = (v: number) => String(v), highlight }: { items: { label: string; value: number; sub?: string }[]; format?: (v: number) => string; highlight?: (v: number) => boolean }) {
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  return (
    <ul className="space-y-2">
      {items.map((it) => (
        <li key={it.label} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3" title={`${it.label}：${format(it.value)}${it.sub ? `（${it.sub}）` : ''}`}>
          <span className="truncate text-xs text-ink-700">{it.label}</span>
          <span className="flex items-center gap-2">
            <span className="h-3.5 rounded-r-[4px]" style={{ width: `calc(${(it.value / max) * 100}% - 3.5rem)`, background: highlight?.(it.value) ? '#1c5cab' : '#86b6ef', minWidth: 4 }} />
            <span className="num shrink-0 text-xs text-ink-800">{format(it.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
