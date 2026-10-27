import { useMemo } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { BaseMap, Heat, Pins } from '@/components/live/CityMap';
import { LUNCH_COUPON } from '@/domain/pricing';
import { opsSnapshot } from '@/domain/seed';
import { balanced } from '@/domain/settlement';
import { fmtInt, pct, rmb } from '@/lib/format';
import { navigate, useRoute } from '@/lib/router';
import { useStore } from '@/lib/store';
import { clockLabel, reached } from '@/sim/world';
import { advance, prepareAt, useWorld } from '@/state/live';
import { applyLunchTemplate, couponDraft } from '@/state/ops';
import { useMoneyStep, type MoneyStep } from '@/state/opsFlow';
import { Btn, Card, Header, Pill, Row, TabBar } from './kit';
import type { OpsTab } from './mstate';

/** 橙子运营：城市运营的移动工作台（看板 / 营销 / 结算） */
export function OpsMobile() {
  const { path, query } = useRoute();
  const tab: OpsTab = path === '/settle' ? 'settle' : query.get('tab') === 'coupon' ? 'coupon' : 'board';
  return (
    <div className="flex h-full flex-col bg-[#f4f2ef]">
      <div key={tab} className="anim-fade flex min-h-0 flex-1 flex-col">
        {tab === 'coupon' ? <Coupon /> : tab === 'settle' ? <Settle /> : <Board />}
      </div>
      <TabBar<OpsTab>
        tone="dark"
        value={tab}
        onChange={(t) => navigate(t === 'settle' ? '/settle' : t === 'coupon' ? '/ops?tab=coupon' : '/ops')}
        items={[
          { value: 'board', label: '看板', icon: 'chart' },
          { value: 'coupon', label: '营销', icon: 'ticket' },
          { value: 'settle', label: '结算', icon: 'receipt' },
        ]}
      />
    </div>
  );
}

