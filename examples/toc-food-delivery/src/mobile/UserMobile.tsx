import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { Avatar, FoodArt, StoreBadge } from '@/components/live/FoodArt';
import { userScreenOf } from '@/components/live/UserApp';
import { CUSTOMER, DISHES, DISH_MAP, MERCHANT, MERCHANT_TIERS, RIDER_MAP, type DishKind } from '@/domain/catalog';
import { refundCalc } from '@/domain/settlement';
import { useFlow } from '@/flow/director';
import { STEPS } from '@/flow/workflow';
import { rmb, rmbShort, yuan } from '@/lib/format';
import { REFUND_ITEM, SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, pickDish, setUserScreen, useLiveUi, useWorld } from '@/state/live';
import { Btn, Card, Header, Pill, Row, Sheet, Stars, TabBar, useTone } from './kit';
import { MMap } from './MMap';
import { mToast, mUi, useM, type UserTab } from './mstate';

/** 橙子到家 · 用户端 */
export function UserMobile() {
  const w = useWorld();
  const ui = useLiveUi((s) => s);
  const tab = useM((s) => s.tab);
  const detached = useM((s) => s.detached);
  const active = useFlow((s) => s.active);
  const derived = userScreenOf(w, ui.userScreen);
  const inTabs = derived === 'home' || (detached && !active);
  const key = inTabs ? `tab-${tab}` : derived;
  return (
    <div data-flow-anchor="phone-user" className="relative flex h-full flex-col bg-[#f7f4f1]">
      <div key={key} className={cx('relative flex min-h-0 flex-1 flex-col', inTabs ? 'anim-fade' : 'anim-push')}>
        {inTabs ? (
          tab === 'orders' ? (
            <Orders w={w} />
          ) : tab === 'mine' ? (
            <Mine w={w} />
          ) : (
            <Home w={w} />
          )
        ) : derived === 'shop' ? (
          <Shop w={w} picked={ui.picked} />
        ) : derived === 'cart' ? (
          <Checkout w={w} />
        ) : derived === 'cashier' ? (
          <Checkout w={w} cashier />
        ) : derived === 'rate' ? (
          <Rate w={w} />
        ) : derived === 'refund' ? (
          <Refund w={w} />
        ) : (
          <Tracking w={w} />
        )}
      </div>
      {inTabs ? (
        <>
          {w.order && reached(w, 'paid') && !reached(w, 'confirmed') ? <OngoingBar w={w} /> : null}
          <TabBar<UserTab>
            value={tab}
            onChange={(t) => mUi.set({ tab: t })}
            items={[
              { value: 'home', label: '首页', icon: 'home' },
              { value: 'orders', label: '订单', icon: 'receipt', badge: w.order && reached(w, 'paid') && !reached(w, 'confirmed') ? 1 : undefined },
              { value: 'mine', label: '我的', icon: 'user' },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}

/* ---------------- 首页 ---------------- */

const CATS: { label: string; icon: IconName; bg: string }[] = [
  { label: '美食外卖', icon: 'bag', bg: 'from-[#ffb057] to-[#ff7a1a]' },
  { label: '甜品饮品', icon: 'star', bg: 'from-[#ff8fb1] to-[#f05589]' },
  { label: '超市便利', icon: 'store', bg: 'from-[#6ec1ff] to-[#2f6fed]' },
  { label: '水果鲜花', icon: 'sparkle', bg: 'from-[#8fe08a] to-[#2fa84f]' },
  { label: '买药', icon: 'plus', bg: 'from-[#79e1d4] to-[#14a39a]' },
  { label: '跑腿', icon: 'bike', bg: 'from-[#ffd36b] to-[#f2a20f]' },
  { label: '夜宵', icon: 'clock', bg: 'from-[#b29bff] to-[#7c42c2]' },
  { label: '全部', icon: 'grid', bg: 'from-[#c7bdb4] to-[#8f8378]' },
];

const OTHER_STORES: { name: string; kind: DishKind; rating: number; meta: string; tag: string }[] = [
  { name: '橙汁小站（湖滨店）', kind: 'tea', rating: 4.7, meta: '1.1km · 18 分钟', tag: '饮品' },
  { name: '山野轻食', kind: 'cucumber', rating: 4.6, meta: '2.4km · 32 分钟', tag: '轻食' },
  { name: '阿婆卤味', kind: 'egg', rating: 4.8, meta: '1.8km · 26 分钟', tag: '小吃' },
];

function Home({ w }: { w: World }) {
  useTone('light');
  const open = w.storeOpen;
  const coupon = w.coupon.status === 'published';
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  return (
    <div className="m-scroll relative min-h-0 flex-1">
      <div className="brand-grad relative overflow-hidden px-4 pb-16 text-white" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <div className="anim-drift pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="flex items-center gap-1.5">
          <Icon name="pin" size={17} strokeWidth={2.2} />
          <span className="text-[17px] font-bold">云杉公寓 3 栋</span>
          <Icon name="chevronDown" size={15} strokeWidth={2.4} />
          <span className="ml-auto flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold">
            <Icon name={rain ? 'rain' : 'sparkle'} size={13} />
            {rain ? '大雨 · 配送稍慢' : '晴 22°'}
          </span>
        </div>
        <div className="mt-3.5 flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[14.5px] text-ink-400 shadow-[0_8px_20px_-10px_rgb(120_40_0/0.6)]">
          <Icon name="search" size={17} />
          手擀面
          <span className="ml-auto rounded-full brand-grad px-3 py-1 text-[13px] font-semibold text-white">搜索</span>
        </div>
      </div>
      <div className="relative -mt-11 space-y-3.5 px-3.5 pb-28">
        <div className="grid grid-cols-4 gap-y-3 rounded-[22px] bg-white px-2 py-4 shadow-[0_10px_30px_-18px_rgb(60_30_10/0.5)]">
          {CATS.map((c) => (
            <button key={c.label} type="button" onClick={() => mToast('示例里只开放“美食外卖”里的张记手擀面')} className="m-press flex flex-col items-center gap-1.5">
              <span className={cx('flex h-11 w-11 items-center justify-center rounded-[15px] bg-gradient-to-b text-white shadow-[0_6px_14px_-8px_rgb(0_0_0/0.4)]', c.bg)}>
                <Icon name={c.icon} size={21} strokeWidth={2} />
              </span>
              <span className="text-[12px] font-medium text-ink-700">{c.label}</span>
            </button>
          ))}
        </div>
        {coupon ? (
          <div className="anim-pop relative flex items-center gap-3 overflow-hidden rounded-[20px] bg-gradient-to-r from-[#fff2e4] to-[#ffdcc0] p-3.5 ring-1 ring-[#ffd0a8]">
            <div className="flex h-[58px] w-[72px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-white text-primary-600 shadow-[0_6px_14px_-10px_rgb(180_60_0/0.6)]">
              <span className="num text-[24px] font-extrabold leading-none">¥8</span>
              <span className="mt-1 text-[10.5px] font-medium">满 40 可用</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-ink-900">{w.coupon.name}</div>
              <div className="mt-0.5 text-[12px] text-ink-500">平台券 · 今日 {w.coupon.window} · 可与商家满减叠加</div>
            </div>
            <span className="brand-grad shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white">{w.claimed ? '已领取' : '领取'}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 text-[13px] text-ink-500 shadow-[0_8px_24px_-18px_rgb(60_30_10/0.4)]">
            <Icon name="ticket" size={20} className="text-ink-300" />
            午市活动将在 10:30 开始
          </div>
        )}
        <div className="flex items-end justify-between px-1 pt-1">
          <h2 className="text-[19px] font-bold text-ink-900">附近好店</h2>
          <div className="flex gap-1.5 text-[12px]">
            {['综合', '距离', '满减'].map((c, i) => (
              <span key={c} className={cx('rounded-full px-2.5 py-1 font-medium', i === 0 ? 'bg-ink-900 text-white' : 'bg-white text-ink-600')}>
                {c}
              </span>
            ))}
          </div>
        </div>
        <Card demo="user-store" onClick={() => (open ? setUserScreen('shop') : mToast('张记手擀面 10:45 开门'))} className={cx('flex gap-3 !p-3', !open && 'opacity-75')}>
          <div className="relative">
            <FoodArt kind="beefNoodle" size={92} steam={open} />
            {!open ? <span className="absolute inset-x-0 bottom-0 rounded-b-[16px] bg-black/55 py-0.5 text-center text-[11px] font-semibold text-white">休息中</span> : null}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <div className="truncate text-[16px] font-bold text-ink-900">{MERCHANT.name}</div>
            <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-500">
              <span className="font-bold text-primary-600">★ {MERCHANT.rating}</span>
              <span>月售 {MERCHANT.monthSales}</span>
              <span className="ml-auto">3.3km</span>
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-500">约 30 分钟 · 起送 ¥15 · 配送 ¥{rain ? 7 : 5}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {MERCHANT_TIERS.map((t) => (
                <span key={t.min} className="rounded-[6px] px-1.5 text-[11px] leading-[19px] text-primary-600 ring-1 ring-inset ring-primary-300">
                  满{t.min / 100}减{t.off / 100}
                </span>
              ))}
              {coupon ? <span className="rounded-[6px] bg-primary-500 px-1.5 text-[11px] leading-[19px] text-white">平台券 40-8</span> : null}
            </div>
          </div>
        </Card>
        {OTHER_STORES.map((s) => (
          <Card key={s.name} onClick={() => mToast('示例里只开放张记手擀面')} className="flex gap-3 !p-3 opacity-80">
            <FoodArt kind={s.kind} size={72} />
            <div className="min-w-0 flex-1 py-0.5">
              <div className="truncate text-[15px] font-semibold text-ink-900">{s.name}</div>
              <div className="mt-1 flex items-center gap-2 text-[12.5px] text-ink-500">
                <span className="font-semibold text-primary-600">★ {s.rating}</span>
                <span>{s.meta}</span>
              </div>
              <span className="mt-1.5 inline-block rounded-[6px] bg-black/[0.04] px-1.5 text-[11px] leading-[19px] text-ink-500">{s.tag}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OngoingBar({ w }: { w: World }) {
  const o = w.order!;
  return (
    <button type="button" onClick={() => mUi.set({ detached: false })} className="m-press anim-rise absolute inset-x-3 z-30 flex items-center gap-3 rounded-[20px] bg-[#1f2329] px-3.5 py-3 text-left text-white shadow-pop" style={{ bottom: 'calc(var(--sab) + 70px)' }}>
      <StoreBadge size={36} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold">{statusLine(w)[0]}</div>
        <div className="text-[12px] text-white/60">{o.promisedAt ? `预计 ${clockLabel(o.promisedAt)} 前送达` : '订单进行中'}</div>
      </div>
      <Icon name="chevronRight" size={18} className="text-white/60" />
    </button>
  );
}

/* ---------------- 店铺与加购 ---------------- */

interface Flyer {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function Shop({ w, picked }: { w: World; picked: Record<string, number> }) {
  useTone('light');
  const [cat, setCat] = useState('热销');
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [bump, setBump] = useState(0);
  const cartRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const goods = Object.entries(picked).reduce((a, [id, n]) => a + DISH_MAP[id].price * n, 0);
  const count = Object.values(picked).reduce((a, n) => a + n, 0);
  const next = MERCHANT_TIERS.find((t) => goods < t.min);
  const prev = useRef(picked);
  useEffect(() => {
    const before = prev.current;
    prev.current = picked;
    const grown = Object.keys(picked).filter((id) => (picked[id] ?? 0) > (before[id] ?? 0));
    if (!grown.length) return;
    setBump((b) => b + 1);
    const root = rootRef.current;
    const to = cartRef.current?.getBoundingClientRect();
    if (!root || !to) return;
    const r = root.getBoundingClientRect();
    const scale = r.width / (root.offsetWidth || r.width);
    for (const id of grown) {
      const from = root.querySelector(`[data-demo="add-${id}"]`)?.getBoundingClientRect();
      if (!from) continue;
      const f = { id: Date.now() + Math.random(), x: (from.left - r.left + from.width / 2) / scale, y: (from.top - r.top + from.height / 2) / scale, dx: (to.left - from.left + (to.width - from.width) / 2) / scale, dy: (to.top - from.top + (to.height - from.height) / 2) / scale };
      setFlyers((s) => [...s, f]);
      window.setTimeout(() => setFlyers((s) => s.filter((x) => x.id !== f.id)), 620);
    }
  }, [picked]);
  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col bg-white">
      <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#3b2a1f] via-[#4a3426] to-[#6b4630] px-4 pb-4 text-white" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
        <div className="pointer-events-none absolute -right-6 top-2 opacity-90">
          <FoodArt kind="beefNoodle" size={128} steam />
        </div>
        <button type="button" aria-label="返回" onClick={() => setUserScreen(null)} className="m-press relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
        </button>
        <div className="relative mt-3 flex items-center gap-3">
          <StoreBadge size={52} />
          <div className="min-w-0">
            <div className="text-[19px] font-bold leading-tight">{MERCHANT.short}</div>
            <div className="mt-1 text-[12.5px] text-white/75">★ {MERCHANT.rating} · 月售 {MERCHANT.monthSales} · 约 30 分钟</div>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-1.5">
          {MERCHANT_TIERS.map((t) => (
            <span key={t.min} className="rounded-[7px] bg-white/15 px-2 text-[12px] leading-[22px]">
              满{t.min / 100}减{t.off / 100}
            </span>
          ))}
          {w.coupon.status === 'published' ? <span className="rounded-[7px] bg-primary-500 px-2 text-[12px] leading-[22px]">平台券 满40减8</span> : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-5 border-b border-black/[0.05] px-4 pt-2 text-[15px]">
        {['点菜', '评价 4.8', '商家'].map((t, i) => (
          <span key={t} className={cx('relative pb-2.5', i === 0 ? 'font-bold text-ink-900' : 'text-ink-500')}>
            {t}
            {i === 0 ? <span className="absolute inset-x-1 bottom-0 h-[3px] rounded-full brand-grad" /> : null}
          </span>
        ))}
      </div>
      <div className="flex min-h-0 flex-1">
        <nav className="w-[78px] shrink-0 bg-[#f7f4f1] pt-1">
          {['热销', '面食', '小吃', '饮品'].map((c) => (
            <button key={c} type="button" onClick={() => setCat(c)} className={cx('relative flex h-12 w-full items-center justify-center text-[13.5px]', cat === c ? 'bg-white font-semibold text-ink-900' : 'text-ink-500')}>
              {cat === c ? <span className="absolute left-0 top-3 h-6 w-[3px] rounded-r brand-grad" /> : null}
              {c}
            </button>
          ))}
        </nav>
        <ul className="m-scroll min-h-0 flex-1 px-3 pb-28">
          {DISHES.map((d) => {
            const n = picked[d.id] ?? 0;
            return (
              <li key={d.id} className="flex gap-3 border-b border-black/[0.04] py-3">
                <FoodArt kind={d.kind} size={76} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="truncate text-[15px] font-bold text-ink-900">{d.name}</div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-400">{d.desc}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">月售 {d.sales}</div>
                  <div className="mt-auto flex items-center justify-between pt-1">
                    <span className="num text-[17px] font-extrabold text-primary-600">
                      <span className="text-[12px]">¥</span>
                      {d.price / 100}
                    </span>
                    <span className="flex items-center gap-2">
                      {n ? (
                        <>
                          <button type="button" aria-label={`减少${d.name}`} onClick={() => pickDish(d.id, -1)} className="m-press flex h-7 w-7 items-center justify-center rounded-full text-primary-600 ring-[1.5px] ring-primary-400">
                            <Icon name="minus" size={14} strokeWidth={2.6} />
                          </button>
                          <span key={n} className="anim-pop num w-4 text-center text-[15px] font-bold">
                            {n}
                          </span>
                        </>
                      ) : null}
                      <button type="button" data-demo={`add-${d.id}`} aria-label={`加购${d.name}`} onClick={() => pickDish(d.id)} className="m-press brand-grad flex h-7 w-7 items-center justify-center rounded-full text-white shadow-[0_6px_12px_-6px_rgb(242_90_15/0.9)]">
                        <Icon name="plus" size={15} strokeWidth={2.8} />
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {flyers.map((f) => (
        <span key={f.id} className="pointer-events-none absolute z-50 fly-x" style={{ left: f.x - 9, top: f.y - 9, ['--dx' as string]: `${f.dx}px` }}>
          <span className="fly-y block h-[18px] w-[18px] rounded-full brand-grad shadow-[0_4px_10px_rgb(242_90_15/0.6)]" style={{ ['--dy' as string]: `${f.dy}px` }} />
        </span>
      ))}
      <div className="absolute inset-x-3 z-30 flex h-[60px] items-center gap-3 rounded-full bg-[#1f2329] pl-2 pr-2 text-white shadow-[0_16px_34px_-14px_rgb(0_0_0/0.7)]" style={{ bottom: 'calc(var(--sab) + 10px)' }}>
        <span ref={cartRef} key={bump} className={cx('relative flex h-[46px] w-[46px] -translate-y-3 items-center justify-center rounded-full brand-grad ring-4 ring-[#1f2329]', bump > 0 && 'anim-bump')}>
          <Icon name="bag" size={22} strokeWidth={2} />
          {count ? <span className="num absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-seal-500 px-1 text-[11px] font-bold">{count}</span> : null}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="num text-[18px] font-bold">{count ? rmb(goods) : <span className="text-[14px] font-medium text-white/50">未选购商品</span>}</div>
          <div className="truncate text-[11.5px] text-white/55">{next ? `再买 ${yuan(next.min - goods)} 元可减 ${next.off / 100} 元` : '已享满 50 减 6'}</div>
        </div>
        <button type="button" data-demo="user-checkout" disabled={!count} onClick={() => advance('cart') && setUserScreen(null)} className="m-press brand-grad h-11 rounded-full px-6 text-[15px] font-bold disabled:opacity-35">
          去结算
        </button>
      </div>
    </div>
  );
}

/* ---------------- 确认订单 + 收银台 ---------------- */

function Checkout({ w, cashier }: { w: World; cashier?: boolean }) {
  const p = w.pricing;
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  const [paying, setPaying] = useState(false);
  const active = useFlow((s) => s.active);
  const paySub = useFlow((s) => (s.active && STEPS[s.idx]?.id === 'pay' ? s.sub : -1));
  if (!p) return null;
  const pay = () => {
    setPaying(true);
    window.setTimeout(() => advance('paid'), 900);
  };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Header tone="brand" title="确认订单" onBack={() => mUi.set({ detached: true })} />
      <div className="m-scroll min-h-0 flex-1 space-y-3 px-3.5 pb-28 pt-3">
        <Card className="flex items-start gap-3">
          <span className="brand-grad mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white">
            <Icon name="pin" size={17} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink-900">{CUSTOMER.address.replace('滨湖区', '')}</div>
            <div className="mt-0.5 text-[13px] text-ink-500">
              {CUSTOMER.name} {CUSTOMER.phone}
            </div>
            <div className="mt-2 flex items-center gap-1.5 rounded-[10px] bg-primary-50 px-2.5 py-1.5 text-[12.5px] font-medium text-primary-700">
              <Icon name="clock" size={14} />
              立即送出 · 预计 {rain ? '12:30' : '12:25'} 前送达
            </div>
          </div>
        </Card>
        <Card anchor="user-pricing">
          <div className="mb-2 flex items-center gap-2 text-[15px] font-bold text-ink-900">
            <StoreBadge size={24} />
            {MERCHANT.short}
          </div>
          {p.lines.map((l) => (
            <div key={l.dishId} className="flex items-center gap-3 py-1.5">
              <FoodArt kind={DISH_MAP[l.dishId].kind} size={44} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-ink-800">{l.name}</span>
              <span className="text-[13px] text-ink-400">×{l.qty}</span>
              <span className="num w-[64px] text-right text-[14px] font-semibold text-ink-900">{rmb(l.amount)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-black/[0.08]" />
          <Row k="包装费" v={rmb(p.pack)} />
          <Row k={<span>配送费 {rain ? <Pill tone="warn">大雨 +2</Pill> : p.deliveryDistance ? <Pill tone="neutral">超距 +1</Pill> : null}</span>} v={rmb(p.delivery)} />
          <Row k={p.merchantTier ? `商家满减 · 满${p.merchantTier.min / 100}减${p.merchantTier.off / 100}` : '商家满减'} v={p.merchantOff ? `-${rmb(p.merchantOff)}` : '未达门槛'} tone={p.merchantOff ? 'brand' : 'muted'} />
          <div className={cx('mt-2 flex items-center justify-between rounded-[14px] px-3 py-2.5', p.couponApplied ? 'bg-gradient-to-r from-[#fff2e4] to-[#ffe2c8]' : 'bg-ink-50')}>
            <span className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
              <Icon name="ticket" size={17} className={p.couponApplied ? 'text-primary-600' : 'text-ink-400'} />
              {w.coupon.name}
            </span>
            <span className={cx('num text-[15px] font-bold', p.couponApplied ? 'text-primary-600' : 'text-ink-400')}>{p.couponApplied ? `-${rmb(p.couponOff)}` : '不可用'}</span>
          </div>
          {p.couponHint ? <p className="anim-fade mt-2 rounded-[10px] bg-amber-50 px-2.5 py-1.5 text-[12.5px] leading-[18px] text-amber-700">{p.couponHint}</p> : null}
          <div className="mt-3 flex items-baseline justify-end gap-2 border-t border-black/[0.05] pt-3">
            <span className="text-[13px] text-primary-600">已优惠 {rmb(p.merchantOff + p.couponOff)}</span>
            <span className="text-[13px] text-ink-500">小计</span>
            <span className="num text-[20px] font-extrabold text-ink-900">{rmb(p.payable)}</span>
          </div>
        </Card>
        <Card className="flex items-center justify-between !py-3 text-[14px]">
          <span className="text-ink-600">备注</span>
          <span className="text-ink-400">少辣，不要香菜</span>
        </Card>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-black/[0.05] bg-white/95 px-4 pt-3 backdrop-blur-xl" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="num text-[22px] font-extrabold text-ink-900">{rmb(p.payable)}</div>
          <div className="num text-[12px] text-primary-600">已优惠 {rmb(p.merchantOff + p.couponOff)}</div>
        </div>
        <div className="w-[150px] shrink-0">
          <Btn demo="user-submit" onClick={() => advance('ordered')} disabled={!!cashier}>
            提交订单
          </Btn>
        </div>
      </div>
      <Sheet open={!!cashier} onClose={() => !active && mUi.set({ detached: true })}>
        <div className="relative overflow-hidden px-5 pb-5 pt-3">
          <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#0e7490] text-white">
              <Icon name="wallet" size={15} strokeWidth={2} />
            </span>
            橙子收银台
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">模拟环境</span>
            <span className="num ml-auto text-[12.5px] font-normal text-ink-400">剩余 14:58</span>
          </div>
          {paying || paySub >= 1 ? (
            <div className="flex flex-col items-center py-8">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#0e7490]">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path className="anim-draw" d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div className="mt-4 text-[18px] font-bold text-ink-900">支付成功</div>
              <div className="mt-1 text-[13px] text-ink-500">等待网关回调，平台验签中…</div>
            </div>
          ) : (
            <>
              <div className="num mt-6 text-center text-[40px] font-extrabold tracking-tight text-ink-900">{rmb(p.payable)}</div>
              <div className="code mt-1 text-center text-[12px] text-ink-400">{w.order?.no}</div>
              <div className="mt-5 space-y-2">
                {['模拟支付渠道 A（默认）', '模拟支付渠道 B'].map((m, i) => (
                  <div key={m} className={cx('flex items-center justify-between rounded-[14px] px-4 py-3 text-[14.5px] ring-1', i === 0 ? 'bg-[#ecfeff] ring-[#a5e4ef]' : 'ring-black/[0.06]')}>
                    <span className="text-ink-800">{m}</span>
                    <span className={cx('flex h-5 w-5 items-center justify-center rounded-full', i === 0 ? 'bg-[#0e7490] text-white' : 'ring-1 ring-black/20')}>{i === 0 ? <Icon name="check" size={12} strokeWidth={3} /> : null}</span>
                  </div>
                ))}
              </div>
              <Btn demo="user-pay" tone="dark" className="mt-5" onClick={pay}>
                确认支付 {rmb(p.payable)}
              </Btn>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

/* ---------------- 订单追踪 ---------------- */

export function statusLine(w: World): [string, string] {
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
      return [w.reassign ? `已更换骑手，${r}正赶往商家` : `${r}正赶往商家`, promise];
    case 'arrived':
      return [`${r}已到店，等待出餐`, promise];
    case 'ready':
      return ['商家已出餐', `${r}正在取餐`];
    case 'picked':
      return [`${r}正在火速送餐`, promise];
    case 'delivered':
      return ['订单已送达', w.late ? `超时 ${w.late} 分钟，已赔付 3 元券` : '准时送达，祝你用餐愉快'];
    default:
      return ['订单已完成', w.review ? `已评价 ${'★'.repeat(w.review.stars)}` : '感谢你的支持'];
  }
}

const STEPS5: { label: string; on: (w: World) => boolean }[] = [
  { label: '已支付', on: (w) => reached(w, 'paid') },
  { label: '备餐', on: (w) => reached(w, 'accepted') },
  { label: '骑手', on: (w) => reached(w, 'riderAccepted') },
  { label: '配送', on: (w) => reached(w, 'picked') },
  { label: '送达', on: (w) => reached(w, 'delivered') },
];

function Tracking({ w }: { w: World }) {
  useTone('dark');
  const o = w.order!;
  const [h, sub] = statusLine(w);
  const rider = o.riderId && reached(w, 'riderAccepted') ? RIDER_MAP[o.riderId] : null;
  const done = reached(w, 'rated');
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <MMap w={w} focus="user" anchor="live-map" className="absolute inset-x-0 top-0 h-[58%]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#f7f4f1]/90 to-transparent" />
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4" style={{ paddingTop: 'calc(var(--sat) + 8px)' }}>
        <button type="button" aria-label="返回" onClick={() => mUi.set({ detached: true })} className="m-press flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink-800 shadow-raise">
          <Icon name="chevronLeft" size={20} strokeWidth={2.2} />
        </button>
        {o.promisedAt && !reached(w, 'delivered') ? (
          <span className="rounded-full bg-[#1f2329]/90 px-3.5 py-2 text-[13px] font-semibold text-white shadow-raise backdrop-blur">承诺 {clockLabel(o.promisedAt)} 前送达</span>
        ) : null}
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-ink-700 shadow-raise">
          <Icon name="phone" size={17} />
        </span>
      </div>
      <div className="m-scroll absolute inset-x-0 bottom-0 top-[50%] z-20 rounded-t-[28px] bg-[#f7f4f1] shadow-[0_-16px_40px_-20px_rgb(0_0_0/0.35)]">
        <div className="mx-auto mt-2.5 h-[5px] w-10 rounded-full bg-black/15" />
        <div className="space-y-3 px-3.5 pb-8 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 20px)' }}>
          <Card anchor="state-strip">
            <div key={h} className="anim-fade text-[21px] font-extrabold tracking-tight text-ink-900">
              {h}
            </div>
            <div className={cx('mt-1 text-[13.5px] font-medium', w.late && w.stage === 'delivered' ? 'text-amber-700' : 'text-primary-600')}>{sub}</div>
            <div className="mt-4 flex items-center">
              {STEPS5.map((s, i) => {
                const on = s.on(w);
                return (
                  <div key={s.label} className="flex flex-1 items-center last:flex-none">
                    <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-500', on ? 'brand-grad text-white shadow-[0_4px_10px_-4px_rgb(242_90_15/0.8)]' : 'bg-ink-100 text-ink-300')}>
                      {on ? <Icon name="check" size={13} strokeWidth={3} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                    </span>
                    {i < STEPS5.length - 1 ? <span className={cx('mx-1 h-[3px] flex-1 rounded-full transition-colors duration-500', STEPS5[i + 1].on(w) ? 'bg-primary-400' : 'bg-ink-100')} /> : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-1.5 flex justify-between text-[11.5px] text-ink-400">
              {STEPS5.map((s) => (
                <span key={s.label}>{s.label}</span>
              ))}
            </div>
          </Card>
          {rider ? (
            <Card className="anim-rise flex items-center gap-3 !py-3">
              <Avatar name={rider.short} color="var(--color-act-rider)" size={44} />
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-bold text-ink-900">骑手 {rider.short}</div>
                <div className="text-[12.5px] text-ink-500">服务分 {rider.rating} · 今日已送 19 单</div>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pine-50 text-pine-600">
                <Icon name="message" size={18} />
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pine-50 text-pine-600">
                <Icon name="phone" size={18} />
              </span>
            </Card>
          ) : null}
          {w.stage === 'delivered' ? (
            <Btn demo="user-confirm" onClick={() => advance('confirmed')}>
              确认收货
            </Btn>
          ) : null}
          {done ? (
            <button type="button" data-demo="user-refund-entry" onClick={() => setUserScreen('refund')} className="m-press flex w-full items-center justify-center gap-1.5 rounded-full bg-white py-3 text-[14px] font-medium text-ink-700 shadow-raise">
              <Icon name="help" size={16} />
              少送 / 漏送？申请售后
            </button>
          ) : null}
          <Card>
            <div className="mb-1 flex items-center gap-2 text-[14.5px] font-bold text-ink-900">
              <StoreBadge size={22} />
              {MERCHANT.short}
            </div>
            {o.pricing.lines.map((l) => (
              <Row key={l.dishId} k={`${l.name} ×${l.qty}`} v={rmb(l.amount)} />
            ))}
            <div className="mt-1 border-t border-black/[0.05] pt-1">
              <Row k="实付" v={rmb(o.pricing.payable)} strong />
            </div>
            <div className="code mt-1 text-[11.5px] text-ink-400">{o.no}</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 评价 ---------------- */

function Rate({ w }: { w: World }) {
  const late = w.late > 0;
  const [stars, setStars] = useState(late ? 4 : 5);
  const tags = late ? ['面很筋道', '骑手辛苦了'] : ['面很筋道', '送餐快', '包装严实'];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <Header tone="clear" title="评价这一单" sub="你的评价会帮助其他人" />
      <div className="m-scroll min-h-0 flex-1 space-y-4 px-4 pb-28">
        <div className="rounded-[22px] bg-[#fbf8f5] p-4">
          <div className="flex items-center gap-2.5 text-[16px] font-bold text-ink-900">
            <StoreBadge size={34} />
            {MERCHANT.short}
          </div>
          <div className="mt-3">
            <Stars n={stars} size={34} onPick={setStars} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...tags, '分量足', '汤底香'].map((t) => (
              <span key={t} className={cx('rounded-full px-3 py-1.5 text-[13px] font-medium', tags.includes(t) ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300' : 'bg-white text-ink-500 ring-1 ring-black/[0.06]')}>
                {t}
              </span>
            ))}
          </div>
          <p className="mt-3 rounded-[14px] bg-white p-3 text-[14px] leading-[21px] text-ink-700 ring-1 ring-black/[0.04]">{late ? '面很好吃，就是这次出餐慢了点，骑手一直在帮忙催。' : '牛肉炖得很烂，汤没洒，下次还点。'}</p>
          <div className="mt-3 flex gap-2">
            {[0, 1].map((i) => (
              <span key={i} className="flex h-16 w-16 items-center justify-center rounded-[14px] border border-dashed border-black/15 text-ink-300">
                <Icon name="plus" size={20} />
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[22px] bg-[#fbf8f5] p-4">
          <Avatar name={RIDER_MAP[w.order!.riderId!].short} color="var(--color-act-rider)" size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold text-ink-900">骑手 {RIDER_MAP[w.order!.riderId!].short}</div>
            <div className="mt-1">
              <Stars n={5} size={24} />
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>
        <Btn demo="user-rate" onClick={() => advance('rated')}>
          提交评价
        </Btn>
      </div>
    </div>
  );
}

/* ---------------- 售后 ---------------- */

function Refund({ w }: { w: World }) {
  const o = w.order!;
  const calc = w.refund?.calc ?? refundCalc(o.pricing, REFUND_ITEM.dishId, REFUND_ITEM.qty);
  const applied = reached(w, 'refundApplied');
  const steps: [string, boolean, string][] = [
    ['提交申请', applied, w.refund ? clockLabel(w.refund.appliedAt) : ''],
    ['商家同意', reached(w, 'refundApproved'), w.refund?.approvedAt ? clockLabel(w.refund.approvedAt) : ''],
    ['原路退回', reached(w, 'refunded'), w.refund?.doneAt ? clockLabel(w.refund.doneAt) : ''],
  ];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-white">
      <Header tone="clear" title={applied ? '退款进度' : '申请部分退款'} onBack={applied ? () => mUi.set({ detached: true }) : () => setUserScreen(null)} />
      <div className="m-scroll min-h-0 flex-1 space-y-3.5 px-4 pb-28">
        <div className="flex items-center gap-3 rounded-[20px] bg-[#fbf8f5] p-3">
          <FoodArt kind="egg" size={60} />
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold text-ink-900">
              {DISH_MAP[REFUND_ITEM.dishId].name} ×{REFUND_ITEM.qty}
            </div>
            <div className="mt-0.5 text-[13px] text-ink-500">原价 {rmb(calc.itemPrice)}</div>
          </div>
          <span className="brand-grad flex h-6 w-6 items-center justify-center rounded-full text-white">
            <Icon name="check" size={14} strokeWidth={3} />
          </span>
        </div>
        <div>
          <div className="mb-2 text-[14px] font-semibold text-ink-900">原因</div>
          <div className="flex flex-wrap gap-2">
            {['漏送', '洒漏', '口味不佳', '其他'].map((r, i) => (
              <span key={r} className={cx('rounded-full px-3.5 py-1.5 text-[13.5px] font-medium', i === 0 ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-300' : 'bg-[#fbf8f5] text-ink-500')}>
                {r}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-[20px] bg-gradient-to-br from-[#fff4ea] to-[#ffe6d2] p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-semibold text-ink-900">可退金额</span>
            <span className="num text-[28px] font-extrabold text-primary-600">{rmb(calc.refund)}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-[19px] text-ink-600">按商品原价占比分摊本单优惠 {rmb(calc.discountShare)}；包装费、配送费不退。</p>
        </div>
        {applied ? (
          <ol className="relative space-y-4 rounded-[20px] bg-[#fbf8f5] p-4">
            {steps.map(([l, on, t], i) => (
              <li key={l} className="relative flex items-center gap-3">
                {i < steps.length - 1 ? <span className={cx('absolute left-[11px] top-6 h-5 w-[2px]', steps[i + 1][1] ? 'bg-pine-500' : 'bg-ink-150')} /> : null}
                <span className={cx('flex h-6 w-6 items-center justify-center rounded-full transition-colors', on ? 'bg-pine-500 text-white' : 'bg-ink-150')}>{on ? <Icon name="check" size={13} strokeWidth={3} /> : null}</span>
                <span className={cx('text-[14.5px]', on ? 'font-semibold text-ink-900' : 'text-ink-400')}>{l}</span>
                <span className="num ml-auto text-[12.5px] text-ink-400">{t}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pt-3" style={{ paddingBottom: 'calc(var(--sab) + 12px)' }}>
        {applied ? (
          <div className={cx('rounded-full py-3.5 text-center text-[15px] font-bold', reached(w, 'refunded') ? 'bg-pine-50 text-pine-700' : 'bg-ink-50 text-ink-500')}>{reached(w, 'refunded') ? `${yuan(calc.refund)} 元已原路退回` : '等待商家处理…'}</div>
        ) : (
          <Btn demo="user-refund" onClick={() => advance('refundApplied')}>
            提交申请
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ---------------- 订单页签 / 我的 ---------------- */

function Orders({ w }: { w: World }) {
  const o = w.order && reached(w, 'paid') ? w.order : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header tone="light" title="订单" />
      <div className="m-scroll min-h-0 flex-1 space-y-3 px-3.5 pb-32 pt-1">
        {o ? (
          <Card onClick={() => mUi.set({ detached: false })} className="!p-3.5">
            <div className="flex items-center gap-2.5">
              <StoreBadge size={34} />
              <span className="flex-1 text-[15px] font-bold text-ink-900">{MERCHANT.short}</span>
              <Pill tone={reached(w, 'delivered') ? 'green' : 'brand'}>{statusLine(w)[0]}</Pill>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[13px] text-ink-500">
              <span>{o.pricing.lines.map((l) => `${l.name.replace('招牌', '')}×${l.qty}`).join('、')}</span>
              <span className="num font-semibold text-ink-900">{rmb(o.pricing.payable)}</span>
            </div>
          </Card>
        ) : null}
        {[
          ['橙汁小站（湖滨店）', '10 月 16 日', '已完成', 2600, 'tea'],
          ['阿婆卤味', '10 月 12 日', '已完成', 3850, 'egg'],
        ].map(([n, d, s, a, k]) => (
          <Card key={n as string} className="flex items-center gap-3 !p-3.5 opacity-80">
            <FoodArt kind={k as DishKind} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-semibold text-ink-900">{n}</div>
              <div className="text-[12.5px] text-ink-400">
                {d} · {s}
              </div>
            </div>
            <span className="num text-[14px] font-semibold text-ink-700">{rmbShort(a as number)}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Mine({ w }: { w: World }) {
  useTone('light');
  return (
    <div className="m-scroll min-h-0 flex-1">
      <div className="brand-grad px-5 pb-14 text-white" style={{ paddingTop: 'calc(var(--sat) + 22px)' }}>
        <div className="flex items-center gap-3.5">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/25 text-[24px] font-bold">林</span>
          <div>
            <div className="text-[21px] font-bold">{CUSTOMER.name}</div>
            <div className="text-[13px] text-white/80">{CUSTOMER.phone} · 橙子会员</div>
          </div>
        </div>
      </div>
      <div className="-mt-9 space-y-3 px-3.5 pb-32">
        <div className="grid grid-cols-3 rounded-[20px] bg-white py-4 text-center shadow-[0_10px_30px_-18px_rgb(60_30_10/0.5)]">
          {[
            [String((w.claimed ? 1 : 0) + (w.compensation ? 1 : 0) + 2), '红包卡券'],
            ['128', '积分'],
            ['3', '收藏'],
          ].map(([v, k]) => (
            <div key={k}>
              <div className="num text-[20px] font-bold text-ink-900">{v}</div>
              <div className="text-[12px] text-ink-500">{k}</div>
            </div>
          ))}
        </div>
        <Card>
          <div className="mb-2 text-[15px] font-bold text-ink-900">我的卡券</div>
          {[
            ...(w.claimed ? [[w.coupon.name, reached(w, 'paid') ? '已使用' : '今日可用', '¥8'] as const] : []),
            ...(w.compensation ? [['超时赔付券（无门槛）', '下次下单可用', '¥3'] as const] : []),
            ['新客饮品券', '满 20 可用', '¥4'] as const,
          ].map(([n, s, v]) => (
            <div key={n} className="flex items-center gap-3 border-t border-black/[0.04] py-2.5 first:border-0">
              <span className="num flex h-10 w-12 items-center justify-center rounded-[10px] bg-primary-50 text-[15px] font-extrabold text-primary-600">{v}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink-900">{n}</div>
                <div className="text-[12px] text-ink-400">{s}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card className="space-y-0 !py-1">
          {['收货地址', '客服中心', '设置'].map((k) => (
            <div key={k} className="flex items-center justify-between border-t border-black/[0.04] py-3 text-[14.5px] text-ink-800 first:border-0">
              {k}
              <Icon name="chevronRight" size={16} className="text-ink-300" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
