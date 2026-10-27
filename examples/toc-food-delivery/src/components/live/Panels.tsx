import { Fragment } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ActorChip } from '@/components/flow/ActorChip';
import { RIDERS, RIDER_MAP } from '@/domain/catalog';
import { WEIGHT_LABEL, capacityForecast, type Candidate, type DispatchDecision, type Weights } from '@/domain/dispatch';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { MAIN_PATH, RIDER_STATE_LABEL, STATUS_LABEL } from '@/domain/orderMachine';
import { T, clockLabel, reached, type EventKind, type World } from '@/sim/world';
import type { ActorKey } from '@/flow/actors';

/* ---------------- 派单打分 ---------------- */

const FACTORS: (keyof Weights)[] = ['distance', 'load', 'align', 'rating'];

export function ScoreBars({ c, weights, best }: { c: Candidate; weights: Weights; best: boolean }) {
  const sum = FACTORS.reduce((a, k) => a + weights[k], 0) || 1;
  const colors: Record<keyof Weights, string> = { distance: '#d1307a', load: '#f08bb6', align: '#7c42c2', rating: '#b9a6dc' };
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-100" title={FACTORS.map((k) => `${WEIGHT_LABEL[k]} ${c.parts[k].toFixed(2)} × ${(weights[k] / sum).toFixed(2)}`).join('\n')}>
      {FACTORS.map((k) => (
        <span key={k} className="h-full transition-[width] duration-500 ease-out" style={{ width: `${(c.parts[k] * weights[k] * 100) / sum}%`, background: colors[k], opacity: best ? 1 : 0.55 }} />
      ))}
    </div>
  );
}

