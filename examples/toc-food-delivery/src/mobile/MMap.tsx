import { useLayoutEffect, useRef, useState } from 'react';
import { CUSTOMER, MERCHANT, type Pt } from '@/domain/catalog';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { reached, type World } from '@/sim/world';
import { BaseMap, LiveLayer, Rain } from '@/components/live/CityMap';
import { riderViews, useAnimTick } from '@/components/live/liveHooks';

/**
 * 手机上的地图：视野随骑手自动缩放（像真实外卖 App 的“自动适配”），骑手沿路线逐帧移动。
 * focus = 'user'：商家、用户与骑手都在视野里；'rider'：骑手与当前目标（商家或用户）。
 */
export function MMap({ w, focus, className, anchor }: { w: World; focus: 'user' | 'rider'; className?: string; anchor?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 393, h: 420 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 393, h: el.clientHeight || 420 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { anim, p } = useAnimTick();
  const views = riderViews(w, anim, p);
  const mine = views.find((v) => v.mine) ?? (focus === 'rider' ? views.find((v) => v.id === 'R01') : undefined);
  const pts: Pt[] = [];
  if (focus === 'user') {
    pts.push(MERCHANT.pos, CUSTOMER.pos);
    if (mine && reached(w, 'riderAccepted')) pts.push(mine.pt);
  } else {
    if (mine) pts.push(mine.pt);
    else pts.push({ x: 140, y: 430 });
    pts.push(reached(w, 'picked') ? CUSTOMER.pos : MERCHANT.pos);
  }
  const view = fit(pts, size.w / Math.max(1, size.h));
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  return (
    <div ref={box} data-flow-anchor={anchor} className={className}>
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="h-full w-full" role="img" aria-label="配送地图（示意）">
        <BaseMap />
        {rain ? <Rain /> : null}
        <LiveLayer w={w} only={focus === 'rider' ? (w.order?.riderId ?? 'R01') : reached(w, 'riderAccepted') ? w.order!.riderId : null} />
      </svg>
    </div>
  );
}

/** 包住所有点的视野，按容器宽高比补齐，至少 420 单位宽 */
function fit(pts: Pt[], aspect: number) {
  const pad = 110;
  let x0 = Math.min(...pts.map((p) => p.x)) - pad;
  let x1 = Math.max(...pts.map((p) => p.x)) + pad;
  let y0 = Math.min(...pts.map((p) => p.y)) - pad;
  let y1 = Math.max(...pts.map((p) => p.y)) + pad;
  if (x1 - x0 < 420) {
    const c = (x0 + x1) / 2;
    x0 = c - 210;
    x1 = c + 210;
  }
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw / bh < aspect) {
    const nw = bh * aspect;
    const c = (x0 + x1) / 2;
    x0 = c - nw / 2;
    x1 = c + nw / 2;
  } else {
    const nh = bw / aspect;
    const c = (y0 + y1) / 2;
    y0 = c - nh / 2;
    y1 = c + nh / 2;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
