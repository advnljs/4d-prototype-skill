import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import { DATA_OBJECTS } from '@/flow/dataObjects';
import { goToStep, stepStateOf, type FlowState, type StepState } from '@/flow/director';
import { DAG_COLS, DAG_MAX_ROW, DAG_MERGE_COL, DAG_MERGE_LABEL, DAG_POS, DAG_ROWS, EDGES, NECESSITY_LABEL, STEPS, STEP_INDEX, type StepId } from '@/flow/workflow';
import { ActorChip, NecessityTag } from './ActorChip';

const NODE_W_MAX = 164;
const NODE_W_MIN = 132;
const NODE_H = 60;
const ROW_H = 92;
/** 相邻两列节点之间至少留出的间距（放箭头） */
const MIN_GAP = 30;
const PAD_L = 96;
const PAD_T = 44;
const PAD_R = 8;
const PAD_B = 14;
const MAX_ROW = DAG_MAX_ROW;

const STATE_LABEL: Partial<Record<StepState, string>> = { running: '运行中', ready: '可执行', assumed: '视为完成', done: '已完成' };

/** 估算 2xs 字号一行文字的宽度：汉字约 12px，数字、字母与空格约 7px */
const textW = (t: string) => [...t].reduce((a, ch) => a + (/[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 7), 0);

/**
 * 流程依赖图（DAG）：行 = 业务分支，列 = 依赖深度。
 * 同一列的环节之间没有依赖，可以并行；箭头表示“下游必须等上游完成”，实线传递数据，虚线为时序依赖（日终、T+1 回流）。
 */
export function FlowDag({ f, selected, onSelect }: { f: FlowState; selected: StepId | null; onSelect: (id: StepId) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1300);
  const [hover, setHover] = useState<StepId | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // 节点宽度随可用宽度自适应：列多时先收窄节点，再不够才横向滚动
  const NODE_W = Math.max(NODE_W_MIN, Math.min(NODE_W_MAX, Math.floor((width - PAD_L - PAD_R) / DAG_COLS) - MIN_GAP));
  const colStep = Math.max(NODE_W + MIN_GAP, (width - PAD_L - PAD_R - NODE_W) / (DAG_COLS - 1));
  const W = PAD_L + PAD_R + NODE_W + colStep * (DAG_COLS - 1);
  const H = PAD_T + MAX_ROW * ROW_H + NODE_H + PAD_B;
  const x = (id: StepId) => PAD_L + DAG_POS[id].col * colStep;
  const y = (id: StepId) => PAD_T + DAG_POS[id].row * ROW_H;
  const focus = hover ?? selected;
  const running = f.active && f.status === 'running' ? STEPS[f.idx].id : null;
  const gap = colStep - NODE_W;
  const mergeX = PAD_L + DAG_MERGE_COL * colStep - gap / 2;

  return (
    <div ref={ref} className="overflow-x-auto">
      <div className="relative" style={{ width: W, height: H }}>
        {/* 汇合区：夜间 / 事后 */}
        <div className="absolute rounded-[14px] bg-ink-50/80" style={{ left: mergeX, top: 4, width: W - mergeX, height: H - 4 }} />
        <div className="absolute text-2xs font-medium text-ink-500" style={{ left: mergeX + 10, top: 8 }}>
          {DAG_MERGE_LABEL}
        </div>
        {/* 列头：依赖深度 */}
        {Array.from({ length: DAG_COLS }, (_, c) => (
          <div key={c} className="absolute text-center text-2xs text-ink-400" style={{ left: PAD_L + c * colStep, top: c >= DAG_MERGE_COL ? 24 : 12, width: NODE_W }}>
            第 {c + 1} 层{c === 0 ? ' · 可并行启动' : ''}
          </div>
        ))}
        {/* 行头：业务分支 */}
        {DAG_ROWS.map((r) => (
          <div key={r.row} className="absolute pr-3" style={{ left: 0, top: PAD_T + r.row * ROW_H + 10, width: PAD_L }}>
            <div className="text-xs font-semibold text-ink-800">{r.label}</div>
            <div className="text-2xs leading-4 text-ink-400">{r.desc}</div>
          </div>
        ))}

        {/* 依赖边 */}
        <svg className="pointer-events-none absolute inset-0" width={W} height={H} aria-hidden="true">
          <defs>
            {[
              ['gray', 'var(--color-ink-300)'],
              ['hot', 'var(--color-primary-500)'],
              ['done', 'var(--color-pine-500)'],
            ].map(([k, c]) => (
              <marker key={k} id={`dag-arrow-${k}`} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0,0.5 L8,4 L0,7.5 z" fill={c} />
              </marker>
            ))}
          </defs>
          {EDGES.map((e) => {
            const x1 = x(e.from) + NODE_W;
            const y1 = y(e.from) + NODE_H / 2;
            const x2 = x(e.to) - 2;
            const y2 = y(e.to) + NODE_H / 2;
            const dx = (x2 - x1) * 0.5;
            const hot = !!focus && (e.from === focus || e.to === focus);
            const live = running === e.to;
            const done = f.active && [e.from, e.to].every((id) => ['done', 'assumed'].includes(stepStateOf(f, id)));
            const kind = hot || live ? 'hot' : done ? 'done' : 'gray';
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={kind === 'hot' ? 'var(--color-primary-500)' : kind === 'done' ? 'var(--color-pine-500)' : 'var(--color-ink-300)'}
                strokeWidth={hot || live ? 2 : 1.4}
                strokeDasharray={e.data ? undefined : '5 4'}
                opacity={focus && !hot ? 0.28 : 1}
                markerEnd={`url(#dag-arrow-${kind})`}
                className={live ? 'dag-live' : undefined}
              />
            );
          })}
        </svg>
        {/* 选中环节相关边的标签：沿边传递的数据 */}
        {focus
          ? EDGES.filter((e) => e.from === focus || e.to === focus).map((e) => {
              const cx_ = (x(e.from) + NODE_W + x(e.to)) / 2;
              const cy = (y(e.from) + y(e.to)) / 2 + NODE_H / 2;
              return (
                <span
                  key={`l-${e.from}-${e.to}`}
                  className="anim-fade pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface px-1.5 py-px text-2xs font-medium text-primary-700 shadow-[0_1px_3px_rgb(0_0_0/0.12)] ring-1 ring-primary-100"
                  style={{ left: cx_, top: cy }}
                  title={e.data ? `${DATA_OBJECTS[e.data].name}（${DATA_OBJECTS[e.data].type}）` : '时序依赖'}
                >
                  {e.label}
                </span>
              );
            })
          : null}

        {/* 节点 */}
        {STEPS.map((s) => {
          const state = stepStateOf(f, s.id);
          const sel = s.id === selected;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.id)}
              onBlur={() => setHover(null)}
              aria-pressed={sel}
              title={`${s.title}${s.necessity ? `（${NECESSITY_LABEL[s.necessity]}）` : ''}`}
              className={cx(
                'absolute z-10 rounded-[12px] bg-surface px-2.5 py-1.5 text-left shadow-raise transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-pop',
                state === 'running' ? 'ring-2 ring-primary-500' : sel ? 'ring-2 ring-primary-300' : state === 'ready' ? 'outline-dashed outline-[1.5px] outline-offset-2 outline-primary-400 ring-1 ring-ink-950/[0.06]' : 'ring-1 ring-ink-950/[0.06]',
                state === 'assumed' && 'opacity-70',
                f.active && state === 'waiting' && 'opacity-60',
                s.necessity === 'optional' && 'border border-dashed border-ink-300 bg-ink-50',
              )}
              style={{ left: x(s.id), top: y(s.id), width: NODE_W, height: NODE_H, borderLeft: `3px solid ${ACTORS[s.actor].color}` }}
            >
              <NecessityTag n={s.necessity} className="absolute -top-2 right-2" />
              <span className="flex items-center gap-1.5">
                <StateBadge state={state} n={STEP_INDEX[s.id] + 1} />
                <span className="min-w-0 truncate text-[12.5px] font-semibold text-ink-900">{s.short}</span>
              </span>
              <span className="mt-1 flex items-center gap-1.5">
                {/* 放不下时操作方只显示图标（颜色与左边框一致），把位置留给时点：标签 + 时点 + 状态 > 节点内宽 */}
                <ActorChip actor={s.actor} size="xs" short iconOnly={27 + textW(ACTORS[s.actor].short) + 6 + textW(s.when) + (STATE_LABEL[state] ? 6 + textW(STATE_LABEL[state]!) : 0) > NODE_W - 23} />
                <span className="num truncate text-2xs text-ink-400">{s.when}</span>
                {STATE_LABEL[state] ? <span className={cx('ml-auto shrink-0 text-2xs font-medium', state === 'done' ? 'text-pine-600' : state === 'assumed' ? 'text-ink-400' : 'text-primary-600')}>{STATE_LABEL[state]}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StateBadge({ state, n }: { state: StepState; n: number }) {
  if (state === 'done')
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-pine-500 text-white">
        <Icon name="check" size={10} strokeWidth={2.8} />
      </span>
    );
  if (state === 'assumed')
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dashed border-ink-400 text-ink-500">
        <Icon name="check" size={9} strokeWidth={2.6} />
      </span>
    );
  return (
    <span className={cx('num flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold', state === 'running' ? 'bg-primary-500 text-white' : state === 'ready' ? 'bg-primary-50 text-primary-700' : 'bg-ink-100 text-ink-600')}>{n}</span>
  );
}

export function DagLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-2xs text-ink-500">
      <span className="flex items-center gap-1.5">
        <svg width="28" height="8" aria-hidden="true">
          <path d="M1 4 H27" stroke="var(--color-ink-400)" strokeWidth="1.5" />
        </svg>
        传递数据（选中环节显示数据名）
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="28" height="8" aria-hidden="true">
          <path d="M1 4 H27" stroke="var(--color-ink-400)" strokeWidth="1.5" strokeDasharray="5 4" />
        </svg>
        时序依赖（日终、T+1 回流）
      </span>
      <span>同一列之间没有依赖，可并行</span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-5 rounded-[4px] outline-dashed outline-[1.5px] outline-primary-400" />
        可执行（上游已全部完成）
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-3 rounded-full border border-dashed border-ink-400" />
        视为完成（跳转时使用已有数据）
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-[3px] rounded-full bg-ink-400" />
        左边框颜色 = 主责操作方
      </span>
      <span className="flex items-center gap-1">
        <NecessityTag n="required" />
        需求明确要求
      </span>
      <span className="flex items-center gap-1">
        <NecessityTag n="optional" />
        虚线框节点，去掉不影响核查结果
      </span>
      <span>未标注的环节均在需求范围内</span>
    </div>
  );
}

