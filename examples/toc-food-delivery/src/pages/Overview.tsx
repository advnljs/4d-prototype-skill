import { useMemo } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, cx } from '@/components/ui/primitives';
import { ActorChip } from '@/components/flow/ActorChip';
import { FoodArt } from '@/components/live/FoodArt';
import { WEIGHT_LABEL, DEFAULT_WEIGHTS } from '@/domain/dispatch';
import { STATUS_LABEL, MAIN_PATH } from '@/domain/orderMachine';
import { ACTOR_ORDER } from '@/flow/actors';
import { goToStep, openFlowStart, startFlow, useFlow } from '@/flow/director';
import { PHASES, STEPS, STEP_INDEX } from '@/flow/workflow';
import { rmb } from '@/lib/format';
import { navigate } from '@/lib/router';
import { SCENARIOS, type ScenarioKey } from '@/sim/scenarios';
import { clockLabel, runScenario } from '@/sim/world';
import { setScenario, useScenario } from '@/state/live';

export function Overview() {
  const scenario = useScenario();
  const active = useFlow((s) => s.active);
  const w = useMemo(() => runScenario('standard'), []);
  const l = w.settle!.line;
  const o = w.order!;
  const play = (k: ScenarioKey) => {
    if (active) return;
    setScenario(k);
    void startFlow({ mode: 'auto', reset: true });
  };
  return (
    <div className="pb-10">
      {/* 首屏。theme-fixed:start —— 深色横幅在浅色、深色下都保持深色，只随配色换色调 */}
      <section className="relative mx-10 mt-7 overflow-hidden rounded-[28px] bg-[color-mix(in_oklab,var(--color-primary-500)_14%,#110d0b)] px-12 py-11 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary-500 opacity-35 blur-[90px]" />
        <div className="pointer-events-none absolute bottom-[-140px] left-[30%] h-[300px] w-[300px] rounded-full bg-primary-400 opacity-20 blur-[90px]" />
        <div className="relative grid grid-cols-12 items-center gap-10">
          <div className="col-span-7">
            <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[color-mix(in_oklab,var(--color-primary-400)_45%,white)] ring-1 ring-inset ring-white/15">4D 原型 · toC 示例 · 数据全部虚构</span>
            <h1 className="mt-4 text-[44px] font-bold leading-[1.12] tracking-[-0.03em]">
              一单外卖的
              <span className="bg-gradient-to-r from-[color-mix(in_oklab,var(--color-primary-400)_70%,white)] to-primary-400 bg-clip-text text-transparent"> 29 分钟</span>
            </h1>
            <p className="mt-4 max-w-[600px] text-[15px] leading-relaxed text-white/75">
              虚构的即时配送平台“橙子到家”：骑手上线、用户下单、商家接单出餐与智能调度派骑手并行、骑手取送、次日对账结算与打款、售后退款下期冲减。三台手机与平台同屏联动，按依赖图一键播放，随时暂停、调速、跳到任一环节，看每一步的数据长什么样、怎么变。
            </p>
            <div className="mt-7 flex items-center gap-3">
              <Button size="lg" variant="primary" icon="play" onClick={openFlowStart} disabled={active}>
                一键运行完整流程
              </Button>
              <Button size="lg" icon="bike" onClick={() => navigate('/live')} className="bg-surface/10 text-white hover:bg-surface/15">
                打开三端联动
              </Button>
              <a href="./app.html" className="inline-flex h-11 items-center gap-2 rounded-full bg-surface/10 px-6 text-[15px] font-medium text-white transition-colors hover:bg-surface/15">
                <Icon name="phone" size={16} />
                手机版 App
              </a>
            </div>
            <dl className="mt-8 flex gap-8">
              {[
                [String(STEPS.length), '个环节'],
                ['8', '类操作方'],
                [String(SCENARIOS.length), '个情景'],
                ['12', '种数据对象'],
              ].map(([n, k]) => (
                <div key={k}>
                  <dt className="num text-[26px] font-bold">{n}</dt>
                  <dd className="text-xs text-white/60">{k}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="col-span-5">
            <HeroArt />
          </div>
        </div>
      </section>
      {/* theme-fixed:end */}

      {/* 五分钟读懂 */}
      <section className="mx-10 mt-9">
        <h2 className="text-[20px] font-bold text-ink-900">五分钟读懂这门生意</h2>
        <p className="mt-1 text-sm text-ink-500">标准单（午高峰）的真实执行结果：{o.pricing.lines.map((x) => `${x.name}×${x.qty}`).join('、')}，实付 {rmb(o.pricing.payable)}。</p>
        <div className="mt-4 grid grid-cols-4 gap-5">
          <Card n="1" title="三端一平台" desc="用户、商家、骑手各用一个 App；平台服务、智能调度、定时任务在后台跑，支付网关是外部系统。">
            <div className="flex flex-wrap gap-1.5">
              {ACTOR_ORDER.map((a) => (
                <ActorChip key={a} actor={a} size="xs" />
              ))}
            </div>
          </Card>
          <Card n="2" title="一张订单，两条状态轨道" desc="主状态管钱和商家，配送子状态管骑手；只有状态机能改它们，每一步都留痕。">
            <div className="flex flex-wrap gap-1">
              {MAIN_PATH.map((s, i) => (
                <span key={s} className={cx('rounded-full px-2 py-0.5 text-2xs', i < 6 ? 'bg-primary-50 text-primary-700' : 'bg-ink-50 text-ink-500')}>
                  {STATUS_LABEL[s]}
                </span>
              ))}
            </div>
          </Card>
          <Card n="3" title="派单怎么选骑手" desc={`不是谁近给谁：${w.dispatch!.reason}。`}>
            <div className="space-y-1.5">
              {(Object.keys(DEFAULT_WEIGHTS) as (keyof typeof DEFAULT_WEIGHTS)[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-2xs text-ink-600">
                  <span className="w-10">{WEIGHT_LABEL[k]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full rounded-full bg-act-dispatch" style={{ width: `${DEFAULT_WEIGHTS[k] * 100 * 2}%` }} />
                  </span>
                  <span className="num w-8 text-right">{DEFAULT_WEIGHTS[k] * 100}%</span>
                </div>
              ))}
            </div>
          </Card>
          <Card n="4" title="一笔钱怎么分" desc={`实付 ${rmb(l.payable)}：商家 ${rmb(l.merchantNet)}、骑手 ${rmb(l.rider.total)}、通道费 ${rmb(l.channelFee)}，平台只剩 ${rmb(l.platformNet)}。`}>
            <div className="flex h-3 overflow-hidden rounded-full">
              {[
                [l.merchantNet, 'var(--color-act-merchant)'],
                [l.rider.total, 'var(--color-act-rider)'],
                [l.channelFee, 'var(--color-act-gateway)'],
                [Math.max(l.platformNet, 0), 'var(--color-act-platform)'],
              ].map(([v, c], i) => (
                <span key={i} style={{ width: `${((v as number) / l.payable) * 100}%`, background: c as string }} />
              ))}
            </div>
            <p className="mt-2 text-2xs text-ink-500">平台券 {rmb(o.pricing.couponOff)} 由平台出，所以佣金 {rmb(l.commission)} 几乎都贴回去了。</p>
          </Card>
        </div>
      </section>

      {/* 情景 */}
      <section className="mx-10 mt-9">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[20px] font-bold text-ink-900">演示情景</h2>
            <p className="mt-1 text-sm text-ink-500">每个情景是一个业务故事；点“一键演示”会切换情景并从头播放，也可以去三端联动自己点。</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-5">
          {SCENARIOS.map((s) => (
            <article key={s.key} className={cx('flex flex-col rounded-[20px] bg-surface p-5 shadow-raise ring-1 transition-shadow hover:shadow-pop', s.key === scenario ? 'ring-primary-300' : 'ring-ink-950/[0.04]')}>
              <div className="flex items-center gap-2">
                <Badge tone={s.key === 'standard' ? 'primary' : 'neutral'}>{s.tag}</Badge>
                {s.key === scenario ? <span className="text-2xs font-medium text-primary-600">当前情景</span> : null}
              </div>
              <h3 className="mt-2.5 text-[16px] font-semibold text-ink-900">{s.title}</h3>
              <p className="mt-1.5 flex-1 text-sm leading-relaxed text-ink-600">{s.story}</p>
              <p className="mt-3 rounded-[12px] bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-700">
                <b className="font-semibold">预期：</b>
                {s.expect}
              </p>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="primary" icon="play" onClick={() => play(s.key)} disabled={active}>
                  一键演示
                </Button>
                <Button
                  size="sm"
                  icon="bike"
                  onClick={() => {
                    if (!active) setScenario(s.key);
                    navigate('/live');
                  }}
                >
                  三端联动
                </Button>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4 rounded-[20px] bg-amber-50 px-5 py-4 ring-1 ring-amber-100">
          <FoodArt kind="egg" size={44} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-700">每个情景最后都有售后：卤蛋漏送，部分退款</div>
            <p className="text-xs text-amber-700/90">退款按原价占比分摊优惠（3 元退 2.25 元），已结算订单在下一结算周期冲减。这是“原型补充 · 可选”环节，去掉不影响主流程。</p>
          </div>
          <Button size="sm" icon="arrowRight" onClick={() => goToStep('refund')}>
            看售后环节
          </Button>
        </div>
      </section>

      {/* 业务地图 */}
      <section className="mx-10 mt-9">
        <h2 className="text-[20px] font-bold text-ink-900">业务地图</h2>
        <p className="mt-1 text-sm text-ink-500">五个阶段、{STEPS.length} 个环节；点环节打开对应页面（自动切换演示角色）。完整依赖图见“全流程总览”。</p>
        <ol className="mt-4 grid grid-cols-5 gap-4">
          {PHASES.map((p, i) => (
            <li key={p.key} className="rounded-[20px] bg-surface p-4 shadow-raise ring-1 ring-ink-950/[0.04]">
              <div className="num text-2xs font-semibold text-primary-600">阶段 {i + 1}</div>
              <div className="mt-0.5 text-[15px] font-semibold text-ink-900">{p.title}</div>
              <div className="num text-2xs text-ink-400">{p.when}</div>
              <ul className="mt-3 space-y-1.5">
                {STEPS.filter((s) => s.phase === p.key).map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => goToStep(s.id)} className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-sm hover:bg-ink-50">
                      <span className="num flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-100 text-2xs font-semibold text-ink-600">{STEP_INDEX[s.id] + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-800">{s.short}</span>
                      <ActorChip actor={s.actor} size="xs" iconOnly />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Card({ n, title, desc, children }: { n: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-[20px] bg-surface p-5 shadow-raise ring-1 ring-ink-950/[0.04]">
      <span className="brand-grad flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white">{n}</span>
      <h3 className="mt-3 text-[15px] font-semibold text-ink-900">{title}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-600">{desc}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** 首屏插画：三张浮动的卡片代表三端 */
function HeroArt() {
  const w = useMemo(() => runScenario('standard', 'delivered'), []);
  const o = w.order!;
  const items: { who: string; color: string; time: string; text: string; delay: string; x: string }[] = [
    { who: '用户端', color: 'var(--color-act-user)', time: clockLabel(o.createdAt), text: '领券下单 · 实付 ¥49', delay: '0s', x: 'ml-0' },
    { who: '商家端', color: 'var(--color-act-merchant)', time: clockLabel(o.acceptedAt!), text: '新订单 #12 · 已接单', delay: '0.6s', x: 'ml-14' },
    { who: '骑手端', color: 'var(--color-act-rider)', time: clockLabel(o.deliveredAt!), text: '阿强 · 准时送达', delay: '1.2s', x: 'ml-6' },
  ];
  return (
    <div className="relative h-[330px]">
      <div className="absolute right-6 top-0">
        <div className="anim-float rounded-[30px] bg-surface/10 p-4 backdrop-blur">
          <FoodArt kind="beefNoodle" size={150} steam />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 space-y-3">
        {items.map((it) => (
          <div key={it.who} className={cx('anim-float flex w-[260px] items-center gap-3 rounded-[16px] bg-surface px-3.5 py-3 text-ink-900 shadow-pop', it.x)} style={{ animationDelay: it.delay }}>
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] text-surface" style={{ background: it.color }}>
              <Icon name={it.who === '用户端' ? 'user' : it.who === '商家端' ? 'store' : 'bike'} size={17} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-center justify-between text-2xs text-ink-500">
                {it.who}
                <span className="num font-semibold text-ink-700">{it.time}</span>
              </div>
              <div className="mt-0.5 truncate text-[13px] font-semibold">{it.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
