import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { Avatar } from '@/components/live/FoodArt';
import { useAnimTick } from '@/components/live/liveHooks';
import { CUSTOMER, MERCHANT, RIDER_MAP, routeKm } from '@/domain/catalog';
import { WEIGHT_LABEL, capacityForecast, type Weights } from '@/domain/dispatch';
import { deliveryFee } from '@/domain/pricing';
import { riderPay } from '@/domain/settlement';
import { rmb } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, useLiveUi, useWorld } from '@/state/live';
import { manualLater, rideToCustomer, rideToStore } from '@/state/liveFlow';
import { Btn, Pill, Ring, Sheet, useTone } from './kit';
import { MMap } from './MMap';

/** 橙子骑手：绿色主题，地图占满上半屏，底部一个大按钮推进任务 */
export function RiderMobile() {
  useTone('light');
  const w = useWorld();
  const { anim, p } = useAnimTick();
  const scores = useLiveUi((s) => s.scores);
  const riderId = w.order?.riderId ?? 'R01';
  const r = RIDER_MAP[riderId];
  const weather = SCENARIO_MAP[w.scenario].params.weather;
  const extraKm = w.order ? deliveryFee(w.order.pricing.distanceKm, weather).extraKm : 1;
  const pay = riderPay({ extraKm, rain: weather === 'rain', waitMin: w.plan?.waitMin ?? 0 });
  const legs = w.plan?.legs ?? [];
  const legIdx = legs.findIndex((l) => l.riderId === riderId && l.kind === 'toStore');
  const lastLeg = legs.length - 1;
  const stuckLeg = legs.findIndex((l) => l.stuckAt !== undefined);
  const brokeDown = stuckLeg >= 0 && legs[stuckLeg].riderId === riderId && anim?.leg === stuckLeg && p >= 1;
  const toStoreKm = routeKm(r.toStore);
  const riding = !!anim && anim.leg === legIdx && p < 1;
  const leftKm = anim && anim.leg === legIdx ? toStoreKm * (1 - p * (legs[legIdx]?.stuckAt ?? 1)) : toStoreKm;
  const delivering = anim?.leg === lastLeg && p < 1;
  const deliverDone = anim?.leg === lastLeg && p >= 1;
  const hall = !reached(w, 'dispatched') || reached(w, 'refundApplied');
  const online = reached(w, 'online');
  const forecast = capacityForecast(weather);
  const stage = w.stage;

  return (
    <div data-flow-anchor="phone-rider" className="relative flex h-full flex-col bg-[#eef3f1]">
      <header className="relative z-20 shrink-0 bg-gradient-to-b from-[#17b882] to-[#0e9f6e] px-4 pb-4 text-white" style={{ paddingTop: 'calc(var(--sat) + 10px)' }}>
        <div className="flex items-center gap-3">
          <Avatar name={r.short} color="rgb(255 255 255 / 0.25)" size={42} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-bold">{r.short}</div>
            <div className="text-[12.5px] text-white/80">服务分 {r.rating} · 手上 {r.load} 单</div>
          </div>
          <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold', online ? 'bg-white/20' : 'bg-black/15 text-white/80')}>
            <span className={cx('h-2 w-2 rounded-full', online ? 'anim-pulse bg-white' : 'bg-white/50')} />
            {online ? '听单中' : '休息中'}
          </span>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          {[
            ['今日收入', reached(w, 'delivered') && riderId === 'R01' ? `¥${(128.5 + pay.total / 100).toFixed(1)}` : '¥128.5'],
            ['今日完成', reached(w, 'delivered') ? '20 单' : '19 单'],
            ['准时率', '98%'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[14px] bg-white/[0.14] py-2">
              <div className="num text-[17px] font-bold">{v}</div>
              <div className="text-[11px] text-white/75">{k}</div>
            </div>
          ))}
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <MMap w={w} focus="rider" anchor="live-map" className="absolute inset-0" />
        {hall && online ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="relative flex h-40 w-40 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-[#17b882]/25" style={{ animation: 'pulse-ring 2.4s ease-out infinite' }} />
              <span className="absolute inset-8 rounded-full bg-[#17b882]/25" style={{ animation: 'pulse-ring 2.4s ease-out 0.8s infinite' }} />
            </span>
          </div>
        ) : null}
        <div className="absolute inset-x-3 bottom-3 z-10 space-y-2.5" style={{ bottom: 'calc(var(--sab) + 12px)' }}>
          {!online ? (
            <div className="anim-rise rounded-[22px] bg-white/95 p-4 shadow-pop backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-ink-900">午高峰运力预测</span>
                <Pill tone={forecast.gap ? 'warn' : 'green'}>{forecast.window}</Pill>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {(
                  [
                    ['预计订单', forecast.orders],
                    ['需要骑手', forecast.need],
                    ['运力缺口', forecast.gap],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-[14px] bg-[#f1f5f3] py-2">
                    <div className={cx('num text-[18px] font-bold', k === '运力缺口' && forecast.gap ? 'text-amber-600' : 'text-ink-900')}>{v}</div>
                    <div className="text-[11px] text-ink-500">{k}</div>
                  </div>
                ))}
              </div>
              {forecast.gap ? <p className="mt-2.5 text-[13px] font-medium text-amber-700">冲单奖励：高峰每单 +1 元，11:20 前上线可领</p> : null}
              <Btn demo="rider-online" tone="green" icon="bolt" className="mt-3" disabled={!reached(w, 'store')} onClick={() => advance('online')}>
                开始接单
              </Btn>
              <p className="mt-2 text-center text-[11.5px] text-ink-400">{reached(w, 'store') ? '附近商家已营业，上线后系统开始派单' : '商家开店后可上线'}</p>
            </div>
          ) : hall ? (
            <div className="rounded-[22px] bg-white/95 p-4 shadow-pop backdrop-blur">
              {scores && reached(w, 'dispatched') ? null : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold text-ink-900">系统派单中</span>
                    <Pill tone="green">附近 12 单</Pill>
                  </div>
                  <p className="mt-1 text-[13px] leading-[19px] text-ink-600">{r.note}。保持 App 在前台，新订单会自动派给你。</p>
                </>
              )}
            </div>
          ) : brokeDown ? (
            <div className="anim-pop rounded-[22px] bg-white p-4 shadow-pop ring-2 ring-seal-500/40">
              <div className="flex items-center gap-2 text-[16px] font-bold text-seal-600">
                <Icon name="alert" size={19} />
                车辆故障，无法继续
              </div>
              <p className="mt-1 text-[13.5px] leading-[20px] text-ink-600">已上报平台。系统检测到你 3 分钟未移动，正在把订单改派给附近骑手。</p>
            </div>
          ) : !reached(w, 'arrived') ? (
            <Task step={0} title="前往商家取餐" place={MERCHANT.short} addr={MERCHANT.address} km={leftKm} hint={w.order?.promisedAt ? `承诺 ${clockLabel(w.order.promisedAt)} 前送达` : ''}>
              <Btn demo="rider-arrive" tone="green" icon="navigation" disabled={riding} onClick={() => rideToStore(manualLater)}>
                {riding ? '骑行中…' : '到达商家'}
              </Btn>
            </Task>
          ) : !reached(w, 'picked') ? (
            <Task step={1} title={stage === 'ready' ? '商家已出餐' : '已到店，等待出餐'} place={MERCHANT.short} addr="取餐口扫码核对订单号" km={0} hint={stage === 'ready' ? '请扫码取餐' : `预计 ${clockLabel(w.plan!.readyAt)} 出餐`}>
              <Btn demo="rider-pickup" tone="green" icon="scan" disabled={stage !== 'ready'} onClick={() => advance('picked')}>
                扫码取餐
              </Btn>
            </Task>
          ) : !reached(w, 'delivered') ? (
            <Task step={2} title="配送中" place={CUSTOMER.address.replace('滨湖区', '')} addr={`${CUSTOMER.name} ${CUSTOMER.phone}`} km={anim?.leg === lastLeg ? w.dispatch!.deliveryKm * (1 - p) : w.dispatch!.deliveryKm} hint={`承诺 ${clockLabel(w.order!.promisedAt!)} 前送达`}>
              <Btn demo="rider-deliver" tone="green" icon="checkCircle" disabled={delivering} onClick={() => (deliverDone ? advance('delivered') : rideToCustomer(manualLater, () => advance('delivered')))}>
                {delivering ? '配送中…' : '确认送达'}
              </Btn>
            </Task>
          ) : (
            <div className="anim-rise rounded-[22px] bg-white p-4 shadow-pop">
              <div className="flex items-center gap-2 text-[16px] font-bold text-pine-700">
                <Icon name="checkCircle" size={19} />
                {w.late ? `已送达（超时 ${w.late} 分钟）` : '准时送达'}
              </div>
              <div className="num mt-2 text-[32px] font-extrabold text-ink-900">{rmb(pay.total)}</div>
              <div className="mt-1 space-y-1 text-[13.5px] text-ink-600">
                {[
                  ['基础配送费', pay.base],
                  ['超距补贴', pay.distance],
                  ['恶劣天气补贴', pay.rain],
                  ['等餐补贴', pay.wait],
                ]
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k as string} className="flex justify-between">
                      <span>{k}</span>
                      <span className="num">{rmb(v as number)}</span>
                    </div>
                  ))}
              </div>
              <p className="mt-2 text-[12px] text-ink-400">次日随结算单发放</p>
            </div>
          )}
        </div>
      </div>
      <Sheet open={stage === 'dispatched' && riderId === w.dispatch?.chosen}>
        <Offer w={w} pay={pay.total} />
      </Sheet>
    </div>
  );
}