/* ---------------- 迷你依赖图（全局导航用） ---------------- */

export function MiniDag({ f, current, here = [], width, height }: { f: FlowState; current: StepId | null; here?: StepId[]; width: number; height: number }) {
  const pad = 4;
  const nw = Math.max(14, Math.round(width / 11));
  const nh = Math.max(8, Math.round(height / 7));
  const cs = (width - 2 * pad - nw) / (DAG_COLS - 1);
  const rs = (height - 2 * pad - nh) / MAX_ROW;
  const px = (id: StepId) => pad + DAG_POS[id].col * cs;
  const py = (id: StepId) => pad + DAG_POS[id].row * rs;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="全流程依赖图缩略">
      {EDGES.map((e) => {
        const x1 = px(e.from) + nw;
        const y1 = py(e.from) + nh / 2;
        const x2 = px(e.to);
        const y2 = py(e.to) + nh / 2;
        const dx = (x2 - x1) / 2;
        const done = f.active && ['done', 'assumed'].includes(stepStateOf(f, e.from));
        return <path key={`${e.from}-${e.to}`} d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke={done ? 'var(--color-pine-500)' : 'var(--color-ink-200)'} strokeWidth={1} />;
      })}
      {STEPS.map((s) => {
        const state = stepStateOf(f, s.id);
        const cur = s.id === current;
        const on = !f.active ? cur || here.includes(s.id) : ['done', 'running'].includes(state) || cur;
        return (
          <g key={s.id} onClick={() => goToStep(s.id)} className="cursor-pointer">
            <title>{`${STEP_INDEX[s.id] + 1}. ${s.short}（${ACTORS[s.actor].label}）${STATE_LABEL[state] ? ` · ${STATE_LABEL[state]}` : ''}`}</title>
            {cur ? <rect x={px(s.id) - 2.5} y={py(s.id) - 2.5} width={nw + 5} height={nh + 5} rx={(nh + 5) / 2} fill="none" stroke="var(--color-primary-500)" strokeWidth={1.5} className={state === 'running' ? 'anim-pulse' : undefined} /> : null}
            <rect
              x={px(s.id)}
              y={py(s.id)}
              width={nw}
              height={nh}
              rx={nh / 2}
              fill={ACTORS[s.actor].color}
              opacity={on ? 1 : state === 'ready' || state === 'assumed' ? 0.5 : 0.22}
              stroke={state === 'ready' ? 'var(--color-primary-500)' : 'none'}
              strokeDasharray={state === 'ready' ? '2 1.5' : undefined}
            />
            {/* 原型补充 · 可选：外加灰色虚线框 */}
            {s.necessity === 'optional' ? <rect x={px(s.id) - 1.5} y={py(s.id) - 1.5} width={nw + 3} height={nh + 3} rx={(nh + 3) / 2} fill="none" stroke="var(--color-ink-400)" strokeWidth={1} strokeDasharray="2 1.5" /> : null}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------- 详细依赖图（演示浮动窗口用） ---------------- */

/**
 * 比导航缩略图更详细：节点带编号、短标题、操作方颜色与状态；当前环节的上下游边高亮并标注传递的数据。
 */
export function DagDetail({ f, width, height, onPick, edgeLabels = false }: { f: FlowState; width: number; height: number; onPick?: (id: StepId) => void; edgeLabels?: boolean }) {
  const padL = 60;
  const padT = 20;
  const padR = 4;
  const padB = 2;
  // 列、行多时节点随窗口缩小，保证相邻节点之间留有箭头的位置
  const nw = Math.max(60, Math.min(86, Math.floor((width - padL - padR) / DAG_COLS) - 12));
  const cs = (width - padL - padR - nw) / (DAG_COLS - 1);
  const nh = Math.max(28, Math.min(40, Math.floor((height - padT - padB) / (MAX_ROW + 1)) - 4));
  const rs = (height - padT - padB - nh) / MAX_ROW;
  const x = (id: StepId) => padL + DAG_POS[id].col * cs;
  const y = (id: StepId) => padT + DAG_POS[id].row * rs;
  const cur = f.active ? STEPS[f.idx].id : null;
  const mergeX = padL + DAG_MERGE_COL * cs - (cs - nw) / 2;
  return (
    <div className="relative" style={{ width, height }}>
      <div className="absolute rounded-[10px] bg-ink-50" style={{ left: mergeX, top: 0, width: width - mergeX, height }} />
      <span className="absolute text-2xs text-ink-500" style={{ left: mergeX + 6, top: 2 }}>
        {DAG_MERGE_LABEL.split('（')[0]}
      </span>
      {Array.from({ length: DAG_MERGE_COL }, (_, c) => (
        <span key={c} className="absolute text-center text-2xs text-ink-400" style={{ left: padL + c * cs, top: 2, width: nw }}>
          第 {c + 1} 层
        </span>
      ))}
      {DAG_ROWS.map((r) => (
        <span key={r.row} className="absolute truncate text-2xs font-medium leading-4 text-ink-600" title={r.label} style={{ left: 0, top: padT + r.row * rs + nh / 2 - 8, width: padL - 6 }}>
          {/* 窗口里空间小：只显示行名的第一段（“营销 · 运营” → “营销”） */}
          {r.label.split(' · ')[0]}
        </span>
      ))}
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
        <defs>
          {[
            ['g', 'var(--color-ink-300)'],
            ['h', 'var(--color-primary-500)'],
            ['d', 'var(--color-pine-500)'],
          ].map(([k, c]) => (
            <marker key={k} id={`dd-arrow-${k}`} viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0.5 L8,4 L0,7.5 z" fill={c} />
            </marker>
          ))}
        </defs>
        {EDGES.map((e) => {
          const x1 = x(e.from) + nw;
          const y1 = y(e.from) + nh / 2;
          const x2 = x(e.to) - 1;
          const y2 = y(e.to) + nh / 2;
          const dx = (x2 - x1) * 0.5;
          const hot = !!cur && (e.from === cur || e.to === cur);
          const done = f.active && [e.from, e.to].every((id) => ['done', 'assumed'].includes(stepStateOf(f, id)));
          const k = hot ? 'h' : done ? 'd' : 'g';
          return (
            <path
              key={`${e.from}-${e.to}`}
              d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={k === 'h' ? 'var(--color-primary-500)' : k === 'd' ? 'var(--color-pine-500)' : 'var(--color-ink-300)'}
              strokeWidth={hot ? 1.8 : 1.2}
              strokeDasharray={e.data ? undefined : '4 3'}
              opacity={cur && !hot ? 0.45 : 1}
              markerEnd={`url(#dd-arrow-${k})`}
              className={hot && e.to === cur && f.status === 'running' ? 'dag-live' : undefined}
            />
          );
        })}
      </svg>
      {cur && edgeLabels
        ? EDGES.filter((e) => e.from === cur || e.to === cur).map((e) => (
            <span
              key={`l-${e.from}-${e.to}`}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface px-1.5 text-2xs leading-[16px] text-primary-700 shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-primary-100"
              style={{ left: (x(e.from) + nw + x(e.to)) / 2, top: (y(e.from) + y(e.to)) / 2 + nh / 2 }}
            >
              {e.label}
            </span>
          ))
        : null}
      {STEPS.map((s) => {
        const st = stepStateOf(f, s.id);
        const isCur = s.id === cur;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick?.(s.id)}
            title={`${STEP_INDEX[s.id] + 1}. ${s.title}（${ACTORS[s.actor].label}，${s.when}）${s.necessity ? ` · ${NECESSITY_LABEL[s.necessity]}` : ''}${STATE_LABEL[st] ? ` · ${STATE_LABEL[st]}` : ''}`}
            className={cx(
              'absolute z-10 flex items-start gap-1 rounded-[8px] bg-surface px-1.5 py-1 text-left shadow-[0_1px_2px_rgb(0_0_0/0.08)]',
              isCur ? 'ring-2 ring-primary-500' : st === 'ready' ? 'outline-dashed outline-[1.5px] outline-offset-1 outline-primary-400 ring-1 ring-ink-950/[0.06]' : 'ring-1 ring-ink-950/[0.06]',
              st === 'waiting' && 'opacity-55',
              st === 'assumed' && 'opacity-70',
              s.necessity === 'optional' && 'border border-dashed border-ink-300 bg-ink-50',
            )}
            style={{ left: x(s.id), top: y(s.id), width: nw, height: nh, borderLeft: `3px solid ${ACTORS[s.actor].color}` }}
          >
            {/* 标签浮在节点上沿之上，不遮挡环节名称 */}
            <NecessityTag n={s.necessity} short className="absolute -top-[15px] right-1" />
            <StateBadge state={st} n={STEP_INDEX[s.id] + 1} />
            <span className="line-clamp-2 text-2xs font-medium leading-[15px] text-ink-900">{s.short}</span>
          </button>
        );
      })}
    </div>
  );
}
