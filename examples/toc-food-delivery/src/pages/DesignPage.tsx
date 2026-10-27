import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Panel, cx } from '@/components/ui/primitives';
import { ScoreBars } from '@/components/live/Panels';
import { DEFAULT_WEIGHTS, WEIGHT_LABEL, decide, type Weights } from '@/domain/dispatch';
import { LUNCH_COUPON, price, type CartLine } from '@/domain/pricing';
import { riderPay, settleOrder } from '@/domain/settlement';
import { RIDER_MAP } from '@/domain/catalog';
import { rmb } from '@/lib/format';
import { T, clockLabel } from '@/sim/world';

/** 方案讨论：调度权重、回调幂等、券门槛口径与补贴，都用原型里的同一套逻辑算给你看 */
export function DesignPage() {
  return (
    <>
      <PageHeader title="方案讨论" crumbs={['原型讨论区', '方案讨论']} desc="挑三个最常被追问的设计问题：派单怎么选人、重复回调怎么办、券门槛按什么算。数字都由原型里的同一套模拟逻辑实时计算。" />
      <div className="space-y-6 px-10 pb-8 pt-5">
        <DispatchTuner />
        <div className="grid grid-cols-12 gap-6">
          <Idempotency />
          <CouponBasis />
        </div>
      </div>
    </>
  );
}

/* ---------------- 调度权重 ---------------- */

const KEYS: (keyof Weights)[] = ['distance', 'load', 'align', 'rating'];
const PRESETS: { label: string; w: Weights; note: string }[] = [
  { label: '默认（均衡）', w: DEFAULT_WEIGHTS, note: '距离为主，兼顾负载与顺路' },
  { label: '最近优先', w: { distance: 0.8, load: 0.1, align: 0.05, rating: 0.05 }, note: '只看谁离商家近' },
  { label: '顺路优先', w: { distance: 0.25, load: 0.2, align: 0.45, rating: 0.1 }, note: '骑手单均收入高，但新骑手接不到单' },
  { label: '服务优先', w: { distance: 0.25, load: 0.2, align: 0.15, rating: 0.4 }, note: '好评骑手优先，可能更远' },
];

