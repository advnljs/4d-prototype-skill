import { PageHeader } from '@/components/layout/Shell';
import { Icon } from '@/components/ui/Icon';
import { Button, Segmented } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import { useFlow } from '@/flow/director';
import { SCENARIOS, SCENARIO_MAP, type ScenarioKey } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, resetLive, setScenario, useLiveUi, useScenario, useWorld } from '@/state/live';
import { manualLater, rideToCustomer, rideToStore, useAutoDispatch, useLiveFlow } from '@/state/liveFlow';
import { useRole } from '@/state/session';
import { Phone } from '@/components/live/Phone';
import { UserApp, userScreenOf } from '@/components/live/UserApp';
import { MerchantApp } from '@/components/live/MerchantApp';
import { RiderApp } from '@/components/live/RiderApp';
import { CityMap } from '@/components/live/CityMap';
import { DispatchBoard, EventLog, OrderTimeline, StateStrip } from '@/components/live/Panels';
import { displayClock, useAnimTick } from '@/components/live/liveHooks';
import { USERS } from '@/state/session';

export function LivePage() {
  const w = useWorld();
  const scenario = useScenario();
  const role = useRole();
  const ui = useLiveUi((s) => s);
  const flowActive = useFlow((s) => s.active);
  const { anim, p } = useAnimTick();
  const clock = displayClock(w, anim, p);
  const time = clockLabel(clock).replace('次日 ', '');
  useLiveFlow();

  useAutoDispatch();

  const banner = (to: 'user' | 'merchant' | 'rider') => ui.banners.filter((b) => b.to === to).pop();
  const uScreen = userScreenOf(w, ui.userScreen);
  const sc = SCENARIO_MAP[scenario];

  return (
    <>
      <PageHeader
        title="三端联动：一单外卖的 29 分钟"
        crumbs={['业务现场', '三端联动']}
        desc="用户、商家、骑手三台手机与平台同时在线：订单状态一变，三端同步刷新，地图上的骑手沿路线移动。可以一键播放，也可以直接点手机上的按钮自己走一遍。"
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-raise ring-1 ring-black/[0.05]">
              <Icon name="clock" size={14} className="text-primary-500" />
              <span className="text-xs text-ink-500">业务时钟</span>
              <span className="num text-[15px] font-semibold text-ink-900">{clockLabel(clock)}</span>
            </div>
            <Button icon="refresh" onClick={resetLive} disabled={flowActive} title={flowActive ? '演示中不能重置' : '回到开店前'}>
              重新开始
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-ink-500">情景</span>
          <Segmented<ScenarioKey> size="sm" value={scenario} onChange={(k) => !flowActive && setScenario(k)} items={SCENARIOS.map((s) => ({ value: s.key, label: s.title.split('，')[0].replace('（午高峰）', ''), disabled: flowActive && s.key !== scenario }))} />
          <span className="min-w-0 flex-1 truncate text-xs text-ink-500" title={sc.story}>
            <b className="font-semibold text-ink-700">{sc.tag}</b> · {sc.story}
          </span>
        </div>
      </PageHeader>

      <div className="space-y-5 px-10 pb-8 pt-5">
        <div className="grid grid-cols-[repeat(3,268px)_minmax(440px,1fr)] items-start gap-5">
          <Phone who="user" label={`用户端 · ${USERS.user.name}`} time={time} active={role === 'user'} anchor="phone-user" banner={banner('user')} screenKey={uScreen}>
            <UserApp w={w} screen={uScreen} picked={ui.picked} />
          </Phone>
          <Phone who="merchant" label={`商家端 · ${USERS.merchant.name}`} time={time} dark active={role === 'merchant'} anchor="phone-merchant" banner={banner('merchant')} screenKey={reached(w, 'store') ? 'orders' : 'closed'}>
            <MerchantApp w={w} clock={clock} />
          </Phone>
          <Phone who="rider" label={`骑手端 · ${w.order?.riderId === 'R03' ? '老马' : USERS.rider.name}`} time={time} active={role === 'rider'} anchor="phone-rider" banner={banner('rider')} screenKey={`${w.order?.riderId ?? 'R01'}-${reached(w, 'dispatched') ? (reached(w, 'riderAccepted') ? 'task' : 'offer') : 'hall'}`}>
            <RiderApp w={w} anim={anim} p={p} onArrive={() => rideToStore(manualLater)} onDeliver={() => (anim?.leg === (w.plan?.legs.length ?? 0) - 1 && p >= 1 ? advance('delivered') : rideToCustomer(manualLater, () => advance('delivered')))} />
          </Phone>
          <MapCard w={w} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(400px,0.62fr)] gap-5">
          <div className="space-y-5">
            <StateStrip w={w} />
            <OrderTimeline w={w} clock={clock} />
          </div>
          <EventLog w={w} className="h-[296px]" />
        </div>
      </div>
    </>
  );
}

function MapCard({ w }: { w: World }) {
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  return (
    <section className="flex h-[552px] min-w-0 flex-col overflow-hidden rounded-[22px] bg-surface shadow-raise ring-1 ring-black/[0.04]">
      <div data-flow-anchor="live-map" className="relative min-h-0 flex-1">
        <CityMap w={w} className="h-full w-full" />
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-2xs font-medium text-ink-700 shadow-raise backdrop-blur">滨湖区 · 示意地图（虚构）</span>
          {rain ? (
            <span className="flex items-center gap-1 rounded-full bg-[#334a63] px-2.5 py-1 text-2xs font-semibold text-white shadow-raise">
              <Icon name="rain" size={12} />
              大雨 · 配送费 +2 · 骑手补贴 +3
            </span>
          ) : null}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-full bg-white/90 px-3 py-1 text-2xs text-ink-600 shadow-raise backdrop-blur">
          {(['merchant', 'user', 'rider'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: ACTORS[k].color }} />
              {ACTORS[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="h-[3px] w-4 rounded-full bg-primary-500" />
            配送路线
          </span>
        </div>
      </div>
      <div className="h-[214px] shrink-0 border-t border-black/[0.05] px-4 py-3">
        <DispatchBoard d={w.dispatch} reassigned={w.reassign} w={w} />
      </div>
    </section>
  );
}
