import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { BrandMark, StoreBadge } from '@/components/live/FoodArt';
import { displayClock, useAnimTick } from '@/components/live/liveHooks';
import { RIDER_MAP } from '@/domain/catalog';
import { useFlow } from '@/flow/director';
import { hm } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached } from '@/sim/world';
import { useScenario, useWorld } from '@/state/live';
import { navigate } from '@/lib/router';
import { setRole } from '@/state/session';
import { useTone } from './kit';
import { mUi, openApp, type AppKey } from './mstate';
import { statusLine } from './UserMobile';
import { STEPS } from '@/flow/workflow';

const APPS: { key: Exclude<AppKey, 'home'>; name: string; icon: IconName; bg: string; role: 'user' | 'merchant' | 'rider' | 'ops' }[] = [
  { key: 'user', name: '橙子到家', icon: 'bag', bg: 'brand-grad', role: 'user' },
  { key: 'merchant', name: '商家版', icon: 'store', bg: 'bg-gradient-to-b from-[#3a3f48] to-[#16181d]', role: 'merchant' },
  { key: 'rider', name: '橙子骑手', icon: 'bike', bg: 'bg-gradient-to-b from-[#1fc48d] to-[#0b8a5f]', role: 'rider' },
  { key: 'ops', name: '橙子运营', icon: 'chart', bg: 'bg-gradient-to-b from-[#9b6cf0] to-[#5b2d91]', role: 'ops' },
];

/** 打开某个 App：同时切换演示角色；运营端打开看板 */
export function launch(key: Exclude<AppKey, 'home'>) {
  const a = APPS.find((x) => x.key === key)!;
  setRole(a.role);
  navigate(key === 'ops' ? '/ops' : '/live');
  openApp(key);
}

