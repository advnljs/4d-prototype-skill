import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { BrandMark } from '@/components/live/FoodArt';
import { EventLog } from '@/components/live/Panels';
import { useFlow } from '@/flow/director';
import { STEPS } from '@/flow/workflow';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { useScenario, useWorld } from '@/state/live';
import { PhoneOS } from './PhoneOS';
import { mUi } from './mstate';

const DEVICE_W = 419;
const DEVICE_H = 878;

function useViewport() {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return v;
}

/**
 * 手机版入口：
 * - 在手机上（窄屏）全屏运行，可“添加到主屏幕”作为独立 App 打开；
 * - 在电脑上放进一台 iPhone 外框里演示，两侧是说明与平台事件流（讲解用）。
 */
export function MobileRoot() {
  const v = useViewport();
  const framed = v.w >= 720 && v.h >= 600;
  if (!framed)
    return (
      <div className="h-full w-full">
        <PhoneOS framed={false} />
      </div>
    );
  const scale = Math.min(1, (v.h - 40) / DEVICE_H);
  const wide = v.w >= 1360;
  return (
    <div className="relative flex h-full w-full items-center justify-center gap-14 overflow-hidden bg-[radial-gradient(90%_70%_at_50%_0%,#4a2a18_0%,#1b130e_70%)] px-10 text-white">
      <div className="anim-drift pointer-events-none absolute -left-32 top-24 h-[420px] w-[420px] rounded-full bg-[#f25a0f]/20 blur-[110px]" />
      <div className="anim-drift pointer-events-none absolute -right-24 bottom-10 h-[380px] w-[380px] rounded-full bg-[#ff9a3c]/15 blur-[110px]" style={{ animationDelay: '-5s' }} />
      {wide ? <LeftPanel /> : null}
      <div className="relative shrink-0" style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: DEVICE_W, height: DEVICE_H, transform: `scale(${scale})` }}>
          <Device />
        </div>
      </div>
      {wide ? <RightPanel /> : null}
    </div>
  );
}

function Device() {
  return (
    <div className="relative h-full w-full rounded-[66px] bg-gradient-to-b from-[#3a3633] via-[#1a1817] to-[#2c2826] p-[3px] shadow-[0_50px_100px_-30px_rgb(0_0_0/0.85),0_0_0_1px_rgb(255_255_255/0.06)]">
      <span className="absolute -left-[3px] top-[150px] h-[34px] w-[4px] rounded-l bg-[#2c2826]" />
      <span className="absolute -left-[3px] top-[210px] h-[62px] w-[4px] rounded-l bg-[#2c2826]" />
      <span className="absolute -left-[3px] top-[284px] h-[62px] w-[4px] rounded-l bg-[#2c2826]" />
      <span className="absolute -right-[3px] top-[236px] h-[96px] w-[4px] rounded-r bg-[#2c2826]" />
      <div className="h-full w-full rounded-[63px] bg-black p-[10px]">
        <div className="relative h-[852px] w-[393px] overflow-hidden rounded-[54px]" style={{ transform: 'translateZ(0)' }}>
          <PhoneOS framed />
        </div>
      </div>
    </div>
  );
}

function LeftPanel() {
  const scenario = SCENARIO_MAP[useScenario()];
  const active = useFlow((s) => s.active);
  return (
    <aside className="w-[360px] shrink-0">
      <div className="flex items-center gap-3">
        <BrandMark size={44} />
        <div>
          <div className="text-[22px] font-bold tracking-tight">橙子到家 · 手机版</div>
          <div className="text-[13px] text-white/55">4D 原型 · toC 示例 · 数据全部虚构</div>
        </div>
      </div>
      <p className="mt-6 text-[15px] leading-[26px] text-white/75">一台手机里装着四个 App：用户点餐、商家接单出餐、骑手取送、运营发券与结算。一键演示时，手机会随着业务在四个 App 之间自动切换，手指触点代替人完成操作。</p>
      <ul className="mt-6 space-y-3 text-[14px] text-white/80">
        {[
          ['route', `${STEPS.length} 个环节的依赖图，任一环节可跳转、重放`],
          ['clock', '业务时钟 11:52 → 12:20 → 次日结算，0.25×–2× 调速'],
          ['layers', '演示面板里看子步骤、依赖图、数据格式与平台事件'],
          ['phone', '在手机浏览器打开同一地址即可全屏运行，可添加到主屏幕'],
        ].map(([i, t]) => (
          <li key={t} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10">
              <Icon name={i as 'route'} size={15} />
            </span>
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" disabled={active} onClick={() => mUi.set({ start: true })} className="m-press brand-grad flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-bold shadow-[0_14px_30px_-12px_rgb(242_90_15/0.9)] disabled:opacity-50">
          <Icon name="play" size={17} strokeWidth={2.4} />
          一键演示
        </button>
        <a href="./index.html#/live" className="m-press flex h-12 items-center gap-2 rounded-full bg-white/10 px-5 text-[14.5px] font-semibold ring-1 ring-white/10">
          <Icon name="monitor" size={17} />
          PC 版三端联动
        </a>
      </div>
      <div className="mt-6 rounded-[18px] bg-white/[0.06] px-4 py-3 text-[13px] leading-[20px] text-white/65 ring-1 ring-white/[0.06]">
        <span className="font-semibold text-white/85">当前情景：</span>
        {scenario.title}。{scenario.story}
      </div>
    </aside>
  );
}

function RightPanel() {
  const w = useWorld();
  return (
    <aside className="w-[400px] shrink-0 text-ink-900">
      <EventLog w={w} className="h-[640px]" />
    </aside>
  );
}