/** 派单之前：午高峰运力预测与商家附近的在线骑手（“骑手上线”环节） */
function CapacityBoard({ w }: { w: World }) {
  const online = reached(w, 'online');
  const f = w.pool?.forecast ?? capacityForecast(SCENARIO_MAP[w.scenario].params.weather);
  return (
    <div data-flow-anchor="dispatch-panel" className="flex h-full flex-col">
      <div className="flex items-center gap-2 text-xs">
        <ActorChip actor="dispatch" size="xs" />
        <span className="font-semibold text-ink-900">午高峰运力预测</span>
        <span className="num text-2xs text-ink-400">{f.window} · 滨湖区</span>
        <span className={cx('ml-auto rounded-full px-2 py-0.5 text-2xs font-medium', online ? 'bg-pine-50 text-pine-700' : 'bg-ink-100 text-ink-500')}>{online ? '运力池就绪' : '骑手未上线'}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {(
          [
            ['预计订单', f.orders],
            ['所需骑手', f.need],
            ['已上线', f.online],
            ['缺口', f.gap],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-[10px] bg-ink-50 px-2.5 py-1.5">
            <div className="text-2xs text-ink-500">{k}</div>
            <div className={cx('num text-[16px] font-bold', k === '缺口' && f.gap ? 'text-amber-700' : 'text-ink-900')}>{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 truncate text-2xs text-ink-500" title={f.action}>
        {f.action}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
        <span className="text-2xs text-ink-500">商家附近</span>
        {RIDERS.map((r) => (
          <span key={r.id} className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs transition-colors duration-300', online ? 'bg-[#e8f7f0] text-[#0b7a55]' : 'bg-ink-100 text-ink-400')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', online ? 'bg-[#0e9f6e]' : 'bg-ink-300')} />
            {r.short} · 手上 {r.load} 单
          </span>
        ))}
        <span className="ml-auto text-2xs text-ink-400">{online ? '支付后从这里召回骑手打分' : ''}</span>
      </div>
    </div>
  );
}

export function DispatchBoard({ d, reassigned, compact, w }: { d: DispatchDecision | null; reassigned?: World['reassign']; compact?: boolean; w?: World }) {
  if (!d && w) return <CapacityBoard w={w} />;
  if (!d)
    return (
      <div data-flow-anchor="dispatch-panel" className="flex h-full items-center justify-center gap-2 rounded-[14px] bg-ink-50/80 text-xs text-ink-500">
        <Icon name="sparkle" size={14} className="text-[#d1307a]" />
        支付成功后，智能调度在这里召回骑手并打分
      </div>
    );
  const dd = reassigned?.decision ?? d;
  return (
    <div data-flow-anchor="dispatch-panel" className="flex h-full flex-col">
      <div className="flex items-center gap-2 text-xs">
        <ActorChip actor="dispatch" size="xs" />
        <span className="font-semibold text-ink-900">{reassigned ? '改派重新打分' : '派单打分'}</span>
        <span className="num text-2xs text-ink-400">{clockLabel(dd.at)}</span>
        <span className="ml-auto flex items-center gap-2 text-2xs text-ink-500">
          {FACTORS.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: { distance: '#d1307a', load: '#f08bb6', align: '#7c42c2', rating: '#b9a6dc' }[k] }} />
              {WEIGHT_LABEL[k]} {Math.round(dd.weights[k] * 100)}%
            </span>
          ))}
        </span>
      </div>
      <table className="mt-2 w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[68px]" />
          <col className="w-[64px]" />
          <col className="w-[48px]" />
          <col />
          <col className="w-[48px]" />
          <col className="w-[72px]" />
        </colgroup>
        <thead className="text-left text-2xs text-ink-400">
          <tr>
            <th className="pb-1 font-normal">骑手</th>
            <th className="pb-1 font-normal">到店</th>
            <th className="pb-1 font-normal">手上</th>
            <th className="pb-1 font-normal">得分构成</th>
            <th className="pb-1 text-right font-normal">得分</th>
            <th className="pb-1 text-right font-normal" />
          </tr>
        </thead>
        <tbody>
          {dd.candidates.map((c) => {
            const best = c.riderId === dd.chosen;
            const out = reassigned && c.riderId === reassigned.from;
            return (
              <tr key={c.riderId} className={cx('transition-colors', best && 'bg-[#fdf0f6]')}>
                <td className="rounded-l-[8px] py-1.5 pl-1.5 font-medium text-ink-900">{c.name}</td>
                <td className="num text-ink-600">{c.km.toFixed(1)} km</td>
                <td className="num text-ink-600">{c.load} 单</td>
                <td className="pr-3">
                  <ScoreBars c={c} weights={dd.weights} best={best} />
                </td>
                <td className={cx('num text-right font-semibold', best ? 'text-[#a3245f]' : 'text-ink-700')}>{c.score.toFixed(2)}</td>
                <td className="rounded-r-[8px] pr-1.5 text-right">
                  {best ? <span className="rounded-full bg-[#d1307a] px-1.5 py-px text-2xs font-semibold text-white">选中</span> : out ? <span className="rounded-full bg-seal-100 px-1.5 py-px text-2xs text-seal-600">故障</span> : c.excluded ? <span className="text-2xs text-ink-400">{c.excluded}</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!compact ? (
        <p className="mt-auto pt-1.5 text-2xs leading-relaxed text-ink-500">
          <b className="font-semibold text-ink-700">理由：</b>
          {dd.reason}。预计 {clockLabel(dd.eta.arrive)} 到店、{clockLabel(dd.eta.ready)} 出餐、{clockLabel(dd.eta.deliver)} 送达，承诺 {clockLabel(d.promisedAt)} 前。
        </p>
      ) : null}
    </div>
  );
}

/* ---------------- 订单状态条 + 时间轴 ---------------- */

export function StateStrip({ w }: { w: World }) {
  const o = w.order;
  const status = o?.status ?? null;
  const idx = status ? MAIN_PATH.indexOf(status) : -1;
  const refund = status === 'refunding' || status === 'refunded';
  return (
    <div data-flow-anchor="state-strip" className="rounded-[16px] bg-surface px-5 py-3.5 shadow-raise ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-2 text-xs">
        <Icon name="receipt" size={14} className="text-primary-500" />
        <span className="font-semibold text-ink-900">订单状态机</span>
        {o ? <span className="code text-ink-400">{o.no}</span> : <span className="text-ink-400">尚未下单</span>}
        {o ? (
          <span className="ml-auto flex items-center gap-1.5 text-2xs text-ink-500">
            配送子状态
            <span className="rounded-full bg-[#e8f7f0] px-2 py-px font-medium text-[#0b7a55]">{RIDER_STATE_LABEL[o.riderState]}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center">
        {MAIN_PATH.map((s, i) => {
          const done = refund || idx > i || (s === 'settled' && refund);
          const cur = idx === i && !refund;
          return (
            <Fragment key={s}>
              {i > 0 ? <span className={cx('h-[2px] flex-1 rounded-full transition-colors duration-500', done || cur ? 'bg-primary-400' : 'bg-ink-150')} /> : null}
              <span
                key={cur ? `${s}-cur` : s}
                className={cx(
                  'shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-300',
                  cur ? 'anim-pop brand-grad text-white shadow-[0_6px_14px_-6px_rgb(242_90_15/0.8)]' : done ? 'bg-primary-50 text-primary-700' : 'bg-ink-50 text-ink-400',
                )}
              >
                {STATUS_LABEL[s]}
              </span>
            </Fragment>
          );
        })}
        <span className={cx('ml-2 h-[2px] w-4 rounded-full', refund ? 'bg-amber-500' : 'bg-ink-150')} />
        <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-2xs font-medium', refund ? 'anim-pop bg-amber-500 text-white' : 'border border-dashed border-ink-300 text-ink-400')}>{status === 'refunding' ? '退款中' : status === 'refunded' ? '部分退款' : '售后'}</span>
      </div>
    </div>
  );
}

interface Mile {
  key: string;
  label: string;
  at?: number;
}

export function OrderTimeline({ w, clock }: { w: World; clock: number }) {
  const o = w.order;
  const plan = w.plan;
  const miles: Mile[] = [
    { key: 'order', label: '下单', at: o?.createdAt },
    { key: 'pay', label: '支付', at: o?.paidAt },
    { key: 'accept', label: '接单', at: o?.acceptedAt },
    { key: 'dispatch', label: '派单', at: w.dispatch?.at },
    { key: 'arrive', label: '到店', at: reached(w, 'arrived') ? plan?.arriveAt : undefined },
    { key: 'ready', label: '出餐', at: o?.readyAt },
    { key: 'pickup', label: '取餐', at: o?.pickedAt },
    { key: 'deliver', label: '送达', at: o?.deliveredAt },
  ];
  const t0 = T.order;
  const t1 = Math.max(o?.promisedAt ?? t0 + 35, plan?.deliverAt ?? 0) + 3;
  const x = (t: number) => `${Math.max(0, Math.min(100, ((t - t0) / (t1 - t0)) * 100))}%`;
  const now = o && !reached(w, 'delivered') ? Math.min(clock, t1) : o?.deliveredAt;
  const elapsed = o ? Math.round(((o.deliveredAt ?? now ?? t0) - t0) * 10) / 10 : 0;
  return (
    <div data-flow-anchor="order-timeline" className="rounded-[16px] bg-surface px-5 pb-4 pt-3.5 shadow-raise ring-1 ring-black/[0.04]">
      <div className="flex items-center gap-2 text-xs">
        <Icon name="timer" size={14} className="text-primary-500" />
        <span className="font-semibold text-ink-900">履约时间轴</span>
        <span className="text-ink-500">下单 → 送达</span>
        {o ? (
          <span className={cx('num ml-auto font-semibold', w.late ? 'text-amber-600' : 'text-ink-800')}>
            {reached(w, 'delivered') ? `用时 ${Math.round(elapsed)} 分钟` : `已进行 ${Math.max(0, Math.floor(elapsed))} 分钟`}
            {o.promisedAt ? <span className="ml-2 font-normal text-ink-500">承诺 {clockLabel(o.promisedAt)} 前</span> : null}
          </span>
        ) : null}
      </div>
      <div className="relative mt-7 h-2 rounded-full bg-ink-100">
        {o && now !== undefined ? <div className={cx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-300', w.late ? 'bg-amber-500' : 'brand-grad')} style={{ width: x(now) }} /> : null}
        {o?.promisedAt ? (
          <div className="absolute -top-6 bottom-[-6px] w-0 border-l-2 border-dashed border-ink-400" style={{ left: x(o.promisedAt) }}>
            <span className="num absolute -top-1 left-1 whitespace-nowrap text-2xs font-medium text-ink-600">承诺</span>
          </div>
        ) : null}
        {miles.map((m) =>
          m.at !== undefined ? (
            <span key={m.key} className="anim-pop absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-primary-500 shadow" style={{ left: x(m.at) }} title={`${m.label} ${clockLabel(m.at)}`} />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-8 gap-1">
        {miles.map((m) => (
          <div key={m.key} className={cx('text-center leading-tight', m.at !== undefined ? 'text-ink-800' : 'text-ink-300')}>
            <div className="text-2xs">{m.label}</div>
            <div className="num text-xs font-semibold">{m.at !== undefined ? clockLabel(m.at) : '--:--'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 平台事件流 ---------------- */

const KIND_CLS: Record<EventKind, string> = {
  info: 'bg-ink-300',
  ok: 'bg-pine-500',
  warn: 'bg-amber-500',
  error: 'bg-seal-500',
};

export function EventLog({ w, className }: { w: World; className?: string }) {
  const list = [...w.events].sort((a, b) => b.at - a.at);
  return (
    <div data-flow-anchor="event-log" className={cx('flex min-h-0 flex-col rounded-[16px] bg-surface px-4 pt-3.5 shadow-raise ring-1 ring-black/[0.04]', className)}>
      <div className="flex items-center gap-2 text-xs">
        <Icon name="zap" size={14} className="text-primary-500" />
        <span className="font-semibold text-ink-900">平台事件流</span>
        <span className="text-ink-500">后台、调度与外部系统在做什么</span>
        <span className="num ml-auto text-2xs text-ink-400">{w.events.length} 条</span>
      </div>
      <ol className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pb-3 pr-1">
        {list.length ? (
          list.map((e, i) => (
            <li key={`${e.at}-${e.title}`} className={cx('flex gap-2.5 rounded-[10px] px-2 py-1.5', i === 0 && 'anim-rise bg-primary-50/60')}>
              <span className={cx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', KIND_CLS[e.kind])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="num w-[62px] shrink-0 text-2xs text-ink-400">{clockLabel(e.at)}</span>
                  <ActorChip actor={e.who as ActorKey} size="xs" short />
                  <span className={cx('min-w-0 truncate text-xs font-medium', e.kind === 'warn' ? 'text-amber-700' : e.kind === 'error' ? 'text-seal-600' : 'text-ink-900')}>{e.title}</span>
                </div>
                {e.detail ? <p className="ml-[68px] mt-0.5 line-clamp-2 text-2xs leading-[16px] text-ink-500">{e.detail}</p> : null}
              </div>
            </li>
          ))
        ) : (
          <li className="py-6 text-center text-xs text-ink-400">还没有事件。点“一键运行完整流程”，或直接操作三台手机。</li>
        )}
      </ol>
    </div>
  );
}

export function riderLabel(id: string | null | undefined) {
  return id ? RIDER_MAP[id].short : '—';
}
