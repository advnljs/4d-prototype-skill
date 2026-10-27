import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { NecessityTag } from './ActorChip';
import { ACTORS, ACTOR_ORDER } from '@/flow/actors';
import { PHASES, STEPS, type StepId } from '@/flow/workflow';

const LANE_H = 62;
const HEAD_ROWS = 2;

/**
 * 泳道时序图：行 = 操作方，列 = 按时间顺序的环节。
 * 每列中实心卡片为主责操作方，小标签为参与方，竖线连接同一环节内的协作方。
 */
export function Swimlane({ selected, running, done, onSelect }: { selected: StepId | null; running: StepId | null; done: StepId[]; onSelect: (id: StepId) => void }) {
  const cols = STEPS.length;
  const lanes = ACTOR_ORDER.length;
  const laneRow = (a: string) => ACTOR_ORDER.indexOf(a as (typeof ACTOR_ORDER)[number]) + HEAD_ROWS + 1;
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="relative grid min-w-[1360px]"
        style={{ gridTemplateColumns: `150px repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `auto auto repeat(${lanes}, ${LANE_H}px)` }}
      >
        {/* 阶段表头 */}
        <div style={{ gridRow: 1, gridColumn: 1 }} />
        {PHASES.map((p, i) => {
          const start = STEPS.findIndex((s) => s.phase === p.key) + 2;
          const span = STEPS.filter((s) => s.phase === p.key).length;
          return (
            <div key={p.key} style={{ gridRow: 1, gridColumn: `${start} / span ${span}` }} className="px-1 pb-1.5">
              <div className={cx('rounded-[10px] px-2.5 py-1.5', i % 2 ? 'bg-ink-50' : 'bg-primary-50/70')}>
                <div className="truncate text-xs font-semibold text-ink-900">
                  阶段 {i + 1} · {p.title}
                </div>
                <div className="truncate text-2xs text-ink-500">{p.when}</div>
              </div>
            </div>
          );
        })}
        {/* 泳道底色与标签 */}
        {ACTOR_ORDER.map((a, r) => (
          <Fragment key={a}>
            <div style={{ gridRow: r + HEAD_ROWS + 1, gridColumn: `1 / span ${cols + 1}` }} className={cx('border-t border-black/[0.05]', r % 2 ? 'bg-ink-50/40' : '')} />
            <div style={{ gridRow: r + HEAD_ROWS + 1, gridColumn: 1 }} className="relative flex items-center gap-2 pr-2" title={ACTORS[a].desc}>
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: ACTORS[a].color }} />
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-ink-900">{ACTORS[a].label}</div>
                <div className="text-2xs text-ink-400">{ACTORS[a].kind}</div>
              </div>
            </div>
          </Fragment>
        ))}

        {/* 当前 / 选中列高亮 */}
        {STEPS.map((s, c) =>
          s.id === selected || s.id === running ? (
            <div
              key={`hl-${s.id}`}
              style={{ gridRow: `2 / span ${lanes + 1}`, gridColumn: c + 2 }}
              className={cx('pointer-events-none rounded-[12px]', s.id === running ? 'bg-primary-100/50 ring-1 ring-primary-200' : 'bg-primary-50/70')}
            />
          ) : null,
        )}

        {/* 时点行 */}
        <div style={{ gridRow: 2, gridColumn: 1 }} className="flex items-center gap-1 px-2 pb-2 text-2xs font-medium text-ink-500">
          <Icon name="clock" size={12} />
          时点 / 触发
        </div>
        {STEPS.map((s, c) => (
          <div key={s.id} style={{ gridRow: 2, gridColumn: c + 2 }} className="px-1 pb-2 text-center">
            <div className="num truncate text-2xs font-medium text-ink-700">{s.when}</div>
            <div className="truncate text-2xs text-ink-400">{s.trigger}</div>
          </div>
        ))}

        {/* 协作连线 + 节点 */}
        {STEPS.map((s, c) => {
          const rows = [s.actor, ...s.with].map(laneRow);
          const min = Math.min(...rows);
          const max = Math.max(...rows);
          const isDone = done.includes(s.id);
          return (
            <Fragment key={s.id}>
              {max > min ? (
                <div style={{ gridRow: `${min} / ${max + 1}`, gridColumn: c + 2 }} className="pointer-events-none relative">
                  <span className="absolute left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-ink-200" style={{ top: LANE_H / 2, bottom: LANE_H / 2 }} />
                </div>
              ) : null}
              {s.with.map((a) => (
                <div key={a} style={{ gridRow: laneRow(a), gridColumn: c + 2 }} className="relative z-10 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-1.5 py-px text-2xs text-ink-600 shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-black/[0.06]" title={`参与：${ACTORS[a].label}`}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACTORS[a].color }} />
                    {ACTORS[a].short}
                  </span>
                </div>
              ))}
              <div style={{ gridRow: laneRow(s.actor), gridColumn: c + 2 }} className="relative z-10 flex items-center px-1">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-pressed={s.id === selected}
                  title={s.title}
                  className={cx(
                    'relative block h-[52px] w-full rounded-[10px] bg-white px-1.5 py-1 text-left shadow-raise ring-1 transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-pop',
                    s.id === selected ? 'ring-2 ring-primary-400' : 'ring-black/[0.06]',
                    s.necessity === 'optional' && 'border border-dashed border-ink-300 bg-[#fafafb]',
                  )}
                  style={{ borderLeft: `3px solid ${ACTORS[s.actor].color}` }}
                >
                  <NecessityTag n={s.necessity} short className="absolute -top-2 right-1" />
                  <span className="line-clamp-3 text-[12px] font-medium leading-[14.5px] text-ink-900">
                    <span className={cx('num mr-1 inline-flex h-[13px] min-w-[13px] items-center justify-center rounded-full px-[3px] align-[-1px] text-[9.5px] font-semibold', isDone ? 'bg-pine-500 text-white' : 'bg-ink-100 text-ink-600')}>
                      {isDone ? <Icon name="check" size={9} strokeWidth={3} /> : STEPS.indexOf(s) + 1}
                    </span>
                    {s.short}
                  </span>
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
