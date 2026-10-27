import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { DISHES, MERCHANT, RIDER_MAP } from '@/domain/catalog';
import { prepMinutes } from '@/domain/pricing';
import { riderPay, settleOrder } from '@/domain/settlement';
import { clamp, rmb, rmbShort } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { T, clockLabel, reached, type World } from '@/sim/world';
import { advance } from '@/state/live';
import { AppButton } from './Phone';
import { FoodArt } from './FoodArt';

/** 商家版 App：深色头部 + 橙色强调，信息密度比用户端高 */
export function MerchantApp({ w, clock }: { w: World; clock: number }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col text-white">
      <div className="px-4 pb-3 pt-1">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold">{MERCHANT.short}</span>
          <span className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', w.storeOpen ? 'bg-[#1c8c50]/25 text-[#5ee39a]' : 'bg-white/10 text-white/60')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', w.storeOpen ? 'anim-pulse bg-[#5ee39a]' : 'bg-white/50')} />
            {w.storeOpen ? '营业中' : '休息中'}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          {[
            ['今日订单', w.storeOpen ? (reached(w, 'paid') ? '12' : '11') : '0'],
            ['营业额', w.storeOpen ? (reached(w, 'paid') ? '¥568' : '¥519') : '¥0'],
            ['评分', String(MERCHANT.rating)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[10px] bg-white/[0.06] py-1.5">
              <div className="num text-[14px] font-bold">{v}</div>
              <div className="text-[10px] text-white/55">{k}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-t-[22px] bg-[#f6f4f1] px-3 pt-3 text-ink-900">{!reached(w, 'store') ? <Closed w={w} /> : <Orders w={w} clock={clock} />}</div>
    </div>
  );
}

function Closed({ w }: { w: World }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1.5 flex items-center justify-between text-[12px]">
        <span className="font-semibold">今日菜品</span>
        <span className="text-[11px] text-ink-400">库存 · 出餐时长</span>
      </div>
      <ul data-demo="merchant-menu" className="space-y-1.5">
        {DISHES.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-[12px] bg-white px-2 py-1.5">
            <FoodArt kind={d.kind} size={30} />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{d.name}</span>
            <span className="num text-[11px] text-ink-500">
              {d.stock} 份 · {d.prep || '—'}{d.prep ? '分' : ''}
            </span>
            <span className="relative h-[16px] w-[28px] rounded-full bg-[#34c759]">
              <span className="absolute right-[2px] top-[2px] h-3 w-3 rounded-full bg-white" />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pb-5">
        <AppButton demo="merchant-open" onClick={() => advance('store')} disabled={w.stage !== 'coupon' && w.stage !== 'init'}>
          <Icon name="store" size={16} strokeWidth={2} />
          开始营业
        </AppButton>
      </div>
    </div>
  );
}

function Orders({ w, clock }: { w: World; clock: number }) {
  const o = w.order;
  const paid = o && reached(w, 'paid');
  if (!paid) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 pb-10 text-center">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary-300/50" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
          <span className="brand-grad relative flex h-12 w-12 items-center justify-center rounded-full text-white">
            <Icon name="bell" size={20} strokeWidth={2} />
          </span>
        </span>
        <div className="text-[13px] font-semibold">等待新订单</div>
        <div className="text-[11.5px] text-ink-500">新订单会语音播报并在这里弹出</div>
      </div>
    );
  }
  const prep = SCENARIO_MAP[w.scenario].params.prepMin ?? prepMinutes(o.lines);
  const est = settleOrder(o.no, '', o.pricing, riderPay({ extraKm: 1, rain: false, waitMin: 0 })).merchantNet;
  const ringing = w.stage === 'paid';
  const cooking = reached(w, 'accepted') && !reached(w, 'ready');
  const pct = cooking ? clamp((clock - T.accept) / prep, 0, 0.98) : reached(w, 'ready') ? 1 : 0;
  const rider = o.riderId ? RIDER_MAP[o.riderId] : null;
  const refundAsk = w.stage === 'refundApplied';
  const tab = ringing ? '新订单' : cooking ? '备餐中' : reached(w, 'picked') ? '已完成' : '待取餐';
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-1.5 text-[11px]">
        {['新订单', '备餐中', '待取餐', '已完成'].map((t) => (
          <span key={t} className={cx('rounded-full px-2 py-0.5', t === tab ? 'bg-ink-900 font-semibold text-white' : 'bg-white text-ink-500')}>
            {t}
          </span>
        ))}
      </div>
      {refundAsk ? (
        <div className="anim-pop rounded-[14px] bg-white p-3 ring-2 ring-amber-500/50">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
            <Icon name="alert" size={14} />
            退款申请 · #12
          </div>
          <p className="mt-1 text-[11.5px] leading-[16px] text-ink-600">
            用户反馈：{w.refund!.reason}，申请退 {rmb(w.refund!.calc.refund)}（已按比例扣除优惠）。本单已结算，同意后在下一结算周期冲减 {rmb(-w.refund!.calc.merchantAdj)}。
          </p>
          <div className="mt-2 flex gap-2">
            <AppButton tone="ghost" className="h-9 flex-1 text-[12.5px]">
              拒绝
            </AppButton>
            <AppButton demo="merchant-refund-ok" className="h-9 flex-[1.4] text-[12.5px]" onClick={() => advance('refundApproved')}>
              同意退款
            </AppButton>
          </div>
        </div>
      ) : null}
      <div className={cx('rounded-[14px] bg-white p-3', ringing && 'anim-pop ring-2 ring-primary-400')}>
        <div className="flex items-center gap-2">
          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full brand-grad text-white', ringing && 'anim-ring')}>
            <Icon name="bell" size={14} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13px] font-bold">
              #12 <span className="text-[11px] font-normal text-ink-500">{clockLabel(o.createdAt)} 下单</span>
            </div>
            <div className="text-[10.5px] text-ink-400">云杉公寓 3 栋 · 3.3km</div>
          </div>
          <span className="num text-right text-[11px] leading-tight text-ink-500">
            预计收入
            <br />
            <b className="text-[13px] text-ink-900">{rmb(est)}</b>
          </span>
        </div>
        <ul className="mt-2 space-y-0.5 border-t border-dashed border-black/[0.08] pt-2 text-[12px]">
          {o.pricing.lines.map((l) => (
            <li key={l.dishId} className="flex justify-between">
              <span>{l.name}</span>
              <span className="num font-semibold">×{l.qty}</span>
            </li>
          ))}
        </ul>
        {cooking || reached(w, 'ready') ? (
          <div className="mt-2.5">
            <div className="flex justify-between text-[11px]">
              <span className={cx('font-medium', reached(w, 'ready') ? 'text-pine-600' : 'text-primary-600')}>{reached(w, 'ready') ? '已出餐' : `备餐中 · 预计 ${clockLabel(T.accept + prepMinutes(o.lines))} 出餐`}</span>
              <span className="num text-ink-400">{Math.round(pct * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div className={cx('h-full rounded-full transition-[width] duration-500', reached(w, 'ready') ? 'bg-pine-500' : 'brand-grad bar-running')} style={{ width: `${pct * 100}%` }} />
            </div>
          </div>
        ) : null}
        {rider && reached(w, 'riderAccepted') && !reached(w, 'picked') ? (
          <div className="mt-2 flex items-center gap-1.5 rounded-[8px] bg-pine-50 px-2 py-1 text-[11px] text-pine-700">
            <Icon name="bike" size={13} />
            骑手{rider.short}{reached(w, 'arrived') ? '已到店，正在等餐' : '正赶来取餐'}
          </div>
        ) : null}
        {w.events.some((e) => e.title.startsWith('等餐预警')) && cooking ? <div className="mt-1.5 rounded-[8px] bg-amber-50 px-2 py-1 text-[11px] text-amber-700">催单：骑手已等候超过 10 分钟</div> : null}
        <div className="mt-2.5">
          {ringing ? (
            <AppButton demo="merchant-accept" onClick={() => advance('accepted')}>
              接单
            </AppButton>
          ) : cooking ? (
            <AppButton demo="merchant-ready" tone="dark" onClick={() => advance('ready')} disabled={w.stage !== 'arrived'} title={w.stage !== 'arrived' ? '骑手到店后再出餐（原型按“到店 → 出餐”的顺序演示）' : undefined}>
              出餐
            </AppButton>
          ) : reached(w, 'picked') ? (
            <div className="rounded-full bg-pine-50 py-2 text-center text-[12px] font-medium text-pine-700">{reached(w, 'delivered') ? '已送达' : '骑手已取餐，配送中'}</div>
          ) : (
            <div className="rounded-full bg-ink-50 py-2 text-center text-[12px] text-ink-500">等待骑手取餐</div>
          )}
        </div>
      </div>
      {w.review ? (
        <div className="anim-rise rounded-[14px] bg-white p-2.5 text-[11.5px]">
          <div className="flex items-center gap-1 font-semibold text-ink-900">
            新评价 <span className="text-[#ffb020]">{'★'.repeat(w.review.stars)}</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-ink-600">{w.review.text}</p>
        </div>
      ) : null}
      {reached(w, 'refundApproved') ? <div className="rounded-[12px] bg-pine-50 px-3 py-2 text-[11.5px] text-pine-700">已同意退款 {rmbShort(w.refund!.calc.refund)}，下一结算周期冲减 {rmbShort(-w.refund!.calc.merchantAdj)}</div> : null}
    </div>
  );
}