/** 手机桌面：时间与日期、订单实时活动、一键演示组件、四个 App */
export function Springboard() {
  useTone('light');
  const w = useWorld();
  const scenario = useScenario();
  const { anim, p } = useAnimTick();
  const clock = displayClock(w, anim, p);
  const active = useFlow((s) => s.active);
  const live = w.order && reached(w, 'paid') && !reached(w, 'confirmed');
  const sc = SCENARIO_MAP[scenario];
  return (
    <div className="anim-home-in relative flex h-full flex-col overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_80%_0%,#ff9a3c_0%,#f25a0f_32%,#7a2a10_68%,#2a1610_100%)]" />
      <div className="anim-drift pointer-events-none absolute -left-20 top-40 h-72 w-72 rounded-full bg-[#ffb86b]/30 blur-3xl" />
      <div className="anim-drift pointer-events-none absolute -right-24 bottom-32 h-80 w-80 rounded-full bg-[#ff6a2a]/25 blur-3xl" style={{ animationDelay: '-4s' }} />
      <div className="relative flex min-h-0 flex-1 flex-col px-5" style={{ paddingTop: 'calc(var(--sat) + 18px)', paddingBottom: 'calc(var(--sab) + 14px)' }}>
        <div className="text-center">
          <div className="text-[15px] font-medium text-white/85">10月18日 星期日 · 临江市</div>
          <div className="num text-[78px] font-semibold leading-none tracking-[-0.04em]">{hm(clock % 1440)}</div>
          <div className="mt-1 text-[12.5px] text-white/70">业务时钟 · {clock >= 1440 ? '次日' : '当日'}</div>
        </div>
        {live ? (
          <button type="button" onClick={() => launch('user')} className="m-press anim-rise mt-6 w-full rounded-[26px] bg-black/35 p-4 text-left ring-1 ring-white/10 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <StoreBadge size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-bold">{statusLine(w)[0]}</div>
                <div className="text-[12.5px] text-white/70">{w.order?.promisedAt ? `承诺 ${clockLabel(w.order.promisedAt)} 前送达` : '订单进行中'}</div>
              </div>
              <span className="num text-[22px] font-bold">{w.order?.promisedAt ? clockLabel(w.order.promisedAt) : '--:--'}</span>
            </div>
            <LiveBar />
            {w.order?.riderId && reached(w, 'riderAccepted') ? <div className="mt-2 text-[12px] text-white/70">骑手 {RIDER_MAP[w.order.riderId].short} · 实时活动</div> : null}
          </button>
        ) : (
          <button type="button" disabled={active} onClick={() => mUi.set({ start: true })} className="m-press anim-rise mt-6 flex w-full items-center gap-3.5 rounded-[26px] bg-black/30 p-4 text-left ring-1 ring-white/10 backdrop-blur-2xl disabled:opacity-60">
            <span className="brand-grad flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-[0_8px_20px_-8px_rgb(0_0_0/0.5)]">
              <Icon name="play" size={22} strokeWidth={2.2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-bold">一键演示一单外卖</div>
              <div className="truncate text-[12.5px] text-white/70">
                {sc.title} · {STEPS.length} 个环节 · 四个 App 自动切换
              </div>
            </div>
            <Icon name="chevronRight" size={18} className="text-white/60" />
          </button>
        )}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-[24px] bg-white/[0.14] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="flex items-center gap-1.5 text-[12px] text-white/75">
              <Icon name={sc.params.weather === 'rain' ? 'rain' : 'sparkle'} size={14} />
              滨湖区天气
            </div>
            <div className="mt-1.5 text-[24px] font-bold leading-none">{sc.params.weather === 'rain' ? '大雨' : '晴 22°'}</div>
            <div className="mt-1 text-[11.5px] text-white/70">{sc.params.weather === 'rain' ? '配送费 +2 · 骑手补贴 +3' : '适合点一碗热汤面'}</div>
          </div>
          <div className="rounded-[24px] bg-white/[0.14] p-3.5 ring-1 ring-white/10 backdrop-blur-xl">
            <div className="flex items-center gap-1.5 text-[12px] text-white/75">
              <Icon name="route" size={14} />
              当前情景
            </div>
            <div className="mt-1.5 line-clamp-2 text-[15px] font-bold leading-tight">{sc.title}</div>
            <div className="mt-1 text-[11.5px] text-white/70">{sc.tag}</div>
          </div>
        </div>
        <div className="mt-auto">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-[12px] text-white/70">
            <BrandMark size={16} />
            一台手机里的四个 App · 点图标打开
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-[30px] bg-white/[0.16] px-3 py-3 ring-1 ring-white/10 backdrop-blur-2xl">
            {APPS.map((a) => (
              <button key={a.key} type="button" data-demo={`open-${a.key}`} onClick={() => launch(a.key)} className="m-press flex flex-col items-center gap-1.5">
                <span className={cx('flex h-[60px] w-[60px] items-center justify-center rounded-[17px] shadow-[0_10px_20px_-10px_rgb(0_0_0/0.6)] ring-1 ring-white/15', a.bg)}>
                  <Icon name={a.icon} size={28} strokeWidth={2} />
                </span>
                <span className="text-[11.5px] font-medium text-white/95">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 实时活动的进度条：下单 → 承诺送达 */
export function LiveBar({ thin }: { thin?: boolean }) {
  const w = useWorld();
  const { anim, p } = useAnimTick();
  const clock = displayClock(w, anim, p);
  const o = w.order;
  if (!o) return null;
  const end = o.promisedAt ?? o.createdAt + 35;
  const v = reached(w, 'delivered') ? 1 : Math.max(0.04, Math.min(0.98, (clock - o.createdAt) / (end - o.createdAt)));
  return (
    <div className={cx('relative mt-3 rounded-full bg-white/20', thin ? 'h-1' : 'h-1.5')}>
      <div className="h-full rounded-full bg-gradient-to-r from-[#ffd29a] to-white transition-[width] duration-300" style={{ width: `${v * 100}%` }} />
      {!thin ? (
        <span className="absolute -top-[7px] flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-white text-[#0e9f6e] shadow" style={{ left: `${v * 100}%` }}>
          <Icon name="bike" size={12} strokeWidth={2.4} />
        </span>
      ) : null}
    </div>
  );
}