function Board() {
  const w = useWorld();
  const s = useMemo(() => opsSnapshot(), []);
  const max = Math.max(...s.hours.map((h) => h.orders));
  const warnings = [
    ...(w.reassign ? [{ at: clockLabel(w.reassign.at), kind: '骑手异常', text: `${w.reassign.reason}，已改派`, level: 'error' as const, mine: true }] : []),
    ...(w.late ? [{ at: clockLabel(w.order!.deliveredAt!), kind: '超时送达', text: `本单超时 ${w.late} 分钟，已发赔付券`, level: 'warn' as const, mine: true }] : []),
    ...s.warnings.map((x) => ({ ...x, mine: false })),
  ];
  const kpis: [string, string, IconName][] = [
    ['今日订单', fmtInt(s.orders + (reached(w, 'paid') ? 1 : 0)), 'receipt'],
    ['准时率', pct(s.onTime), 'checkCircle'],
    ['平均送达', `${s.avgMin}′`, 'timer'],
    ['在线骑手', fmtInt(s.riders), 'bike'],
  ];
  return (
    <>
      <Header tone="dark" title="滨湖区 · 实时看板" sub="截至 12:20 · 种子数据 + 本次演示订单" />
      <div className="m-scroll min-h-0 flex-1 space-y-3 px-3.5 pb-6 pt-3">
        <div data-flow-anchor="ops-kpi" className="grid grid-cols-2 gap-3">
          {kpis.map(([k, v, i]) => (
            <Card key={k} className="!p-3.5">
              <div className="flex items-center gap-1.5 text-[12.5px] text-ink-500">
                <Icon name={i} size={15} className="text-primary-500" />
                {k}
              </div>
              <div className="num mt-1 text-[26px] font-extrabold tracking-tight text-ink-900">{v}</div>
            </Card>
          ))}
        </div>
        <Card>
          <div className="text-[15px] font-bold text-ink-900">半小时订单量</div>
          <div className="mt-3 flex h-[120px] items-end gap-2.5">
            {s.hours.slice(0, 6).map((h) => (
              <div key={h.label} className="flex flex-1 flex-col items-center gap-1">
                <span className="num text-[11px] text-ink-500">{h.orders || '—'}</span>
                <div className="relative w-full overflow-hidden rounded-t-[8px] bg-primary-100" style={{ height: `${(h.orders / max) * 84 + 2}px` }}>
                  <div className="absolute inset-x-0 bottom-0 bg-primary-500" style={{ height: `${h.orders ? (h.late / h.orders) * 100 : 0}%` }} />
                </div>
                <span className="num text-[11px] text-ink-400">{h.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card anchor="ops-heat" className="overflow-hidden !p-0">
          <div className="px-4 pb-2 pt-3.5 text-[15px] font-bold text-ink-900">需求热力</div>
          <svg viewBox="80 0 840 600" className="h-[210px] w-full" role="img" aria-label="需求热力（示意）">
            <BaseMap />
            <Heat cells={s.heat} />
            <Pins />
          </svg>
        </Card>
        <Card>
          <div className="mb-1 text-[15px] font-bold text-ink-900">超时预警</div>
          {warnings.map((x) => (
            <div key={`${x.kind}-${x.at}`} className="flex gap-3 border-t border-black/[0.04] py-2.5 first:border-0">
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.level === 'error' ? 'bg-seal-500' : 'bg-amber-500')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">
                  {x.kind}
                  <span className="num text-[12px] font-normal text-ink-400">{x.at}</span>
                  {x.mine ? <Pill tone="brand">本单</Pill> : null}
                </div>
                <div className="text-[13px] text-ink-600">{x.text}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

function Coupon() {
  const w = useWorld();
  const { draft, touched } = useStore(couponDraft, (s) => s);
  const published = w.coupon.status === 'published';
  const f = published ? w.coupon : touched ? draft : null;
  return (
    <>
      <Header tone="dark" title="营销 · 平台券" sub="平台承担，可与商家满减叠加" />
      <div className="m-scroll min-h-0 flex-1 space-y-3 px-3.5 pb-6 pt-3">
        <Card anchor="coupon-form">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold text-ink-900">午市满减券</span>
            <button type="button" data-demo="ops-template" disabled={published} onClick={applyLunchTemplate} className="m-press flex items-center gap-1.5 rounded-full bg-black/[0.05] px-3 py-1.5 text-[13px] font-semibold text-ink-800 disabled:opacity-40">
              <Icon name="ticket" size={14} />
              套用午市模板
            </button>
          </div>
          <div className="mt-2">
            <Row k="券名称" v={f?.name || '—'} />
            <Row k="门槛 / 面额" v={f ? `满 ${f.threshold / 100} 减 ${f.off / 100}` : '—'} />
            <Row k="门槛口径" v={f ? '商家优惠后金额' : '—'} />
            <Row k="发放量 / 每人" v={f ? `${fmtInt(f.quota)} 张 / ${f.perUser} 张` : '—'} />
            <Row k="可用时段" v={f ? f.window : '—'} />
            <Row k="状态" v={published ? `v${w.coupon.version} 已发布` : touched ? '草稿' : '未配置'} tone={published ? 'brand' : 'muted'} />
          </div>
        </Card>
        <Card anchor="coupon-preview">
          <div className="text-[15px] font-bold text-ink-900">发布前预览</div>
          <div className={cx('mt-3 flex items-center gap-3 rounded-[16px] bg-gradient-to-r from-[#fff2e4] to-[#ffdcc0] p-3 transition-opacity', !f && 'opacity-40')}>
            <span className="flex h-14 w-16 flex-col items-center justify-center rounded-[12px] bg-white text-primary-600">
              <span className="num text-[22px] font-extrabold leading-none">¥{(f?.off ?? LUNCH_COUPON.off) / 100}</span>
              <span className="mt-1 text-[10.5px]">满{(f?.threshold ?? LUNCH_COUPON.threshold) / 100}可用</span>
            </span>
            <div className="text-[13px] leading-tight">
              <div className="text-[15px] font-bold text-ink-900">{f?.name || '平台券'}</div>
              <div className="mt-1 text-ink-500">预计核销 1,984 张 · 补贴 ¥15,872</div>
            </div>
          </div>
          <Btn demo="ops-publish" className="mt-4" icon="send" disabled={published || !touched} onClick={() => advance('coupon')}>
            {published ? '已发布，用户端可领取' : '确认并发布'}
          </Btn>
        </Card>
      </div>
    </>
  );
}

const SETTLE_STAGES = ['汇总已对平的已完成订单', '逐笔分账与勾稽', '生成结算单与对账文件'];

/** 资金：渠道对账 → T+1 结算 → 打款到账（→ 有售后时的下期冲减）。环节脚本注册在 PhoneOS（常驻），这里只读进度 */
function Settle() {
  const w = useWorld();
  const cur = useMoneyStep();
  const st = w.settle;
  const done = reached(w, 'settled');
  const prog = cur.id === 'settle' ? cur.sub : done ? 3 : -1;
  const chain: { id: MoneyStep; title: string; when: string; done: boolean; figure: string; optional?: boolean }[] = [
    { id: 'reconcile', title: '渠道对账', when: '次日 01:00', done: reached(w, 'reconciled'), figure: w.recon ? `${w.recon.matched}/${w.recon.statement.length} 笔对平` : '网关对账单 vs 支付流水' },
    { id: 'settle', title: 'T+1 结算', when: '次日 02:00', done, figure: st ? `商家应得 ${rmb(st.summary.merchantNet)}` : '逐笔分账与勾稽' },
    { id: 'payout', title: '打款到账', when: '次日 08:00', done: reached(w, 'paidOut'), figure: w.payout ? `到账 ${rmb(w.payout.total)}` : '商家对公户 + 骑手钱包' },
    { id: 'offset', title: '下期冲减', when: '后天 02:00', done: reached(w, 'offset'), figure: w.offset ? `商家冲减 ${rmb(-w.offset.merchantAdj)}` : reached(w, 'refunded') ? '退款已完成，待冲减' : '有售后退款时才发生', optional: true },
  ];
  return (
    <>
      <Header
        tone="dark"
        title="资金 · 对账与结算"
        sub="01:00 对账 · 02:00 结算 · 08:00 打款"
        right={
          !done && !cur.id ? (
            <button type="button" onClick={() => (prepareAt('rated'), advance('settled'))} className="m-press rounded-full bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold">
              立即运行
            </button>
          ) : undefined
        }
      />
      <div className="m-scroll min-h-0 flex-1 space-y-3 px-3.5 pb-6 pt-3">
        <Card>
          {chain.map((n, i) => {
            // 正在演示的环节显示“进行中”（即使世界已推进到它的产出），其余按是否完成
            const run = cur.id === n.id;
            const ok = n.done && !run;
            return (
              <div key={n.id} className="relative flex gap-3 pb-3 last:pb-0">
                {i < chain.length - 1 ? <span className={cx('absolute left-[13px] top-7 h-[calc(100%-22px)] w-[2px] rounded-full', ok ? 'bg-pine-200' : 'bg-ink-100')} /> : null}
                <span className={cx('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-colors', ok ? 'bg-pine-500 text-white' : run ? 'brand-grad text-white' : 'bg-ink-100 text-ink-500', n.optional && !n.done && !run && 'border border-dashed border-ink-400 bg-white')}>
                  {ok ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cx('text-[14.5px] font-semibold', n.done || run ? 'text-ink-900' : 'text-ink-500')}>{n.title}</span>
                    {n.optional ? <Pill tone="neutral">可选</Pill> : null}
                    {run ? <span className="anim-pulse text-[12px] text-primary-600">进行中</span> : null}
                    <span className="num ml-auto text-[11.5px] text-ink-400">{n.when}</span>
                  </div>
                  <div className={cx('mt-0.5 truncate text-[12.5px]', ok ? 'text-pine-700' : 'text-ink-400')}>{n.figure}</div>
                </div>
              </div>
            );
          })}
        </Card>
        <Card anchor="settle-recon">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-900">渠道对账</span>
            {w.recon ? <Pill tone={w.recon.diffs.length ? 'red' : 'green'}>{w.recon.diffs.length ? `差异 ${w.recon.diffs.length} 笔` : '全部对平'}</Pill> : cur.id === 'reconcile' ? <Pill tone="brand">对账中</Pill> : null}
          </div>
          {w.recon ? (
            <div className="mt-2">
              <Row k="网关对账单" v={`${w.recon.statement.length} 笔`} />
              <Row k="对平" v={`${w.recon.matched} 笔`} />
              <Row k="交易金额" v={rmb(w.recon.amount)} />
              <Row k="通道费" v={rmb(w.recon.fee)} />
              {w.recon.dupIgnored ? <p className="mt-1.5 text-[12px] leading-[18px] text-ink-500">重复回调 {w.recon.dupIgnored} 次已幂等忽略，未进入流水，不影响对账。</p> : null}
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] leading-[19px] text-ink-500">次日 01:00 下载网关对账单，按 trade_no 与平台支付流水逐笔核对；差异订单不进入当期结算。</p>
          )}
        </Card>
        <Card anchor="settle-run">
          {SETTLE_STAGES.map((s, i) => {
            const state = prog > i ? 'done' : prog === i ? 'run' : 'todo';
            return (
              <div key={s} className="flex items-center gap-3 border-t border-black/[0.04] py-2.5 first:border-0">
                <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold transition-colors', state === 'done' ? 'bg-pine-500 text-white' : state === 'run' ? 'brand-grad text-white' : 'bg-ink-100 text-ink-500')}>{state === 'done' ? <Icon name="check" size={14} strokeWidth={3} /> : i + 1}</span>
                <span className={cx('flex-1 text-[14.5px]', state === 'todo' ? 'text-ink-400' : 'font-semibold text-ink-900')}>{s}</span>
                {state === 'run' ? <span className="anim-pulse text-[12px] text-primary-600">进行中</span> : null}
              </div>
            );
          })}
        </Card>
        {st ? (
          <>
            <Card anchor="settle-split">
              <div className="text-[15px] font-bold text-ink-900">这一单的钱去了哪里</div>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full">
                {[
                  [st.line.merchantNet, 'var(--color-act-merchant)'],
                  [st.line.rider.total, 'var(--color-act-rider)'],
                  [st.line.channelFee, 'var(--color-act-gateway)'],
                  [Math.max(0, st.line.platformNet), 'var(--color-act-platform)'],
                ].map(([v, c], i) => (
                  <span key={i} style={{ width: `${((v as number) / st.line.payable) * 100}%`, background: c as string }} />
                ))}
              </div>
              <div className="mt-2">
                <Row k="用户实付" v={rmb(st.line.payable)} strong />
                <Row k="商家应得" v={rmb(st.line.merchantNet)} />
                <Row k="骑手收入" v={rmb(st.line.rider.total)} />
                <Row k="支付通道费" v={rmb(st.line.channelFee)} />
                <Row k="平台净收入" v={rmb(st.line.platformNet)} tone={st.line.platformNet < 0 ? 'warn' : undefined} />
              </div>
            </Card>
            <Card anchor="settle-file">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#1f7a46] text-[13px] font-bold text-white">X</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-ink-900">结算对账_M1001_20261018.xlsx</div>
                  <div className="text-[12px] text-ink-400">{st.batch.length} 笔 · {st.batch.filter(balanced).length} 笔勾稽平衡</div>
                </div>
                <Pill tone="green">已生成</Pill>
              </div>
              <div className="mt-3">
                <Row k="商家应得合计" v={rmb(st.summary.merchantNet)} />
                <Row k="骑手收入合计" v={rmb(st.summary.rider)} />
                <Row k="平台净收入合计" v={rmb(st.summary.platformNet)} />
              </div>
            </Card>
          </>
        ) : (
          <p className="px-2 text-[13px] leading-[20px] text-ink-500">演示订单完成评价后，定时任务在次日 01:00 对账、02:00 结算；也可以点右上角“立即运行”。</p>
        )}
        <Card anchor="settle-payout">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-900">打款到账</span>
            {w.payout ? <Pill tone={cur.id === 'payout' && cur.sub === 1 ? 'brand' : 'green'}>{cur.id === 'payout' && cur.sub === 1 ? '代付中' : '已到账'}</Pill> : null}
          </div>
          {w.payout ? (
            <div className="mt-2">
              {w.payout.items.map((i) => (
                <Row key={i.payee} k={i.payee} v={rmb(i.amount)} />
              ))}
              <Row k="合计" v={rmb(w.payout.total)} strong />
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-[13px] leading-[19px] text-ink-500">次日 08:00 商家应得打到对公账户、骑手收入打到骑手钱包，网关代付回执后通知到账。</p>
              {done && !cur.id ? (
                <Btn size="md" tone="dark" icon="send" className="mt-3" onClick={() => advance('paidOut')}>
                  模拟 08:00 打款
                </Btn>
              ) : null}
            </>
          )}
        </Card>
        <Card anchor="settle-offset" className="border border-dashed border-ink-300">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-900">下期冲减</span>
            <Pill tone="neutral">原型补充 · 可选</Pill>
          </div>
          {w.offset ? (
            <div className="mt-2">
              <Row k="退给用户" v={rmb(w.offset.refund)} />
              <Row k="商家冲减（从本期结算款扣）" v={rmb(-w.offset.merchantAdj)} />
              <Row k="平台承担" v={rmb(-w.offset.platformAdj)} />
            </div>
          ) : (
            <>
              <p className="mt-1.5 text-[13px] leading-[19px] text-ink-500">{reached(w, 'refunded') ? '售后退款已原路退回；这单已结算，下一结算周期从商家结算款中扣减。' : '售后部分退款完成后，下一结算周期在这里冲减；没有售后就没有这一步。'}</p>
              {reached(w, 'refunded') && !cur.id ? (
                <Btn size="md" tone="dark" icon="merge" className="mt-3" onClick={() => advance('offset')}>
                  模拟下期冲减
                </Btn>
              ) : null}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