const STEP_LABELS = ['到店', '取餐', '送达'];

function Task({ step, title, place, addr, km, hint, children }: { step: number; title: string; place: string; addr: string; km: number; hint: string; children: React.ReactNode }) {
  return (
    <div className="anim-rise rounded-[22px] bg-white p-4 shadow-pop">
      <div className="mb-3 flex items-center gap-1.5">
        {STEP_LABELS.map((l, i) => (
          <span key={l} className={cx('flex flex-1 items-center justify-center gap-1 rounded-full py-1 text-[12px] font-semibold', i < step ? 'bg-pine-50 text-pine-700' : i === step ? 'bg-[#0e9f6e] text-white' : 'bg-black/[0.04] text-ink-400')}>
            {i < step ? <Icon name="check" size={12} strokeWidth={3} /> : null}
            {l}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-extrabold text-ink-900">{title}</span>
        <span className={cx('num rounded-full px-2.5 py-1 text-[13px] font-bold', km > 0 ? 'bg-[#e8f7f0] text-[#0b7a55]' : 'bg-ink-50 text-ink-500')}>{km > 0 ? `${km.toFixed(1)} km` : '已到达'}</span>
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <Icon name="navigation" size={18} className="mt-0.5 shrink-0 text-[#0e9f6e]" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-ink-900">{place}</div>
          <div className="truncate text-[12.5px] text-ink-400">{addr}</div>
        </div>
      </div>
      {hint ? <div className="mt-2.5 rounded-[12px] bg-[#f2f6f4] px-3 py-2 text-[12.5px] text-ink-600">{hint}</div> : null}
      <div className="mt-3">{children}</div>
    </div>
  );
}

const COLORS: Record<keyof Weights, string> = { distance: '#d1307a', load: '#f08bb6', align: '#7c42c2', rating: '#b9a6dc' };

function Offer({ w, pay }: { w: World; pay: number }) {
  const d = w.dispatch!;
  const me = d.candidates.find((c) => c.riderId === d.chosen)!;
  const rank = d.candidates.filter((c) => !c.excluded).findIndex((c) => c.riderId === d.chosen) + 1;
  return (
    <div className="px-5 pb-5 pt-3">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#e8f7f0] px-3 py-1 text-[13px] font-bold text-[#0b7a55]">系统派单 · 顺路</span>
        <Ring value={0.75} size={48} stroke={4} color="#0e9f6e">
          <span className="num text-[13px] font-bold text-ink-900">12s</span>
        </Ring>
      </div>
      <div className="num mt-2 text-[36px] font-extrabold tracking-tight text-ink-900">{rmb(pay)}</div>
      <ol className="mt-3 space-y-3">
        <li className="flex gap-3">
          <span className="brand-grad mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white">取</span>
          <div className="min-w-0">
            <div className="text-[15.5px] font-bold text-ink-900">{MERCHANT.short}</div>
            <div className="text-[12.5px] text-ink-400">距你 {me.km.toFixed(1)} km · 预计 {clockLabel(d.eta.ready)} 出餐</div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2f6fed] text-[12px] font-bold text-white">送</span>
          <div className="min-w-0">
            <div className="text-[15.5px] font-bold text-ink-900">{CUSTOMER.address.replace('滨湖区', '')}</div>
            <div className="text-[12.5px] text-ink-400">
              配送 {d.deliveryKm.toFixed(1)} km · 承诺 {clockLabel(d.promisedAt)} 前
            </div>
          </div>
        </li>
      </ol>
      <div data-flow-anchor="dispatch-panel" className="mt-4 rounded-[16px] bg-[#fbf3f7] p-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold text-[#a3245f]">为什么派给你</span>
          <span className="num font-bold text-[#a3245f]">
            {me.score.toFixed(2)} · 第 {rank} / {d.candidates.length}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(Object.keys(COLORS) as (keyof Weights)[]).map((k) => (
            <div key={k}>
              <div className="h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full" style={{ width: `${me.parts[k] * 100}%`, background: COLORS[k] }} />
              </div>
              <div className="mt-1 text-[11px] text-ink-500">
                {WEIGHT_LABEL[k]} {me.parts[k].toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Btn demo="rider-accept" tone="green" className="mt-4" onClick={() => advance('riderAccepted')}>
        接单
      </Btn>
    </div>
  );
}
