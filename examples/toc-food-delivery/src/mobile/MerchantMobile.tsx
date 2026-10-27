import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { FoodArt, StoreBadge } from '@/components/live/FoodArt';
import { displayClock, useAnimTick } from '@/components/live/liveHooks';
import { DISHES, MERCHANT, RIDER_MAP } from '@/domain/catalog';
import { prepMinutes } from '@/domain/pricing';
import { riderPay, settleOrder } from '@/domain/settlement';
import { clamp, rmb, rmbShort } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { T, clockLabel, reached, type World } from '@/sim/world';
import { advance, useWorld } from '@/state/live';
import { Btn, Pill, Ring, Seg, useTone } from './kit';

/** 橙子商家版：深色主题，信息密度高，大按钮便于后厨单手操作 */
export function MerchantMobile() {
  useTone('light');
  const w = useWorld();
  const { anim, p } = useAnimTick();
  const clock = displayClock(w, anim, p);
  const [view, setView] = useState<'orders' | 'menu'>('orders');
  const open = reached(w, 'store');
  const showMenu = !open || view === 'menu';
  return (
    <div data-flow-anchor="phone-merchant" className="flex h-full flex-col bg-[#101216] text-white">
      <header className="shrink-0 px-4 pb-4" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <div className="flex items-center gap-3">
          <StoreBadge size={42} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-bold">{MERCHANT.short}</div>
            <div className="text-[12.5px] text-white/50">商家版 · {MERCHANT.ownerShort}</div>
          </div>
          <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold', open ? 'bg-[#1c8c50]/25 text-[#5ee39a]' : 'bg-white/10 text-white/55')}>
            <span className={cx('h-2 w-2 rounded-full', open ? 'anim-pulse bg-[#5ee39a]' : 'bg-white/40')} />
            {open ? '营业中' : '休息中'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {[
            ['今日订单', open ? (reached(w, 'paid') ? '12' : '11') : '0'],
            ['营业额', open ? (reached(w, 'paid') ? '¥568' : '¥519') : '¥0'],
            ['店铺评分', String(MERCHANT.rating)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[16px] bg-white/[0.06] px-3 py-2.5 ring-1 ring-white/[0.05]">
              <div className="num text-[19px] font-bold">{v}</div>
              <div className="text-[11.5px] text-white/50">{k}</div>
            </div>
          ))}
        </div>
        {open ? (
          <div className="mt-3.5">
            <Seg
              dark
              value={view}
              onChange={setView}
              items={[
                { value: 'orders', label: '订单' },
                { value: 'menu', label: '菜品' },
              ]}
            />
          </div>
        ) : null}
      </header>
      <div className="m-scroll min-h-0 flex-1 rounded-t-[26px] bg-[#f4f2ef] px-3.5 pt-4 text-ink-900" style={{ paddingBottom: 'calc(var(--sab) + 24px)' }}>
        {showMenu ? <Menu w={w} /> : <Orders w={w} clock={clock} />}
      </div>
    </div>
  );
}

function Menu({ w }: { w: World }) {
  const open = reached(w, 'store');
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[17px] font-bold">今日菜品</span>
        <span className="text-[12.5px] text-ink-500">库存 · 出餐时长</span>
      </div>
      <ul data-demo="merchant-menu" className="space-y-2">
        {DISHES.map((d) => (
          <li key={d.id} className="flex items-center gap-3 rounded-[18px] bg-white p-2.5 shadow-[0_6px_18px_-14px_rgb(0_0_0/0.4)]">
            <FoodArt kind={d.kind} size={50} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{d.name}</div>
              <div className="num mt-0.5 text-[12.5px] text-ink-500">
                {rmbShort(d.price)} · 库存 {d.stock} · {d.prep ? `${d.prep} 分钟` : '即拿'}
              </div>
            </div>
            <span className="relative h-[28px] w-[48px] shrink-0 rounded-full bg-[#34c759]">
              <span className="absolute right-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow" />
            </span>
          </li>
        ))}
      </ul>
      {!open ? (
        <div className="pt-2">
          <Btn demo="merchant-open" icon="store" onClick={() => advance('store')}>
            开始营业
          </Btn>
          <p className="mt-2 text-center text-[12px] text-ink-500">开店后用户端可见，满 30 减 3、满 50 减 6 自动生效</p>
        </div>
      ) : null}
    </div>
  );
}

function Orders({ w, clock }: { w: World; clock: number }) {
  const o = w.order;
  if (!o || !reached(w, 'paid')) {
    return (
      <div className="flex flex-col items-center gap-3 pt-16 text-center">
        <span className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary-300/50" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
          <span className="absolute inset-3 rounded-full bg-primary-300/40" style={{ animation: 'pulse-ring 2s ease-out 0.6s infinite' }} />
          <span className="brand-grad relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_10px_24px_-8px_rgb(242_90_15/0.8)]">
            <Icon name="bell" size={28} strokeWidth={2} />
          </span>
        </span>
        <div className="text-[17px] font-bold">等待新订单</div>
        <div className="text-[13px] text-ink-500">新订单会语音播报并在这里弹出</div>
      </div>
    );
  }
  const prep = SCENARIO_MAP[w.scenario].params.prepMin ?? prepMinutes(o.lines);
  const income = settleOrder(o.no, '', o.pricing, riderPay({ extraKm: 1, rain: false, waitMin: 0 })).merchantNet;
  const ringing = w.stage === 'paid';
  const cooking = reached(w, 'accepted') && !reached(w, 'ready');
  const pct = cooking ? clamp((clock - T.accept) / prep, 0, 0.97) : reached(w, 'ready') ? 1 : 0;
  const left = Math.max(0, Math.ceil(T.accept + prep - clock));
  const rider = o.riderId ? RIDER_MAP[o.riderId] : null;
  const waited = w.events.some((e) => e.title.startsWith('等餐预警')) && cooking;
  return (
    <div className="space-y-3">
      {w.stage === 'refundApplied' ? (
        <div className="anim-pop rounded-[20px] bg-white p-4 ring-2 ring-amber-500/50">
          <div className="flex items-center gap-2 text-[15px] font-bold text-amber-700">
            <Icon name="alert" size={18} />
            退款申请 · #12
          </div>
          <p className="mt-1.5 text-[13.5px] leading-[20px] text-ink-600">
            用户反馈“{w.refund!.reason}”，申请退 {rmb(w.refund!.calc.refund)}（已按比例扣除优惠）。本单已结算，同意后下一结算周期冲减 {rmb(-w.refund!.calc.merchantAdj)}。
          </p>
          <div className="mt-3 flex gap-2.5">
            <Btn tone="ghost" size="md" className="flex-1">
              拒绝
            </Btn>
            <Btn demo="merchant-refund-ok" size="md" className="flex-[1.5]" onClick={() => advance('refundApproved')}>
              同意退款
            </Btn>
          </div>
        </div>
      ) : null}
      <div className={cx('rounded-[22px] bg-white p-4 shadow-[0_10px_26px_-16px_rgb(0_0_0/0.45)]', ringing && 'anim-pop ring-2 ring-primary-400')}>
        <div className="flex items-center gap-3">
          <span className={cx('brand-grad flex h-11 w-11 items-center justify-center rounded-full text-white', ringing && 'anim-ring')}>
            <Icon name="bell" size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="num text-[22px] font-extrabold">#12</span>
              <Pill tone={ringing ? 'brand' : cooking ? 'warn' : 'green'}>{ringing ? '新订单' : cooking ? '备餐中' : reached(w, 'picked') ? (reached(w, 'delivered') ? '已送达' : '配送中') : '待取餐'}</Pill>
            </div>
            <div className="text-[12.5px] text-ink-500">{clockLabel(o.createdAt)} 下单 · 云杉公寓 3 栋 · 3.3km</div>
          </div>
          <div className="text-right leading-tight">
            <div className="text-[11.5px] text-ink-400">预计收入</div>
            <div className="num text-[17px] font-bold">{rmb(income)}</div>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5 rounded-[14px] bg-[#f7f5f2] p-3 text-[15px]">
          {o.pricing.lines.map((l) => (
            <li key={l.dishId} className="flex justify-between">
              <span>{l.name}</span>
              <span className="num font-bold">×{l.qty}</span>
            </li>
          ))}
          <li className="pt-1 text-[12.5px] text-ink-500">备注：少辣，不要香菜</li>
        </ul>
        {cooking || reached(w, 'ready') ? (
          <div className="mt-3 flex items-center gap-3">
            <Ring value={pct} size={58} stroke={6} color={reached(w, 'ready') ? '#1c8c50' : '#e25507'}>
              <span className="num text-[13px] font-bold">{reached(w, 'ready') ? '好了' : `${left}′`}</span>
            </Ring>
            <div className="min-w-0 flex-1 text-[13.5px]">
              <div className="font-semibold">{reached(w, 'ready') ? '已出餐' : `备餐中 · 预计 ${clockLabel(T.accept + prepMinutes(o.lines))} 出餐`}</div>
              {rider && reached(w, 'riderAccepted') && !reached(w, 'picked') ? (
                <div className="mt-0.5 flex items-center gap-1 text-pine-700">
                  <Icon name="bike" size={14} />
                  骑手{rider.short}
                  {reached(w, 'arrived') ? '已到店，正在等餐' : '正赶来取餐'}
                </div>
              ) : null}
              {waited ? <div className="mt-0.5 text-amber-700">催单：骑手已等候超过 10 分钟</div> : null}
            </div>
          </div>
        ) : null}
        <div className="mt-4">
          {ringing ? (
            <Btn demo="merchant-accept" onClick={() => advance('accepted')}>
              接单
            </Btn>
          ) : cooking ? (
            <Btn demo="merchant-ready" tone="dark" disabled={w.stage !== 'arrived'} onClick={() => advance('ready')}>
              出餐
            </Btn>
          ) : reached(w, 'picked') ? (
            <div className="rounded-full bg-pine-50 py-3.5 text-center text-[15px] font-semibold text-pine-700">{reached(w, 'delivered') ? '已送达用户' : '骑手已取餐，配送中'}</div>
          ) : (
            <div className="rounded-full bg-ink-50 py-3.5 text-center text-[15px] text-ink-500">等待骑手取餐</div>
          )}
        </div>
      </div>
      {w.review ? (
        <div className="anim-rise rounded-[20px] bg-white p-4">
          <div className="flex items-center gap-2 text-[15px] font-bold">
            新评价 <span className="text-[#ffb020]">{'★'.repeat(w.review.stars)}</span>
          </div>
          <p className="mt-1 text-[13.5px] leading-[20px] text-ink-600">{w.review.text}</p>
        </div>
      ) : null}
      {reached(w, 'refundApproved') ? <div className="rounded-[18px] bg-pine-50 px-4 py-3 text-[13.5px] text-pine-700">已同意退款 {rmbShort(w.refund!.calc.refund)}，下一结算周期冲减 {rmbShort(-w.refund!.calc.merchantAdj)}</div> : null}
    </div>
  );
}