function DispatchTuner() {
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);
  const d = useMemo(() => decide({ at: T.dispatch, acceptedAt: T.accept, prepMin: 12, weather: 'clear', weights: w }), [w]);
  const base = useMemo(() => decide({ at: T.dispatch, acceptedAt: T.accept, prepMin: 12, weather: 'clear' }), []);
  const sum = KEYS.reduce((a, k) => a + w[k], 0) || 1;
  return (
    <Panel title="派单怎么选人：拖动权重，看结果怎么变" desc="同一单、同样四名骑手。权重自动归一化；结果、ETA 与承诺时间实时重算。">
      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-4 space-y-4">
          {KEYS.map((k) => (
            <label key={k} className="block">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink-800">{WEIGHT_LABEL[k]}</span>
                <span className="num text-xs text-ink-500">{Math.round((w[k] / sum) * 100)}%</span>
              </div>
              <input type="range" min={0} max={100} value={Math.round(w[k] * 100)} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) / 100 })} className="mt-1.5 w-full accent-act-dispatch" aria-label={`${WEIGHT_LABEL[k]}权重`} />
            </label>
          ))}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => setW(p.w)} title={p.note} className="rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-700 ring-1 ring-ink-950/[0.05] hover:bg-ink-100">
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-8">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[84px]" />
              <col className="w-[86px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col />
              <col className="w-[64px]" />
            </colgroup>
            <thead className="text-left text-xs text-ink-500">
              <tr>
                <th className="pb-2 font-medium">骑手</th>
                <th className="pb-2 font-medium">到店距离</th>
                <th className="pb-2 font-medium">手上</th>
                <th className="pb-2 font-medium">顺路度</th>
                <th className="pb-2 font-medium">得分构成</th>
                <th className="pb-2 text-right font-medium">得分</th>
              </tr>
            </thead>
            <tbody>
              {d.candidates.map((c) => (
                <tr key={c.riderId} className={cx('transition-colors duration-300', c.riderId === d.chosen && 'bg-act-dispatch/[0.07]')}>
                  <td className="rounded-l-[10px] py-2 pl-2 font-medium text-ink-900">
                    {c.name}
                    {c.riderId === d.chosen ? <span className="ml-1.5 rounded-full bg-act-dispatch px-1.5 text-2xs text-surface">选中</span> : null}
                  </td>
                  <td className="num text-ink-600">{c.km.toFixed(2)} km</td>
                  <td className="num text-ink-600">{c.load} 单</td>
                  <td className="num text-ink-600">{c.align}</td>
                  <td className="pr-4">
                    <ScoreBars c={c} weights={w} best={c.riderId === d.chosen} />
                  </td>
                  <td className="num rounded-r-[10px] pr-2 text-right font-semibold">{c.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              ['选中骑手', RIDER_MAP[d.chosen].short, d.chosen !== base.chosen ? `默认是${RIDER_MAP[base.chosen].short}` : '与默认一致'],
              ['预计送达', clockLabel(d.eta.deliver), `承诺 ${clockLabel(d.promisedAt)} 前`],
              ['选择理由', d.reason.split('：')[1] ?? d.reason, d.reason.split('：')[0]],
            ].map(([k, v, hint]) => (
              <div key={k} className="rounded-[14px] bg-ink-50 px-4 py-3">
                <div className="text-xs text-ink-500">{k}</div>
                <div className="mt-0.5 truncate text-[17px] font-semibold text-ink-900">{v}</div>
                <div className="truncate text-2xs text-ink-400">{hint}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-600">
            讨论点：“最近优先”会把单派给手上已有 3 单、方向相反的老马，这一单反而更晚送到；“顺路优先”提高骑手单均收入，但会让新骑手长期接不到单。权重与召回半径属于待确认事项 Q-03。
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ---------------- 回调幂等 ---------------- */

function Idempotency() {
  const rows: { y: number; from: 'gw' | 'pf'; text: string; tone: 'ok' | 'warn' | 'muted'; note: string }[] = [
    { y: 46, from: 'gw', text: '回调 #1  trade_no=GW…', tone: 'ok', note: '验签 ✓ 金额 ✓ → 订单已支付，推送商家' },
    { y: 96, from: 'pf', text: 'ack（网络抖动，网关没收到）', tone: 'muted', note: '' },
    { y: 150, from: 'gw', text: '回调 #2  同一 trade_no', tone: 'warn', note: '查流水表：已处理 → 直接 ack' },
    { y: 200, from: 'pf', text: 'ack', tone: 'ok', note: '不改状态、不重复推送' },
  ];
  return (
    <Panel className="col-span-6" title="重复回调怎么办：按 trade_no 幂等" desc="网关没收到 ack 会重发回调，这是正常现象。平台以网关流水号为幂等键，流水表加唯一索引兜底。">
      <svg viewBox="0 0 560 240" className="w-full" role="img" aria-label="支付回调时序">
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 8 4 0 8z" style={{ fill: 'var(--color-ink-500)' }} />
          </marker>
        </defs>
        {[
          [90, '支付网关（模拟）', 'color-mix(in oklab, var(--color-act-gateway) 80%, black)'],
          [470, '平台支付服务', 'color-mix(in oklab, var(--color-act-platform) 80%, black)'],
        ].map(([x, l, c]) => (
          <g key={l as string}>
            <rect x={(x as number) - 70} y="2" width="140" height="26" rx="13" style={{ fill: c as string }} />
            <text x={x as number} y="19.5" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="#fff">
              {l}
            </text>
            <line x1={x as number} y1="30" x2={x as number} y2="236" style={{ stroke: 'var(--color-ink-200)' }} strokeDasharray="4 4" />
          </g>
        ))}
        {rows.map((r) => {
          const x1 = r.from === 'gw' ? 92 : 468;
          const x2 = r.from === 'gw' ? 466 : 94;
          return (
            <g key={r.y}>
              <line x1={x1} y1={r.y} x2={x2} y2={r.y} style={{ stroke: r.tone === 'warn' ? 'var(--color-amber-500)' : r.tone === 'muted' ? 'var(--color-ink-300)' : 'var(--color-ink-500)' }} strokeWidth="1.6" strokeDasharray={r.tone === 'muted' ? '5 4' : undefined} markerEnd="url(#arr)" />
              <text x="280" y={r.y - 7} textAnchor="middle" fontSize="12" style={{ fill: r.tone === 'warn' ? 'var(--color-amber-700)' : 'var(--color-ink-700)' }}>
                {r.text}
              </text>
              {r.note ? (
                <text x={r.from === 'gw' ? 470 : 90} y={r.y + 18} textAnchor="middle" fontSize="11" style={{ fill: 'var(--color-ink-400)' }}>
                  {r.note}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-ink-600">
        <li className="flex gap-1.5">
          <Icon name="check" size={13} className="mt-[3px] shrink-0 text-pine-500" />
          先查后写，并用 <code className="code">pay_notify_log.trade_no</code> 唯一索引兜底：并发的两次回调只会成功写入一次。
        </li>
        <li className="flex gap-1.5">
          <Icon name="check" size={13} className="mt-[3px] shrink-0 text-pine-500" />
          状态机拒绝“已支付 → 已支付”，即使幂等漏了也不会重复推送商家。
        </li>
        <li className="flex gap-1.5">
          <Icon name="help" size={13} className="mt-[3px] shrink-0 text-amber-600" />
          待确认（Q-02）：网关的签名算法、重试间隔与最大次数、主动查单的兜底频率。
        </li>
      </ul>
      <div className="mt-3">
        <Badge tone="primary">在“三端联动”选择情景“支付回调重复”可以看到完整过程</Badge>
      </div>
    </Panel>
  );
}

/* ---------------- 券门槛口径与补贴 ---------------- */

const CARTS: { label: string; lines: CartLine[] }[] = [
  {
    label: '牛肉面 + 卤蛋 + 凉拌黄瓜（原价 40）',
    lines: [
      { dishId: 'D01', qty: 1 },
      { dishId: 'D03', qty: 1 },
      { dishId: 'D05', qty: 1 },
    ],
  },
  {
    label: '两碗面 + 两个卤蛋（原价 56）',
    lines: [
      { dishId: 'D01', qty: 1 },
      { dishId: 'D02', qty: 1 },
      { dishId: 'D03', qty: 2 },
    ],
  },
];

function CouponBasis() {
  const [rain, setRain] = useState(false);
  const pub = { ...LUNCH_COUPON, status: 'published' as const, version: 1 };
  const rows = CARTS.map((c) => {
    const after = price({ lines: c.lines, coupon: pub, distanceKm: 3.3, weather: rain ? 'rain' : 'clear' });
    const orig = price({ lines: c.lines, coupon: { ...pub, basis: 'original' }, distanceKm: 3.3, weather: rain ? 'rain' : 'clear' });
    const net = (p: typeof after) => settleOrder('X', '', p, riderPay({ extraKm: 1, rain, waitMin: 0 })).platformNet;
    return { label: c.label, after, orig, netAfter: net(after), netOrig: net(orig) };
  });
  return (
    <Panel
      className="col-span-6"
      title="券门槛按什么算：口径与平台补贴"
      desc="同一张满 40 减 8 平台券，两种门槛口径下用户实付与平台每单净收入的差别。"
      actions={
        <Button size="sm" icon="rain" variant={rain ? 'primary' : 'secondary'} onClick={() => setRain(!rain)}>
          {rain ? '雨天' : '晴天'}
        </Button>
      }
    >
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th className="pb-2 font-medium">购物车</th>
            <th className="pb-2 font-medium">口径</th>
            <th className="pb-2 text-right font-medium">券</th>
            <th className="pb-2 text-right font-medium">用户实付</th>
            <th className="pb-2 text-right font-medium">平台净收入</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-950/[0.05]">
          {rows.flatMap((r) => [
            <tr key={`${r.label}-a`}>
              <td rowSpan={2} className="py-2 pr-3 align-top text-xs text-ink-700">
                {r.label}
              </td>
              <td className="py-2 text-xs">
                商家优惠后 <span className="text-primary-600">（原型）</span>
              </td>
              <td className="num py-2 text-right">{r.after.couponApplied ? `-${rmb(r.after.couponOff)}` : '不可用'}</td>
              <td className="num py-2 text-right font-medium">{rmb(r.after.payable)}</td>
              <td className={cx('num py-2 text-right', r.netAfter < 0 ? 'text-amber-700' : 'text-ink-800')}>{rmb(r.netAfter)}</td>
            </tr>,
            <tr key={`${r.label}-b`}>
              <td className="py-2 text-xs">商品原价</td>
              <td className="num py-2 text-right">{r.orig.couponApplied ? `-${rmb(r.orig.couponOff)}` : '不可用'}</td>
              <td className="num py-2 text-right font-medium">{rmb(r.orig.payable)}</td>
              <td className={cx('num py-2 text-right', r.netOrig < 0 ? 'text-amber-700' : 'text-ink-800')}>{rmb(r.netOrig)}</td>
            </tr>,
          ])}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-ink-600">
        按原价口径，40 元那单也能用券，用户多省 8 元，但这一单平台净收入转负；雨天骑手补贴再加 3 元，补贴压力更大。原型采用“商家优惠后”口径（B-02），最终口径需营销与财务确认（Q-01）。
      </p>
    </Panel>
  );
}
