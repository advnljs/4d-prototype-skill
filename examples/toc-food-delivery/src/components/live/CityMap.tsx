import { memo } from 'react';
import { CUSTOMER, MERCHANT, RIDER_MAP, ROUTE_STORE_TO_CUSTOMER, STREETS, type Pt } from '@/domain/catalog';
import { hash } from '@/lib/format';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { clockLabel, reached, type World } from '@/sim/world';
import { useLiveUi } from '@/state/live';
import type { HeatCell } from '@/domain/seed';
import { riderViews, useAnimTick, type RiderView } from './liveHooks';

// 街区网格向四周延伸：手机竖屏视野、宽屏外框都不会露出空白
const XS = [-580, -340, -100, 140, 380, 620, 860, 1100, 1340, 1580];
const YS = [-460, -270, -80, 110, 300, 490, 680, 870, 1060];
const EXTRA_V = [-340, -100, 1100, 1340];
const EXTRA_H = [-270, -80, 680, 870];
const ICON_PATHS: Record<string, string[]> = {
  bike: ['M5.5 18.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M18.5 18.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M5.5 15.5 9 8h4l3 7.5', 'M12 15.5h-3.5', 'M14.5 5.5h2l2 10'],
  store: ['M4 9.5 5.5 4h13L20 9.5', 'M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0', 'M5.5 11.5V20h13v-8.5', 'M10 20v-5h4v5'],
  home: ['M4 11 12 4l8 7', 'M6 9.5V20h12V9.5', 'M10 20v-5.5h4V20'],
};

