import { Icon } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { CUSTOMER, MERCHANT, RIDER_MAP, routeKm } from '@/domain/catalog';
import { capacityForecast } from '@/domain/dispatch';
import { deliveryFee } from '@/domain/pricing';
import { riderPay } from '@/domain/settlement';
import { rmb } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, type Anim } from '@/state/live';
import { AppButton } from './Phone';
import { Avatar } from './FoodArt';

/** 骑手 App：绿色主题，大按钮、少文字，适合骑行中操作 */
export function RiderApp({ w, anim, p, onArrive, onDeliver }: { w: World; anim: Anim | null; p: number; onArrive: () => void; onDeliver: () => void }) {
  const riderId = w.order?.riderId ?? 'R01';
  const r = RIDER_MAP[riderId];
  const weather = SCENARIO_MAP[w.scenario].params.weather;
  const extraKm = w.order ? deliveryFee(w.order.pricing.distanceKm, weather).extraKm : 1;
  const pay = riderPay({ extraKm, rain: weather === 'rain', waitMin: w.plan?.waitMin ?? 0 });
  const legIdx = w.plan?.legs.findIndex((l) => l.riderId === riderId && l.kind === 'toStore') ?? -1;
  const lastLeg = (w.plan?.legs.length ?? 0) - 1;
  const stuckLeg = w.plan?.legs.find((l) => l.stuckAt !== undefined);
  const brokeDown = !!stuckLeg && stuckLeg.riderId === riderId && anim?.leg === w.plan!.legs.indexOf(stuckLeg) && p >= 1;
  const toStoreKm = routeKm(r.toStore);
  const leftKm = anim && anim.leg === legIdx ? toStoreKm * (1 - p * (w.plan!.legs[legIdx].stuckAt ?? 1)) : toStoreKm;
  const deliverDone = anim?.leg === lastLeg && p >= 1;
  const stage = w.stage;
  const online = reached(w, 'online');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="bg-gradient-to-b from-[#16b37f] to-[#0e9f6e] px-4 pb-4 pt-1 text-white">
        <div className="flex items-center gap-2">
          <Avatar name={r.short} color="rgb(255 255 255 / 0.25)" size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-[13.5px] font-semibold">{r.short}</div>
            <div className="text-[10.5px] text-white/75">服务分 {r.rating} · 手上 {r.load} 单</div>
          </div>
          <span className={cx('flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', online ? 'bg-white/20' : 'bg-black/15 text-white/80')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', online ? 'anim-pulse bg-white' : 'bg-white/50')} />
            {online ? '听单中' : '休息中'}
          </span>
        </div>
      </div>
      <div className="-mt-2 min-h-0 flex-1 space-y-2 overflow-hidden rounded-t-[18px] bg-[#f4f6f5] px-3 pt-3">
        {!online ? (
          <Offline w={w} />
        ) : !reached(w, 'dispatched') || reached(w, 'refundApplied') ? (
          <Hall riderNote={r.note} />
        ) : stage === 'dispatched' ? (
          <Offer w={w} pay={pay.total} />
        ) : brokeDown ? (
          <div className="anim-pop rounded-[14px] bg-white p-3 ring-2 ring-seal-500/40">
            <div className="flex items-center gap-1.5 text-[13px] font-bold text-seal-600">
              <Icon name="alert" size={15} />
              车辆故障，无法继续
            </div>
            <p className="mt-1 text-[11.5px] leading-[16px] text-ink-600">已上报平台。系统检测到你 3 分钟未移动，正在把订单改派给附近骑手。</p>
          </div>
        ) : !reached(w, 'arrived') ? (
          <Task title="前往商家取餐" place={MERCHANT.short} addr={MERCHANT.address} km={leftKm} hint={w.order?.promisedAt ? `承诺 ${clockLabel(w.order.promisedAt)} 前送达` : ''}>
            <AppButton demo="rider-arrive" tone="rider" onClick={onArrive} disabled={!!anim && anim.leg === legIdx && p < 1}>
              {anim && anim.leg === legIdx && p < 1 ? '骑行中…' : '到达商家'}
            </AppButton>
          </Task>
        ) : !reached(w, 'picked') ? (
          <Task title={stage === 'ready' ? '商家已出餐' : '已到店，等待出餐'} place={MERCHANT.short} addr="取餐口扫码核对订单号" km={0} hint={stage === 'ready' ? '请扫码取餐' : `预计 ${clockLabel(w.plan!.readyAt)} 出餐`}>
            <AppButton demo="rider-pickup" tone="rider" onClick={() => advance('picked')} disabled={stage !== 'ready'}>
              <Icon name="scan" size={16} strokeWidth={2} />
              扫码取餐
            </AppButton>
          </Task>
        ) : !reached(w, 'delivered') ? (
          <Task title="配送中" place={CUSTOMER.address.replace('滨湖区', '')} addr={`${CUSTOMER.name} ${CUSTOMER.phone}`} km={anim?.leg === lastLeg ? w.dispatch!.deliveryKm * (1 - p) : w.dispatch!.deliveryKm} hint={`承诺 ${clockLabel(w.order!.promisedAt!)} 前送达`}>
            <AppButton demo="rider-deliver" tone="rider" onClick={onDeliver} disabled={!!anim && anim.leg === lastLeg && !deliverDone}>
              {anim?.leg === lastLeg && !deliverDone ? '配送中…' : '确认送达'}
            </AppButton>
          </Task>
        ) : (
          <div className="anim-rise space-y-2">
            <div className="rounded-[14px] bg-white p-3">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-pine-700">
                <Icon name="checkCircle" size={15} />
                {w.late ? `已送达（超时 ${w.late} 分钟）` : '准时送达'}
              </div>
              <div className="num mt-2 text-[24px] font-bold text-ink-900">{rmb(pay.total)}</div>
              <ul className="mt-1 space-y-0.5 text-[11.5px] text-ink-600">
                <li className="flex justify-between">
                  <span>基础配送费</span>
                  <span className="num">{rmb(pay.base)}</span>
                </li>
                {pay.distance ? (
                  <li className="flex justify-between">
                    <span>超距补贴</span>
                    <span className="num">{rmb(pay.distance)}</span>
                  </li>
                ) : null}
                {pay.rain ? (
                  <li className="flex justify-between">
                    <span>恶劣天气补贴</span>
                    <span className="num">{rmb(pay.rain)}</span>
                  </li>
                ) : null}
                {pay.wait ? (
                  <li className="flex justify-between">
                    <span>等餐补贴</span>
                    <span className="num">{rmb(pay.wait)}</span>
                  </li>
                ) : null}
              </ul>
              <p className="mt-1.5 text-[10.5px] text-ink-400">次日随结算单发放</p>
            </div>
            <div className="rounded-full bg-white py-2 text-center text-[12px] text-pine-700 ring-1 ring-pine-100">继续听单</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 上线前：午高峰运力预测与冲单奖励，“开始接单”上线（商家开店后可用） */
function Offline({ w }: { w: World }) {
  const f = capacityForecast(SCENARIO_MAP[w.scenario].params.weather);
  const open = reached(w, 'store');
  return (
    <div className="anim-rise space-y-2">
      <div className="rounded-[14px] bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-bold text-ink-900">午高峰运力预测</span>
          <span className="num text-[10.5px] text-ink-400">{f.window}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          {(
            [
              ['预计订单', f.orders],
              ['需要骑手', f.need],
              ['缺口', f.gap],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-[10px] bg-[#f4f6f5] py-1.5">
              <div className={cx('num text-[15px] font-bold', k === '缺口' && f.gap ? 'text-amber-600' : 'text-ink-900')}>{v}</div>
              <div className="text-[10px] text-ink-400">{k}</div>
            </div>
          ))}
        </div>
        {f.gap ? <div className="mt-2 rounded-[8px] bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">冲单奖励：高峰每单 +1 元</div> : null}
      </div>
      <AppButton demo="rider-online" tone="rider" onClick={() => advance('online')} disabled={!open}>
        <Icon name="bolt" size={16} strokeWidth={2} />
        开始接单
      </AppButton>
      <p className="text-center text-[10.5px] text-ink-400">{open ? '附近商家已营业，上线后系统开始派单' : '商家开店后可上线'}</p>
    </div>
  );
}

function Hall({ riderNote }: { riderNote: string }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {[
          ['今日收入', '¥128.5'],
          ['今日完成', '19 单'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-white px-3 py-2">
            <div className="num text-[16px] font-bold text-ink-900">{v}</div>
            <div className="text-[10.5px] text-ink-400">{k}</div>
          </div>
        ))}
      </div>
      <div className="rounded-[12px] bg-white px-3 py-2 text-[11.5px] text-ink-600">
        <div className="mb-1 text-[12px] font-semibold text-ink-900">手上订单</div>
        {riderNote}
      </div>
      <div className="flex flex-col items-center gap-2 pt-4 text-center">
        <span className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-[#16b37f]/30" style={{ animation: 'pulse-ring 2s ease-out infinite' }} />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-[#16b37f] to-[#0e9f6e] text-white">
            <Icon name="bike" size={19} strokeWidth={2} />
          </span>
        </span>
        <span className="text-[11.5px] text-ink-500">系统派单中，保持 App 在前台</span>
      </div>
    </div>
  );
}

function Offer({ w, pay }: { w: World; pay: number }) {
  const d = w.dispatch!;
  const me = d.candidates.find((c) => c.riderId === d.chosen)!;
  return (
    <div className="anim-sheet rounded-[16px] bg-white p-3 shadow-[0_10px_30px_-12px_rgb(0_0_0/0.35)] ring-2 ring-[#16b37f]/50">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#e8f7f0] px-2 py-0.5 text-[11px] font-semibold text-[#0b7a55]">系统派单 · 顺路</span>
        <span className="relative flex h-9 w-9 items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5ece9" strokeWidth="3" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="#0e9f6e" strokeWidth="3" strokeDasharray="94.2" strokeDashoffset="24" strokeLinecap="round" />
          </svg>
          <span className="num text-[11px] font-bold text-ink-900">12s</span>
        </span>
      </div>
      <div className="num mt-1 text-[22px] font-bold text-ink-900">{rmb(pay)}</div>
      <ol className="mt-2 space-y-2 text-[12px]">
        <li className="flex gap-2">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary-500 text-[10px] font-bold text-white">取</span>
          <div className="min-w-0 leading-tight">
            <div className="font-semibold text-ink-900">{MERCHANT.short}</div>
            <div className="text-[10.5px] text-ink-400">距你 {me.km.toFixed(1)} km</div>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2f6fed] text-[10px] font-bold text-white">送</span>
          <div className="min-w-0 leading-tight">
            <div className="font-semibold text-ink-900">{CUSTOMER.address.replace('滨湖区', '')}</div>
            <div className="text-[10.5px] text-ink-400">配送 {d.deliveryKm.toFixed(1)} km · 承诺 {clockLabel(d.promisedAt)} 前</div>
          </div>
        </li>
      </ol>
      <AppButton demo="rider-accept" tone="rider" className="mt-3" onClick={() => advance('riderAccepted')}>
        接单
      </AppButton>
    </div>
  );
}

function Task({ title, place, addr, km, hint, children }: { title: string; place: string; addr: string; km: number; hint: string; children: React.ReactNode }) {
  return (
    <div className="anim-rise space-y-2">
      <div className="rounded-[14px] bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13.5px] font-bold text-ink-900">{title}</span>
          <span className={cx('num rounded-full px-2 py-0.5 text-[11px] font-semibold', km > 0 ? 'bg-[#e8f7f0] text-[#0b7a55]' : 'bg-ink-50 text-ink-500')}>{km > 0 ? `${km.toFixed(1)} km` : '已到达'}</span>
        </div>
        <div className="mt-2 flex items-start gap-2">
          <Icon name="navigation" size={15} className="mt-0.5 shrink-0 text-[#0e9f6e]" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[12.5px] font-semibold text-ink-900">{place}</div>
            <div className="mt-0.5 truncate text-[11px] text-ink-400">{addr}</div>
          </div>
        </div>
        {hint ? <div className="mt-2 rounded-[8px] bg-[#f4f6f5] px-2 py-1 text-[11px] text-ink-600">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}
