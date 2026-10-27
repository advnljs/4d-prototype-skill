import { useEffect, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { displayClock, useAnimTick } from '@/components/live/liveHooks';
import { RIDER_MAP } from '@/domain/catalog';
import { useFlow, useFlowStep } from '@/flow/director';
import { STEPS } from '@/flow/workflow';
import { hm } from '@/lib/format';
import { useRoute } from '@/lib/router';
import { clockLabel, reached } from '@/sim/world';
import { useWorld } from '@/state/live';
import { useAutoDispatch, useLiveFlow } from '@/state/liveFlow';
import { couponScript, useMoneyWalk, useOpsWalk } from '@/state/opsFlow';
import { USERS } from '@/state/session';
import { DemoLayer } from './DemoLayer';
import { MerchantMobile } from './MerchantMobile';
import { OpsMobile } from './OpsMobile';
import { RiderMobile } from './RiderMobile';
import { Springboard } from './Springboard';
import { UserMobile } from './UserMobile';
import { goHome, mToast, mUi, useM, type AppKey } from './mstate';

const APP_NAME: Record<Exclude<AppKey, 'home'>, string> = { user: '橙子到家', merchant: '商家版', rider: '橙子骑手', ops: '橙子运营' };

/** 演示中手机该显示哪个 App：跟随当前子步骤的“人”，机器子步骤跟随环节的演示角色 */
function useVisibleApp(): AppKey {
  const chosen = useM((s) => s.app);
  const { path } = useRoute();
  // 选择器只返回基本类型：返回新对象会让 useSyncExternalStore 每次都认为状态变了而无限重渲染
  const idx = useFlow((s) => (s.active ? s.idx : -1));
  const sub = useFlow((s) => s.sub);
  if (idx < 0) return chosen;
  const step = STEPS[idx];
  if (path === '/ops' || path === '/settle') return 'ops';
  const a = step.subs[Math.min(sub, step.subs.length - 1)]?.actor;
  if (a === 'user' || a === 'merchant' || a === 'rider' || a === 'ops') return a;
  return step.role;
}

/**
 * 手机“系统层”：桌面与四个 App、打开动画、状态栏与灵动岛（外框模式）、演示层。
 * 所有环节脚本在这里常驻注册：App 切换时组件会卸载，脚本不能跟着卸载。
 */
export function PhoneOS({ framed }: { framed: boolean }) {
  const app = useVisibleApp();
  const active = useFlow((s) => s.active);
  useLiveFlow();
  useAutoDispatch();
  useFlowStep('coupon', couponScript);
  useOpsWalk();
  useMoneyWalk();

  // 演示中自动切换 App 时提示一下；演示结束后停留在最后一个 App
  const last = useRef(app);
  useEffect(() => {
    if (active && app !== last.current && app !== 'home') {
      const who = app === 'rider' ? null : USERS[app];
      mToast(`切换到 ${APP_NAME[app]}${who ? ` · ${who.name}` : ''}`);
    }
    last.current = app;
  }, [app, active]);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) mUi.set({ app: last.current, panel: false });
    wasActive.current = active;
  }, [active]);

  return (
    <div className={cx('relative h-full w-full overflow-hidden bg-[#1b130e]', framed ? 'm-framed' : 'm-screen')} style={active ? ({ ['--sat-base' as string]: 'var(--sat0)', ['--sat' as string]: 'calc(var(--sat0) + 52px)' } as React.CSSProperties) : ({ ['--sat-base' as string]: 'var(--sat0)', ['--sat' as string]: 'var(--sat0)' } as React.CSSProperties)}>
      <div key={app} className={cx('absolute inset-0', app === 'home' ? '' : 'anim-app-open')}>
        {app === 'home' ? <Springboard /> : app === 'user' ? <UserMobile /> : app === 'merchant' ? <MerchantMobile /> : app === 'rider' ? <RiderMobile /> : <OpsMobile />}
      </div>
      {active ? <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/45 to-transparent" style={{ height: 'calc(var(--sat0) + 60px)' }} /> : null}
      {framed ? <StatusBar /> : null}
      {framed ? <Island /> : null}
      <DemoLayer app={app} />
      <AppToast />
      {framed ? (
        <button type="button" aria-label="回到桌面" onClick={() => !active && goHome()} className="absolute inset-x-0 bottom-0 z-50 flex h-[22px] items-end justify-center pb-2">
          <span className={cx('h-[5px] w-[134px] rounded-full', app === 'merchant' || app === 'home' ? 'bg-white/80' : 'bg-black/80')} />
        </button>
      ) : null}
    </div>
  );
}

/** 外框模式的状态栏：显示业务时钟 */
function StatusBar() {
  const w = useWorld();
  const { anim, p } = useAnimTick();
  const tone = useM((s) => s.tone);
  const active = useFlow((s) => s.active);
  const light = tone === 'light' || active;
  return (
    <div className={cx('pointer-events-none absolute inset-x-0 top-0 z-50 flex h-[47px] items-center justify-between px-8 pt-1 text-[15px] font-semibold', light ? 'text-white' : 'text-ink-900')}>
      <span className="num w-16 text-center">{hm(displayClock(w, anim, p) % 1440)}</span>
      <span className="flex w-16 items-center justify-center gap-1.5">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
          <rect x="10" y="3" width="3" height="9" rx="0.8" />
          <rect x="15" y="0" width="3" height="12" rx="0.8" />
        </svg>
        <svg width="26" height="13" viewBox="0 0 26 13" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="12" rx="3.5" fill="none" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor" />
          <rect x="23.5" y="4" width="1.8" height="5" rx="0.9" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/** 灵动岛：订单进行中展开为“实时活动”（骑手与承诺送达时间） */
function Island() {
  const w = useWorld();
  const live = !!w.order && reached(w, 'paid') && !reached(w, 'confirmed');
  const o = w.order;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[11px] z-50 flex justify-center">
      <div className={cx('island flex h-[37px] items-center overflow-hidden rounded-full bg-black text-white', live ? 'w-[192px] justify-between px-1.5' : 'w-[126px]')}>
        {live && o ? (
          <>
            <span className="anim-fade flex items-center gap-1.5">
              <span className="brand-grad flex h-6 w-6 items-center justify-center rounded-full">
                <Icon name={reached(w, 'picked') ? 'bike' : 'bag'} size={13} strokeWidth={2.4} />
              </span>
              <span className="max-w-[104px] truncate text-[11.5px] font-semibold">{reached(w, 'delivered') ? '已送达' : reached(w, 'picked') ? `${RIDER_MAP[o.riderId!].short}送餐中` : reached(w, 'riderAccepted') ? '骑手取餐中' : '商家备餐中'}</span>
            </span>
            <span className="anim-fade num pr-1.5 text-[12.5px] font-bold text-[#ffb067]">{o.promisedAt ? clockLabel(o.promisedAt) : '··'}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** 普通提示（演示中的 App 切换提示显示在演示胶囊里，这里不重复） */
function AppToast() {
  const t = useM((s) => s.toast);
  const active = useFlow((s) => s.active);
  if (!t || active) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-50 flex justify-center" style={{ bottom: 'calc(var(--sab) + 96px)' }}>
      <span key={t.id} className="anim-banner rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-ink-900 shadow-pop ring-1 ring-black/[0.05] backdrop-blur">
        {t.text}
      </span>
    </div>
  );
}
