import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Panel, Segmented, Tabs, cx } from '@/components/ui/primitives';
import { CityMap } from '@/components/live/CityMap';
import { FormatLink } from '@/components/flow/DataObject';
import { opsSnapshot } from '@/domain/seed';
import { LUNCH_COUPON } from '@/domain/pricing';
import { useFlowStep } from '@/flow/director';
import { fmtInt, pct, rmb } from '@/lib/format';
import { setQuery, useRoute } from '@/lib/router';
import { useStore } from '@/lib/store';
import { clockLabel, reached } from '@/sim/world';
import { advance, useWorld } from '@/state/live';
import { applyLunchTemplate, couponDraft } from '@/state/ops';
import { couponScript, useOpsWalk } from '@/state/opsFlow';

type Tab = 'dashboard' | 'coupon';

export function OpsPage() {
  const { query } = useRoute();
  const tab = (query.get('tab') as Tab) || 'dashboard';
  useOpsWalk();
  return (
    <>
      <PageHeader
        title="运营后台"
        crumbs={['业务现场', '运营后台']}
        desc="城市运营的工作台：配置营销券、盯午高峰的实时指标与超时预警。这里的数字来自确定性种子数据与本次演示订单。"
      >
        <Tabs<Tab>
          value={tab}
          onChange={(v) => setQuery({ tab: v })}
          items={[
            { value: 'dashboard', label: '实时看板' },
            { value: 'coupon', label: '营销券配置' },
          ]}
        />
      </PageHeader>
      <div className="px-10 pb-8 pt-5">{tab === 'coupon' ? <CouponTab /> : <Dashboard />}</div>
    </>
  );
}

/* ---------------- 营销券配置 ---------------- */

