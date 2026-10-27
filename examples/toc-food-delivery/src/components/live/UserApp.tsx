import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { CUSTOMER, DISHES, DISH_MAP, MERCHANT, MERCHANT_TIERS, RIDER_MAP } from '@/domain/catalog';
import { STATUS_LABEL } from '@/domain/orderMachine';
import { refundCalc } from '@/domain/settlement';
import { rmb, rmbShort, yuan } from '@/lib/format';
import { REFUND_ITEM, SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, pickDish, setUserScreen, type UserScreen } from '@/state/live';
import { AppButton } from './Phone';
import { Avatar, FoodArt, StoreBadge } from './FoodArt';
import { MiniMap } from './CityMap';

export function userScreenOf(w: World, override: UserScreen | null): UserScreen {
  if (override) return override;
  if (reached(w, 'refundApplied')) return 'refund';
  if (w.stage === 'confirmed') return 'rate';
  if (reached(w, 'paid')) return 'order';
  if (w.stage === 'ordered') return 'cashier';
  if (w.stage === 'cart') return 'cart';
  return 'home';
}

export function UserApp({ w, screen, picked }: { w: World; screen: UserScreen; picked: Record<string, number> }) {
  switch (screen) {
    case 'shop':
      return <Shop w={w} picked={picked} />;
    case 'cart':
      return <Checkout w={w} />;
    case 'cashier':
      return <Cashier w={w} />;
    case 'order':
      return <OrderView w={w} />;
    case 'rate':
      return <Rate w={w} />;
    case 'refund':
      return <Refund w={w} />;
    default:
      return <Home w={w} />;
  }
}

/* ---------------- 首页 ---------------- */

function Home({ w }: { w: World }) {
  const open = w.storeOpen;
  const coupon = w.coupon.status === 'published';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="brand-grad px-4 pb-4 pt-1 text-white">
        <div className="flex items-center gap-1 text-[12.5px] font-semibold">
          <Icon name="pin" size={13} strokeWidth={2} />
          云杉公寓 3 栋
          <Icon name="chevronDown" size={12} strokeWidth={2} />
        </div>
        <div className="mt-2.5 flex h-8 items-center gap-1.5 rounded-full bg-white/95 px-3 text-[12px] text-ink-400">
          <Icon name="search" size={13} />
          搜索“手擀面”
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-3 pt-3">
        {coupon ? (
          <div className="anim-pop flex items-center gap-2.5 rounded-[14px] bg-gradient-to-r from-[#fff1e3] to-[#ffe0c4] px-3 py-2.5 ring-1 ring-[#ffd2ad]">
            <span className="flex h-9 w-12 flex-col items-center justify-center rounded-[8px] bg-white text-primary-600">
              <span className="num text-[15px] font-bold leading-none">¥8</span>
              <span className="text-[10px] leading-none">满40可用</span>
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-semibold text-ink-900">{w.coupon.name}</div>
              <div className="text-[11px] text-ink-500">平台券 · {w.coupon.window}</div>
            </div>
            <span className="rounded-full bg-primary-500 px-2 py-0.5 text-[11px] font-semibold text-white">{w.claimed ? '已领' : '领取'}</span>
          </div>
        ) : (
          <div className="rounded-[14px] bg-white px-3 py-2.5 text-[12px] text-ink-400 ring-1 ring-black/[0.04]">今日活动筹备中…</div>
        )}
        <div className="flex gap-2 text-[11.5px]">
          {['面食', '快餐', '饮品', '夜宵'].map((c, i) => (
            <span key={c} className={cx('rounded-full px-2.5 py-1', i === 0 ? 'bg-ink-900 text-white' : 'bg-white text-ink-600 ring-1 ring-black/[0.05]')}>
              {c}
            </span>
          ))}
        </div>
        <button type="button" data-demo="user-store" onClick={() => open && setUserScreen('shop')} className={cx('flex w-full gap-2.5 rounded-[16px] bg-white p-2.5 text-left shadow-[0_6px_18px_-12px_rgb(0_0_0/0.3)] ring-1 ring-black/[0.04]', !open && 'opacity-70')}>
          <FoodArt kind="beefNoodle" size={64} steam={open} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-[13.5px] font-semibold text-ink-900">{MERCHANT.name}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-500">
              <span className="font-semibold text-primary-600">{MERCHANT.rating}分</span>
              <span>月售 {MERCHANT.monthSales}</span>
            </div>
            <div className="whitespace-nowrap text-[11px] text-ink-400">3.3km · 约 30 分钟</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {MERCHANT_TIERS.map((t) => (
                <span key={t.min} className="rounded-[4px] px-1 text-[10.5px] leading-[16px] text-primary-600 ring-1 ring-inset ring-primary-300">
                  满{t.min / 100}减{t.off / 100}
                </span>
              ))}
              {coupon ? <span className="rounded-[4px] bg-primary-500 px-1 text-[10.5px] leading-[16px] text-white">平台券 40-8</span> : null}
            </div>
            {!open ? <div className="mt-1 text-[11px] font-medium text-ink-500">休息中 · 10:45 开门</div> : null}
          </div>
        </button>
        <div className="flex gap-2.5 rounded-[16px] bg-white p-2.5 opacity-60 ring-1 ring-black/[0.04]">
          <FoodArt kind="tea" size={48} />
          <div className="min-w-0 text-[12px] leading-tight">
            <div className="font-semibold text-ink-800">橙汁小站</div>
            <div className="mt-1 text-[11px] text-ink-400">1.1km · 18分钟</div>
          </div>
        </div>
      </div>
      <TabBar />
    </div>
  );
}