function Glyph({ name, x, y, size }: { name: keyof typeof ICON_PATHS; x: number; y: number; size: number }) {
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const pathD = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');

/** 静态底图：街区、公园与湖、街道与路名 */
export const BaseMap = memo(function BaseMap() {
  const blocks: { x: number; y: number; w: number; h: number; park: boolean; key: string }[] = [];
  for (let i = 0; i < XS.length - 1; i++)
    for (let j = 0; j < YS.length - 1; j++) {
      const x = XS[i] + 16;
      const y = YS[j] + 16;
      const w = XS[i + 1] - XS[i] - 32;
      const h = YS[j + 1] - YS[j] - 32;
      blocks.push({ x, y, w, h, park: XS[i] === 620 && YS[j] === 300, key: `${i}-${j}` });
    }
  return (
    <g>
      <rect x="-800" y="-700" width="2600" height="2000" fill="#efe9e1" />
      {blocks.map((b) =>
        b.park ? (
          <g key={b.key}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="18" fill="#d6ead0" />
            <ellipse cx={b.x + b.w * 0.55} cy={b.y + b.h * 0.52} rx={b.w * 0.3} ry={b.h * 0.28} fill="#bfe0ec" />
            <text x={b.x + b.w * 0.55} y={b.y + b.h * 0.55} textAnchor="middle" fontSize="19" fill="#4f8399" fontWeight="600">
              镜湖公园
            </text>
          </g>
        ) : (
          <g key={b.key}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="18" fill="#e6dfd5" />
            {Array.from({ length: 4 }, (_, k) => {
              const h = hash(`${b.key}-${k}`);
              const bw = 30 + (h % 40);
              const bh = 22 + ((h >> 6) % 30);
              const bx = b.x + 14 + ((h >> 12) % Math.max(1, b.w - bw - 28));
              const by = b.y + 14 + ((h >> 18) % Math.max(1, b.h - bh - 28));
              return <rect key={k} x={bx} y={by} width={bw} height={bh} rx="6" fill="#ddd4c8" />;
            })}
          </g>
        ),
      )}
      {EXTRA_V.map((x) => (
        <g key={`v${x}`}>
          <line x1={x} y1={-700} x2={x} y2={1300} stroke="#ddd3c7" strokeWidth={26} />
          <line x1={x} y1={-700} x2={x} y2={1300} stroke="#fbf9f6" strokeWidth={21} />
        </g>
      ))}
      {EXTRA_H.map((y) => (
        <g key={`h${y}`}>
          <line x1={-800} y1={y} x2={1800} y2={y} stroke="#ddd3c7" strokeWidth={26} />
          <line x1={-800} y1={y} x2={1800} y2={y} stroke="#fbf9f6" strokeWidth={21} />
        </g>
      ))}
      {STREETS.map((s) => (
        <g key={s.name}>
          <line x1={s.from.y === s.to.y ? -800 : s.from.x} y1={s.from.y === s.to.y ? s.from.y : -700} x2={s.from.y === s.to.y ? 1800 : s.to.x} y2={s.from.y === s.to.y ? s.to.y : 1300} stroke="#ddd3c7" strokeWidth={s.major ? 32 : 26} />
          <line x1={s.from.y === s.to.y ? -800 : s.from.x} y1={s.from.y === s.to.y ? s.from.y : -700} x2={s.from.y === s.to.y ? 1800 : s.to.x} y2={s.from.y === s.to.y ? s.to.y : 1300} stroke="#fbf9f6" strokeWidth={s.major ? 27 : 21} />
          {s.major ? <line x1={s.from.y === s.to.y ? -800 : s.from.x} y1={s.from.y === s.to.y ? s.from.y : -700} x2={s.from.y === s.to.y ? 1800 : s.to.x} y2={s.from.y === s.to.y ? s.to.y : 1300} stroke="#eadfcf" strokeWidth={1.4} strokeDasharray="14 12" /> : null}
        </g>
      ))}
      {STREETS.map((s) => {
        const horizontal = s.from.y === s.to.y;
        const x = horizontal ? (s.name === '梧桐路' ? 240 : s.name === '云杉大道' ? 500 : 300) : s.from.x;
        const y = horizontal ? s.from.y : s.name === '樟树街' ? 410 : s.name === '枫林街' ? 205 : 560;
        return (
          <text key={`t-${s.name}`} x={x} y={y + 6} transform={horizontal ? undefined : `rotate(90 ${x} ${y})`} textAnchor="middle" fontSize="16" fill="#8f8378" letterSpacing="2">
            {s.name}
          </text>
        );
      })}
    </g>
  );
});

export function Pins({ compact }: { compact?: boolean }) {
  const s = compact ? 1.25 : 1.3;
  return (
    <g>
      <g transform={`translate(${MERCHANT.pos.x} ${MERCHANT.pos.y - 26 * s}) scale(${s})`}>
        <path d="M0 24 C -6 14 -16 10 -16 0 a16 16 0 0 1 32 0 c0 10 -10 14 -16 24z" fill="#e25507" stroke="#fff" strokeWidth="2.5" />
        <Glyph name="store" x={0} y={-1} size={18} />
        {!compact ? (
          <g transform="translate(0 -30)">
            <rect x="-58" y="-14" width="116" height="26" rx="13" fill="#fff" stroke="#f3d4bf" />
            <text y="5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#9c3a08">
              张记手擀面
            </text>
          </g>
        ) : null}
      </g>
      <g transform={`translate(${CUSTOMER.pos.x} ${CUSTOMER.pos.y - 26 * s}) scale(${s})`}>
        <path d="M0 24 C -6 14 -16 10 -16 0 a16 16 0 0 1 32 0 c0 10 -10 14 -16 24z" fill="#2f6fed" stroke="#fff" strokeWidth="2.5" />
        <Glyph name="home" x={0} y={-1} size={17} />
        {!compact ? (
          <g transform="translate(-6 -30)">
            <rect x="-66" y="-14" width="132" height="26" rx="13" fill="#fff" stroke="#cfdcf8" />
            <text y="5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1e4fb5">
              云杉公寓 3 栋
            </text>
          </g>
        ) : null}
      </g>
    </g>
  );
}

const MOOD_FILL: Record<RiderView['mood'], string> = {
  idle: '#8fa69c',
  candidate: '#8fa69c',
  moving: '#0e9f6e',
  waiting: '#0e9f6e',
  delivering: '#0e9f6e',
  done: '#0e9f6e',
  stuck: '#dc2a33',
  off: '#a9b8b1',
};

function RiderMarker({ v, score, best, compact }: { v: RiderView; score?: number; best?: boolean; compact?: boolean }) {
  const r = RIDER_MAP[v.id];
  const fill = v.mine || v.mood === 'stuck' ? MOOD_FILL[v.mood === 'candidate' || v.mood === 'idle' ? 'moving' : v.mood] : MOOD_FILL.idle;
  const k = compact ? 1.5 : 1.25;
  return (
    <g transform={`translate(${v.pt.x} ${v.pt.y}) scale(${k})`} opacity={v.mood === 'off' ? 0.55 : 1}>
      {v.mine && (v.mood === 'moving' || v.mood === 'delivering') ? <circle r="15" fill={fill} opacity="0.35" style={{ animation: 'pulse-ring 1.6s ease-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }} /> : null}
      {v.mood === 'stuck' ? <circle r="15" fill="#dc2a33" opacity="0.4" style={{ animation: 'pulse-ring 1.2s ease-out infinite', transformBox: 'fill-box', transformOrigin: 'center' }} /> : null}
      <circle r="15" fill={fill} stroke="#fff" strokeWidth="3" />
      <Glyph name="bike" x={0} y={0} size={17} />
      {!compact ? (
        <g transform="translate(0 30)">
          <rect x={-26} y={-12} width={52} height={22} rx={11} fill="#fff" stroke={v.mine ? '#9ad9bf' : '#e3ddd6'} />
          <text y="4.5" textAnchor="middle" fontSize="13.5" fontWeight={v.mine ? 700 : 600} fill={v.mood === 'stuck' ? '#c01d26' : v.mine ? '#0b7a55' : '#6b625b'}>
            {r.short}
          </text>
        </g>
      ) : null}
      {score !== undefined && !compact ? (
        <g transform="translate(0 -32)" className="anim-pop" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
          <rect x={-28} y={-14} width={56} height={24} rx={12} fill={best ? '#d1307a' : '#fff'} stroke={best ? '#d1307a' : '#f0c5d8'} />
          <text y="4" textAnchor="middle" fontSize="14" fontWeight="700" fill={best ? '#fff' : '#a3245f'}>
            {score.toFixed(2)}
          </text>
        </g>
      ) : null}
      {v.mood === 'stuck' && !compact ? (
        <g transform="translate(0 -32)">
          <rect x={-34} y={-13} width={68} height={22} rx={11} fill="#dc2a33" />
          <text y="3" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
            车辆故障
          </text>
        </g>
      ) : null}
    </g>
  );
}

/** 动态图层：路线、召回雷达、骑手、ETA 气泡（随动画逐帧更新） */
/** only：只显示这一名骑手（null = 不显示任何骑手；undefined = 按 compact 规则） */
export function LiveLayer({ w, compact, only }: { w: World; compact?: boolean; only?: string | null }) {
  const { anim, p } = useAnimTick();
  const scores = useLiveUi((s) => s.scores);
  const radar = useLiveUi((s) => s.radar);
  const views = riderViews(w, anim, p);
  const plan = w.plan;
  const cur = w.order?.riderId ?? null;
  const d = w.dispatch;
  const showScores = !compact && scores && !!d && !reached(w, 'riderAccepted');
  const curLeg = plan ? plan.legs.filter((l) => l.riderId === cur && l.kind === 'toStore').pop() : null;
  const delivering = reached(w, 'picked');
  return (
    <g>
      {radar && !compact ? (
        <circle key={radar} cx={MERCHANT.pos.x} cy={MERCHANT.pos.y} r="600" fill="rgb(209 48 122 / 0.08)" stroke="#d1307a" strokeWidth="2" style={{ animation: 'radar 1.8s ease-out both', transformBox: 'view-box', transformOrigin: `${MERCHANT.pos.x}px ${MERCHANT.pos.y}px` }} />
      ) : null}
      {/* 派单后、接单前：选中骑手到商家的连线 */}
      {d && !plan ? <path d={pathD(RIDER_MAP[d.chosen].toStore)} fill="none" stroke="#d1307a" strokeWidth="4" strokeDasharray="8 8" opacity="0.7" /> : null}
      {/* 取餐路线 */}
      {curLeg && !reached(w, 'arrived') ? <path d={pathD(curLeg.path)} fill="none" stroke="#0e9f6e" strokeWidth={compact ? 9 : 6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 12" opacity="0.85" /> : null}
      {/* 配送路线 */}
      {d ? (
        <g opacity={delivering ? 1 : 0.4}>
          <path d={pathD(ROUTE_STORE_TO_CUSTOMER)} fill="none" stroke="#ffb37a" strokeWidth={compact ? 12 : 9} strokeLinecap="round" strokeLinejoin="round" />
          <path d={pathD(ROUTE_STORE_TO_CUSTOMER)} fill="none" stroke="#e25507" strokeWidth={compact ? 5 : 3.5} strokeLinecap="round" strokeLinejoin="round" className={delivering && !reached(w, 'delivered') ? 'route-live' : undefined} />
        </g>
      ) : null}
      <Pins compact={compact} />
      {views
        .filter((v) => (only !== undefined ? v.id === only : !compact || v.mine))
        .map((v) => (
          <RiderMarker key={v.id} v={v} compact={compact} score={showScores ? d!.candidates.find((c) => c.riderId === v.id)?.score : undefined} best={showScores && d!.chosen === v.id} />
        ))}
      {w.order?.promisedAt && !compact ? (
        <g transform={`translate(${CUSTOMER.pos.x - 60} ${CUSTOMER.pos.y + 50})`}>
          <rect x="-100" y="-17" width="200" height="32" rx="16" fill={reached(w, 'delivered') ? (w.late ? '#d07a00' : '#1c8c50') : '#1f1a17'} />
          <text y="5" textAnchor="middle" fontSize="15.5" fontWeight="700" fill="#fff">
            {reached(w, 'delivered') ? `${clockLabel(w.order.deliveredAt!)} 已送达${w.late ? ` · 超时 ${w.late} 分` : ''}` : `承诺 ${clockLabel(w.order.promisedAt)} 前送达`}
          </text>
        </g>
      ) : null}
    </g>
  );
}

export function Rain() {
  return (
    <g pointerEvents="none">
      <defs>
        <pattern id="rain-p" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
          <line x1="6" y1="0" x2="6" y2="12" stroke="#5d7a99" strokeWidth="1.4" opacity="0.35" />
        </pattern>
      </defs>
      <rect x="-800" y="-700" width="2600" height="2000" fill="url(#rain-p)" />
      <rect x="-800" y="-700" width="2600" height="2000" fill="#7d93ab" opacity="0.08" />
    </g>
  );
}

export function Heat({ cells }: { cells: HeatCell[] }) {
  const max = Math.max(...cells.map((c) => c.v));
  return (
    <g pointerEvents="none">
      {cells.map((c) => (
        <rect key={`${c.c}-${c.r}`} x={c.c * 100 + 2} y={c.r * 100 + 2} width="96" height="96" rx="14" fill="#f25a0f" opacity={(c.v / max) * 0.55} />
      ))}
    </g>
  );
}

/** 风格化城市地图（非真实地图服务） */
export function CityMap({ w, heat, className }: { w: World; heat?: HeatCell[]; className?: string }) {
  const rain = SCENARIO_MAP[w.scenario].params.weather === 'rain';
  return (
    <svg viewBox="0 0 1000 600" className={className} role="img" aria-label="配送示意地图：商家、用户、骑手位置与路线">
      <BaseMap />
      {heat ? <Heat cells={heat} /> : null}
      {rain && !heat ? <Rain /> : null}
      {heat ? <Pins /> : <LiveLayer w={w} />}
    </svg>
  );
}

/** 用户端订单页里的小地图：只看商家、用户与自己的骑手 */
export function MiniMap({ w }: { w: World }) {
  return (
    <svg viewBox="330 20 620 330" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img" aria-label="骑手位置">
      <BaseMap />
      <LiveLayer w={w} compact />
    </svg>
  );
}