function CouponTab() {
  const w = useWorld();
  const { draft, touched } = useStore(couponDraft, (s) => s);
  const published = w.coupon.status === 'published';
  const shown = published ? w.coupon : touched ? draft : null;
  useFlowStep('coupon', couponScript);
  const est = useMemo(() => {
    const claim = 3200;
    const use = Math.round(claim * 0.62);
    return { claim, use, cost: use * LUNCH_COUPON.off };
  }, []);
  const f = shown ?? { ...LUNCH_COUPON, name: '', threshold: 0, off: 0 };
  return (
    <div className="grid grid-cols-12 gap-6">
      <Panel
        className="col-span-7"
        anchor="coupon-form"
        title="平台券 · 午市满减"
        desc="平台承担成本，可与商家满减叠加；同一订单只能用一张平台券。"
        actions={
          <>
            <FormatLink k="couponTpl" label="数据格式" />
            <Button data-demo="ops-template" icon="ticket" onClick={applyLunchTemplate} disabled={published}>
              套用午市模板
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Field label="券名称" value={f.name || '—'} />
          <Field label="成本承担" value="平台 100%" />
          <Field label="使用门槛" value={f.threshold ? `满 ${f.threshold / 100} 元` : '—'} />
          <Field label="面额" value={f.off ? `${f.off / 100} 元` : '—'} />
          <div className="col-span-2">
            <div className="mb-1.5 text-xs font-medium text-ink-500">门槛口径</div>
            <Segmented<'afterMerchant' | 'original'>
              value={f.basis}
              onChange={() => undefined}
              items={[
                { value: 'afterMerchant', label: '按商家优惠后金额（推荐）' },
                { value: 'original', label: '按商品原价', disabled: true },
              ]}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-ink-500">例：原价 40 元、商家满 30 减 3 后 37 元，按推荐口径不满足门槛。口径之争见“方案讨论”。</p>
          </div>
          <Field label="发放总量" value={f.threshold ? `${fmtInt(f.quota)} 张` : '—'} />
          <Field label="每人限领" value={f.threshold ? `${f.perUser} 张` : '—'} />
          <Field label="可用时段" value={f.threshold ? `${f.window}（当日）` : '—'} />
          <Field label="状态" value={published ? `v${w.coupon.version} 已发布 · ${clockLabel(w.coupon.publishedAt!)}` : touched ? '草稿' : '未配置'} tone={published ? 'pine' : undefined} />
        </div>
      </Panel>
      <div className="col-span-5 space-y-6">
        <Panel anchor="coupon-preview" title="发布前预览" desc="用户端看到的券样式与补贴成本预估（预估参数为假设，见 A-03）。">
          <div className={cx('flex items-center gap-4 rounded-[16px] bg-gradient-to-r from-[#fff1e3] to-[#ffe0c4] p-4 ring-1 ring-[#ffd2ad] transition-opacity', !shown && 'opacity-40')}>
            <div className="flex h-16 w-20 flex-col items-center justify-center rounded-[12px] bg-white text-primary-600">
              <span className="num text-[26px] font-bold leading-none">¥{f.off / 100 || '—'}</span>
              <span className="mt-1 text-2xs">满{f.threshold / 100 || '—'}可用</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-ink-900">{f.name || '平台券'}</div>
              <div className="mt-0.5 text-xs text-ink-500">平台券 · {f.window} · 限领 {f.perUser} 张</div>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              ['预计领取', `${fmtInt(est.claim)} 张`],
              ['预计核销', `${fmtInt(est.use)} 张`],
              ['补贴成本', rmb(est.cost)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[12px] bg-ink-50 py-2.5">
                <dd className="num text-[17px] font-semibold text-ink-900">{shown ? v : '—'}</dd>
                <dt className="text-2xs text-ink-500">{k}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-end gap-2">
            {published ? (
              <Badge tone="pine" icon="checkCircle">
                已发布，用户端可领取
              </Badge>
            ) : null}
            <Button data-demo="ops-publish" variant="primary" icon="send" onClick={() => advance('coupon')} disabled={published || !touched}>
              确认并发布
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: 'pine' }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-ink-500">{label}</div>
      <div className={cx('flex h-9 items-center rounded-[10px] border border-black/[0.1] bg-surface px-3 text-sm', tone === 'pine' ? 'text-pine-700' : 'text-ink-900')}>{value}</div>
    </div>
  );
}

/* ---------------- 实时看板 ---------------- */

function Dashboard() {
  const w = useWorld();
  const s = useMemo(() => opsSnapshot(), []);
  const demoDone = reached(w, 'delivered');
  const orders = s.orders + (reached(w, 'paid') ? 1 : 0);
  const max = Math.max(...s.hours.map((h) => h.orders));
  const warnings = [
    ...s.warnings,
    ...(w.reassign ? [{ at: clockLabel(w.reassign.at), order: w.order!.no, kind: '骑手异常', text: `${w.reassign.reason}，已改派`, level: 'error' as const }] : []),
    ...(w.late ? [{ at: clockLabel(w.order!.deliveredAt!), order: w.order!.no, kind: '超时送达', text: `超时 ${w.late} 分钟，已发赔付券`, level: 'warn' as const }] : []),
  ];
  return (
    <div className="space-y-6">
      <div data-flow-anchor="ops-kpi" className="grid grid-cols-6 gap-4">
        {[
          ['今日订单', fmtInt(orders), '截至 12:20', 'receipt'],
          ['成交额 GMV', rmb(s.gmv + (reached(w, 'paid') ? w.order!.pricing.payable : 0)).replace(/\.\d+$/, ''), '含平台补贴前', 'wallet'],
          ['准时率', pct(s.onTime), '承诺时间内送达', 'checkCircle'],
          ['平均送达', `${s.avgMin} 分钟`, '下单 → 送达', 'timer'],
          ['在线骑手', fmtInt(s.riders), '滨湖区', 'bike'],
          ['待取餐', fmtInt(s.pending), '已出餐未取', 'bag'],
        ].map(([k, v, hint, icon]) => (
          <div key={k} className="rounded-[18px] bg-surface p-4 shadow-raise ring-1 ring-black/[0.04]">
            <div className="flex items-center gap-1.5 text-xs text-ink-500">
              <Icon name={icon as 'receipt'} size={14} className="text-primary-500" />
              {k}
            </div>
            <div className="num mt-2 text-[24px] font-bold tracking-tight text-ink-900">{v}</div>
            <div className="text-2xs text-ink-400">{hint}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <Panel className="col-span-7" title="半小时订单量" desc="午高峰 11:30–12:30；橙色是超时单。">
          <div className="flex h-[220px] items-end gap-4 pt-4">
            {s.hours.map((h) => (
              <div key={h.label} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="num text-2xs text-ink-500">{h.orders || '未到'}</span>
                <div className="relative w-full max-w-[44px] overflow-hidden rounded-t-[8px] bg-primary-100" style={{ height: `${(h.orders / max) * 160 + 2}px` }}>
                  <div className="absolute inset-x-0 bottom-0 bg-primary-500" style={{ height: `${h.orders ? (h.late / h.orders) * 100 : 0}%` }} />
                </div>
                <span className="num text-2xs text-ink-400">{h.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="col-span-5" title="超时预警" desc="平台自动识别，运营跟进处理。" bodyClassName="p-0 pb-2">
          <ul className="divide-y divide-black/[0.05]">
            {warnings.map((x) => (
              <li key={`${x.order}-${x.kind}`} className={cx('flex items-start gap-3 px-6 py-3', x.order === w.order?.no && 'bg-primary-50/60')}>
                <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.level === 'error' ? 'bg-seal-500' : 'bg-amber-500')} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-ink-900">{x.kind}</span>
                    <span className="num text-2xs text-ink-400">{x.at}</span>
                    {x.order === w.order?.no ? <Badge tone="primary">本单</Badge> : null}
                  </div>
                  <div className="text-xs text-ink-600">{x.text}</div>
                  <div className="code mt-0.5 text-2xs text-ink-400">{x.order}</div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <Panel className="col-span-7" anchor="ops-heat" title="需求热力" desc="按 500 米网格统计近 30 分钟下单量；颜色越深需求越集中，调度会提前把骑手引导过去。" bodyClassName="p-4 pt-2">
          <div className="overflow-hidden rounded-[14px]">
            <CityMap w={w} heat={s.heat} className="h-[360px] w-full" />
          </div>
        </Panel>
        <Panel className="col-span-5" title="本次演示订单" desc="这一单在看板上的样子。">
          {w.order ? (
            <div className="space-y-3 text-sm">
              <div className="code text-ink-500">{w.order.no}</div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['状态', demoDone ? '已送达' : '进行中'],
                  ['承诺', w.order.promisedAt ? clockLabel(w.order.promisedAt) : '—'],
                  ['送达', w.order.deliveredAt ? clockLabel(w.order.deliveredAt) : '—'],
                  ['用时', w.order.deliveredAt ? `${Math.round(w.order.deliveredAt - w.order.createdAt)} 分钟` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-[12px] bg-ink-50 px-3 py-2">
                    <div className="text-2xs text-ink-500">{k}</div>
                    <div className="num font-semibold text-ink-900">{v}</div>
                  </div>
                ))}
              </div>
              <Badge tone={w.late ? 'amber' : demoDone ? 'pine' : 'primary'}>{w.late ? `超时 ${w.late} 分钟` : demoDone ? '计入准时' : '配送中'}</Badge>
            </div>
          ) : (
            <p className="text-sm text-ink-500">还没有演示订单。去“三端联动”下一单，或一键运行完整流程。</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