function TabBar() {
  return (
    <div className="flex h-[52px] shrink-0 items-start justify-around border-t border-black/[0.05] bg-white pt-1.5 text-[10.5px] text-ink-400">
      {[
        ['home', '首页'],
        ['receipt', '订单'],
        ['user', '我的'],
      ].map(([i, l], k) => (
        <span key={l} className={cx('flex flex-col items-center gap-0.5', k === 0 && 'text-primary-600')}>
          <Icon name={i as 'home'} size={18} />
          {l}
        </span>
      ))}
    </div>
  );
}

/* ---------------- 店铺与加购 ---------------- */

function Shop({ w, picked }: { w: World; picked: Record<string, number> }) {
  const goods = Object.entries(picked).reduce((a, [id, n]) => a + DISH_MAP[id].price * n, 0);
  const count = Object.values(picked).reduce((a, n) => a + n, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="relative bg-gradient-to-b from-[#3a2a20] to-[#5a3f2d] px-4 pb-3 pt-1 text-white">
        <button type="button" onClick={() => setUserScreen(null)} className="flex items-center gap-0.5 text-[12px] text-white/80">
          <Icon name="chevronLeft" size={14} strokeWidth={2} />
          返回
        </button>
        <div className="mt-1.5 flex items-center gap-2.5">
          <StoreBadge size={40} />
          <div className="leading-tight">
            <div className="text-[14px] font-semibold">{MERCHANT.short}</div>
            <div className="mt-0.5 text-[11px] text-white/75">{MERCHANT.rating} 分 · 月售 {MERCHANT.monthSales} · 约 30 分钟</div>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {MERCHANT_TIERS.map((t) => (
            <span key={t.min} className="rounded-[4px] bg-white/15 px-1.5 text-[10.5px] leading-[17px]">
              满{t.min / 100}减{t.off / 100}
            </span>
          ))}
          {w.coupon.status === 'published' ? <span className="rounded-[4px] bg-primary-500 px-1.5 text-[10.5px] leading-[17px]">平台券满40减8</span> : null}
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-black/[0.04] overflow-hidden px-3">
        {DISHES.map((d) => {
          const n = picked[d.id] ?? 0;
          return (
            <li key={d.id} className="flex items-center gap-2.5 py-2">
              <FoodArt kind={d.kind} size={46} />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12.5px] font-semibold text-ink-900">{d.name}</div>
                <div className="mt-0.5 truncate text-[10.5px] text-ink-400">
                  {d.desc} · 月售 {d.sales}
                </div>
                <div className="num mt-1 text-[13px] font-bold text-primary-600">{rmbShort(d.price)}</div>
              </div>
              <span className="flex items-center gap-1.5">
                {n ? (
                  <>
                    <button type="button" aria-label={`减少${d.name}`} onClick={() => pickDish(d.id, -1)} className="flex h-6 w-6 items-center justify-center rounded-full text-primary-600 ring-1 ring-primary-300">
                      <Icon name="minus" size={12} strokeWidth={2.4} />
                    </button>
                    <span className="num w-3 text-center text-[12.5px] font-semibold">{n}</span>
                  </>
                ) : null}
                <button type="button" data-demo={`add-${d.id}`} aria-label={`加购${d.name}`} onClick={() => pickDish(d.id)} className="brand-grad flex h-6 w-6 items-center justify-center rounded-full text-white">
                  <Icon name="plus" size={13} strokeWidth={2.6} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mx-3 mb-4 flex h-12 items-center gap-2 rounded-full bg-[#1f2329] pl-2 pr-1.5 text-white">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full brand-grad">
          <Icon name="bag" size={17} strokeWidth={2} />
          {count ? <span key={count} className="anim-pop num absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-seal-500 px-1 text-[10px] font-bold">{count}</span> : null}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="num text-[15px] font-bold">{count ? rmb(goods) : '未选购商品'}</div>
          <div className="text-[10.5px] text-white/60">另需配送费约 ¥5</div>
        </div>
        <button type="button" data-demo="user-checkout" disabled={!count} onClick={() => advance('cart') && setUserScreen(null)} className="brand-grad h-9 rounded-full px-4 text-[13px] font-semibold disabled:opacity-40">
          去结算
        </button>
      </div>
    </div>
  );
}

/* ---------------- 结算页（价格试算） ---------------- */

function Row({ k, v, tone, note }: { k: string; v: string; tone?: 'brand' | 'muted'; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[12px]">
      <span className="text-ink-600">
        {k}
        {note ? <span className="ml-1 rounded-[3px] bg-primary-50 px-1 text-[10px] text-primary-600">{note}</span> : null}
      </span>
      <span className={cx('num font-medium', tone === 'brand' ? 'text-primary-600' : tone === 'muted' ? 'text-ink-400' : 'text-ink-900')}>{v}</span>
    </div>
  );
}

function Checkout({ w }: { w: World }) {
  const p = w.pricing;
  if (!p) return null;
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="brand-grad px-4 pb-8 pt-1 text-white">
        <div className="text-[14px] font-semibold">确认订单</div>
      </div>
      <div className="-mt-6 min-h-0 flex-1 space-y-2 overflow-hidden px-3">
        <div className="rounded-[14px] bg-white px-3 py-2.5 shadow-[0_6px_18px_-12px_rgb(0_0_0/0.3)]">
          <div className="text-[12.5px] font-semibold text-ink-900">{CUSTOMER.address.replace('滨湖区', '')}</div>
          <div className="mt-0.5 text-[11px] text-ink-500">
            {CUSTOMER.name} {CUSTOMER.phone} · 立即送出，约 12:25 送达
          </div>
        </div>
        <div className="rounded-[14px] bg-white px-3 py-2" data-flow-anchor="user-pricing">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-900">
            <StoreBadge size={18} />
            {MERCHANT.short}
          </div>
          {p.lines.map((l) => (
            <div key={l.dishId} className="flex items-center justify-between py-0.5 text-[12px]">
              <span className="text-ink-800">
                {l.name} <span className="text-ink-400">×{l.qty}</span>
              </span>
              <span className="num text-ink-900">{rmb(l.amount)}</span>
            </div>
          ))}
          <div className="my-1 border-t border-dashed border-black/[0.08]" />
          <Row k="包装费" v={rmb(p.pack)} />
          <Row k="配送费" v={rmb(p.delivery)} note={rain ? '大雨 +2' : p.deliveryDistance ? '超距 +1' : undefined} />
          <Row k={p.merchantTier ? `商家满减 满${p.merchantTier.min / 100}减${p.merchantTier.off / 100}` : '商家满减'} v={p.merchantOff ? `-${rmb(p.merchantOff)}` : '未达门槛'} tone={p.merchantOff ? 'brand' : 'muted'} />
          <div className={cx('mt-1 flex items-center justify-between rounded-[8px] px-2 py-1.5 text-[11.5px]', p.couponApplied ? 'bg-primary-50 text-primary-700' : 'bg-ink-50 text-ink-600')}>
            <span className="flex items-center gap-1">
              <Icon name="ticket" size={13} />
              {w.coupon.name}
            </span>
            <span className="num font-semibold">{p.couponApplied ? `-${rmb(p.couponOff)}` : '不可用'}</span>
          </div>
          {p.couponHint ? <div className="anim-fade mt-1 text-[10.5px] leading-[14px] text-amber-700">{p.couponHint}</div> : null}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-black/[0.05] bg-white px-3 pb-5 pt-2.5">
        <div className="min-w-0 flex-1 leading-tight">
          <div className="num text-[17px] font-bold text-ink-900">{rmb(p.payable)}</div>
          <div className="num text-[10.5px] text-primary-600">已优惠 {rmb(p.merchantOff + p.couponOff)}</div>
        </div>
        <div className="w-[118px] shrink-0">
          <AppButton demo="user-submit" onClick={() => advance('ordered')}>
            提交订单
          </AppButton>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 收银台（支付网关，模拟环境） ---------------- */

function Cashier({ w }: { w: World }) {
  const o = w.order!;
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black/40">
      <div className="flex-1" />
      <div className="anim-sheet relative overflow-hidden rounded-t-[24px] bg-white px-4 pb-6 pt-3">
        <span className="pointer-events-none absolute right-[-30px] top-6 rotate-[30deg] bg-amber-100 px-10 text-[10.5px] font-semibold text-amber-700">模拟环境</span>
        <div className="mx-auto h-1 w-9 rounded-full bg-black/15" />
        <div className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-gateway">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-[#0e7490] text-white">
            <Icon name="wallet" size={13} strokeWidth={2} />
          </span>
          <span className="text-ink-900">收银台</span>
          <span className="ml-auto text-[11px] font-normal text-ink-400">剩余 14:58</span>
        </div>
        <div className="num mt-4 text-center text-[30px] font-bold tracking-tight text-ink-900">{rmb(o.pricing.payable)}</div>
        <div className="code mt-1 text-center text-[11px] text-ink-400">{o.no}</div>
        <div className="mt-4 space-y-1.5 text-[12px]">
          {['模拟支付渠道 A（默认）', '模拟支付渠道 B'].map((m, i) => (
            <div key={m} className={cx('flex items-center justify-between rounded-[10px] px-3 py-2 ring-1', i === 0 ? 'bg-[#ecfeff] ring-[#a5e4ef]' : 'ring-black/[0.06]')}>
              <span className="text-ink-800">{m}</span>
              <span className={cx('flex h-4 w-4 items-center justify-center rounded-full', i === 0 ? 'bg-[#0e7490] text-white' : 'ring-1 ring-black/20')}>{i === 0 ? <Icon name="check" size={10} strokeWidth={3} /> : null}</span>
            </div>
          ))}
        </div>
        <AppButton demo="user-pay" tone="dark" className="mt-4" onClick={() => advance('paid')}>
          确认支付 {rmb(o.pricing.payable)}
        </AppButton>
      </div>
    </div>
  );
}

/* ---------------- 订单进度 ---------------- */

function headline(w: World): [string, string] {
  const o = w.order!;
  const r = o.riderId ? RIDER_MAP[o.riderId].short : '';
  const promise = o.promisedAt ? `预计 ${clockLabel(o.promisedAt)} 前送达` : '预计 30–35 分钟送达';
  switch (w.stage) {
    case 'paid':
      return ['等待商家接单', '支付成功，商家马上接单'];
    case 'accepted':
      return ['商家正在备餐', promise];
    case 'dispatched':
      return ['正在为你安排骑手', '智能调度正在挑选最合适的骑手'];
    case 'riderAccepted':
    case 'reassigned':
      return [`${r}正赶往商家`, promise];
    case 'arrived':
      return [`${r}已到店，等待出餐`, promise];
    case 'ready':
      return ['商家已出餐', `${r}正在取餐`];
    case 'picked':
      return [`${r}正在送餐`, promise];
    case 'delivered':
      return ['订单已送达', w.late ? `超时 ${w.late} 分钟，已赔付 3 元券` : '准时送达，祝你用餐愉快'];
    default:
      return [STATUS_LABEL[o.status] === '已结算' ? '订单已完成' : '订单已完成', w.review ? `已评价 ${'★'.repeat(w.review.stars)}` : '感谢你的支持'];
  }
}

const PROGRESS: { label: string; at: (w: World) => boolean }[] = [
  { label: '已支付', at: (w) => reached(w, 'paid') },
  { label: '备餐', at: (w) => reached(w, 'accepted') },
  { label: '骑手', at: (w) => reached(w, 'riderAccepted') },
  { label: '配送', at: (w) => reached(w, 'picked') },
  { label: '送达', at: (w) => reached(w, 'delivered') },
];

function OrderView({ w }: { w: World }) {
  const o = w.order!;
  const [h, sub] = headline(w);
  const rider = o.riderId ? RIDER_MAP[o.riderId] : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative h-[170px] shrink-0">
        <MiniMap w={w} />
      </div>
      <div className="-mt-4 min-h-0 flex-1 space-y-2 overflow-hidden rounded-t-[20px] bg-[#f6f4f1] px-3 pt-3">
        <div className="rounded-[14px] bg-white px-3 py-2.5 shadow-[0_6px_18px_-12px_rgb(0_0_0/0.3)]">
          <div key={h} className="anim-fade text-[16px] font-bold text-ink-900">
            {h}
          </div>
          <div className={cx('mt-0.5 text-[11.5px]', w.late && w.stage === 'delivered' ? 'text-amber-700' : 'text-primary-600')}>{sub}</div>
          <div className="mt-2.5 flex items-center">
            {PROGRESS.map((s, i) => {
              const on = s.at(w);
              return (
                <div key={s.label} className="flex flex-1 items-center">
                  <span className={cx('flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors duration-300', on ? 'brand-grad text-white' : 'bg-ink-100 text-ink-300')}>
                    {on ? <Icon name="check" size={10} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </span>
                  {i < PROGRESS.length - 1 ? <span className={cx('mx-0.5 h-[2px] flex-1 rounded-full transition-colors duration-300', PROGRESS[i + 1].at(w) ? 'bg-primary-400' : 'bg-ink-100')} /> : null}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-ink-400">
            {PROGRESS.map((s) => (
              <span key={s.label}>{s.label}</span>
            ))}
          </div>
        </div>
        {rider && reached(w, 'riderAccepted') ? (
          <div className="anim-rise flex items-center gap-2.5 rounded-[14px] bg-white px-3 py-2">
            <Avatar name={rider.short} color="var(--color-act-rider)" size={30} />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-semibold text-ink-900">骑手 {rider.short}</div>
              <div className="text-[10.5px] text-ink-400">服务分 {rider.rating} · 已送 3,2{rider.id.slice(-1)}8 单</div>
            </div>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-pine-50 text-pine-600">
              <Icon name="phone" size={13} />
            </span>
          </div>
        ) : null}
        {w.stage === 'delivered' ? (
          <AppButton demo="user-confirm" onClick={() => advance('confirmed')}>
            确认收货
          </AppButton>
        ) : (
          <div className="rounded-[14px] bg-white px-3 py-2 text-[11.5px] text-ink-600">
            <div className="flex justify-between">
              <span>实付</span>
              <span className="num font-semibold text-ink-900">{rmb(o.pricing.payable)}</span>
            </div>
            <div className="mt-0.5 flex justify-between text-ink-400">
              <span>{o.pricing.lines.map((l) => `${l.name.replace('招牌', '')}×${l.qty}`).join('、')}</span>
            </div>
          </div>
        )}
        {w.stage === 'settled' || w.stage === 'rated' ? (
          <button type="button" data-demo="user-refund-entry" onClick={() => setUserScreen('refund')} className="w-full rounded-full bg-white py-1.5 text-[11.5px] text-ink-600 ring-1 ring-black/[0.06]">
            少送 / 漏送？申请售后
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- 评价 ---------------- */

function Stars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={i <= n ? '#ffb020' : '#e5ded7'} />
        </svg>
      ))}
    </span>
  );
}

function Rate({ w }: { w: World }) {
  const late = w.late > 0;
  const stars = late ? 4 : 5;
  const tags = late ? ['面很筋道', '骑手辛苦了'] : ['面很筋道', '送餐快', '包装严实'];
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="px-4 pt-1 text-[15px] font-bold text-ink-900">评价这一单</div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-4 pt-3">
        <div className="rounded-[14px] bg-[#fbf8f5] p-3">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-900">
            <StoreBadge size={22} />
            {MERCHANT.short}
          </div>
          <div className="mt-2">
            <Stars n={stars} size={22} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...tags, '分量足'].map((t) => (
              <span key={t} className={cx('rounded-full px-2 py-0.5 text-[11px]', tags.includes(t) ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300' : 'bg-white text-ink-500 ring-1 ring-black/[0.06]')}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] bg-[#fbf8f5] p-3">
          <div className="text-[12.5px] font-semibold text-ink-900">骑手 {RIDER_MAP[w.order!.riderId!].short}</div>
          <div className="mt-2">
            <Stars n={5} size={20} />
          </div>
        </div>
        <p className="rounded-[12px] bg-[#fbf8f5] p-3 text-[12px] leading-[18px] text-ink-700">{late ? '面很好吃，就是这次出餐慢了点，骑手一直在帮忙催。' : '牛肉炖得很烂，汤没洒，下次还点。'}</p>
      </div>
      <div className="px-4 pb-6 pt-2">
        <AppButton demo="user-rate" onClick={() => advance('rated')}>
          提交评价
        </AppButton>
      </div>
    </div>
  );
}

/* ---------------- 售后退款 ---------------- */

function Refund({ w }: { w: World }) {
  const o = w.order!;
  const calc = w.refund?.calc ?? refundCalc(o.pricing, REFUND_ITEM.dishId, REFUND_ITEM.qty);
  const applied = reached(w, 'refundApplied');
  const steps: [string, boolean, string][] = [
    ['已申请', applied, w.refund ? clockLabel(w.refund.appliedAt) : ''],
    ['商家同意', reached(w, 'refundApproved'), w.refund?.approvedAt ? clockLabel(w.refund.approvedAt) : ''],
    ['退款成功', reached(w, 'refunded'), w.refund?.doneAt ? clockLabel(w.refund.doneAt) : ''],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex items-center gap-1 px-4 pt-1">
        {!applied ? (
          <button type="button" aria-label="返回" onClick={() => setUserScreen(null)} className="text-ink-500">
            <Icon name="chevronLeft" size={16} strokeWidth={2} />
          </button>
        ) : null}
        <span className="text-[15px] font-bold text-ink-900">{applied ? '退款进度' : '申请部分退款'}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-4 pt-3">
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#fbf8f5] p-2.5">
          <FoodArt kind="egg" size={42} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[12.5px] font-semibold text-ink-900">
              {DISH_MAP[REFUND_ITEM.dishId].name} ×{REFUND_ITEM.qty}
            </div>
            <div className="mt-0.5 text-[11px] text-ink-500">原价 {rmb(calc.itemPrice)} · 原因：{REFUND_ITEM.reason}</div>
          </div>
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-white">
            <Icon name="check" size={10} strokeWidth={3} />
          </span>
        </div>
        <div className="rounded-[14px] bg-[#fbf8f5] p-3 text-[11.5px] leading-[17px] text-ink-600">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-semibold text-ink-900">可退金额</span>
            <span className="num text-[18px] font-bold text-primary-600">{rmb(calc.refund)}</span>
          </div>
          <p className="mt-1">按原价占比分摊本单优惠 {rmb(calc.discountShare)}；包装费、配送费不退。</p>
        </div>
        {applied ? (
          <ol className="space-y-2.5 rounded-[14px] bg-[#fbf8f5] p-3">
            {steps.map(([l, on, t]) => (
              <li key={l} className="flex items-center gap-2 text-[12px]">
                <span className={cx('flex h-4 w-4 items-center justify-center rounded-full', on ? 'bg-pine-500 text-white' : 'bg-ink-150')}>{on ? <Icon name="check" size={9} strokeWidth={3} /> : null}</span>
                <span className={on ? 'font-medium text-ink-900' : 'text-ink-400'}>{l}</span>
                <span className="num ml-auto text-[11px] text-ink-400">{t}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className="px-4 pb-6 pt-2">
        {applied ? (
          <div className={cx('rounded-full py-2.5 text-center text-[13px] font-semibold', reached(w, 'refunded') ? 'bg-pine-50 text-pine-700' : 'bg-ink-50 text-ink-500')}>
            {reached(w, 'refunded') ? `${yuan(calc.refund)} 元已原路退回` : '等待商家处理'}
          </div>
        ) : (
          <AppButton demo="user-refund" onClick={() => advance('refundApplied')}>
            提交申请
          </AppButton>
        )}
      </div>
    </div>
  );
}
