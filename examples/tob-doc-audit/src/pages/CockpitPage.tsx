import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Empty, Panel, Segmented, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { BarList, Heatmap, LineChart } from '@/components/charts/Charts';
import { FormatLink } from '@/components/flow/DataObject';
import { ORGS, orgByCode, scopeOrgs, tier2Of } from '@/domain/orgs';
import { fmtInt, fmtPct } from '@/lib/format';
import { MAJORS, type MajorKey } from '@/rules/types';
import { orgLabel, useAllBatches, visibleBatches, type CheckBatch } from '@/state/results';
import { portalCookie, useCan, useUser } from '@/state/session';
import { useFlowStep } from '@/flow/director';
import { useCases } from '@/state/casebook';
import { orgOfDoc, rectifyRate, useRectified } from '@/state/closure';

interface Agg {
  code: string;
  label: string;
  batches: number;
  total: number;
  suspicious: number;
  country: number;
  api: number;
  byMajor: Partial<Record<MajorKey, number>>;
}

function aggregate(list: CheckBatch[], keyOf: (b: CheckBatch) => string, labelOf: (k: string) => string): Agg[] {
  const m = new Map<string, Agg>();
  for (const b of list) {
    const k = keyOf(b);
    const a = m.get(k) ?? { code: k, label: labelOf(k), batches: 0, total: 0, suspicious: 0, country: 0, api: 0, byMajor: {} };
    a.batches++;
    a.total += b.total;
    a.suspicious += b.suspicious;
    a.country += b.countryRecs;
    if (b.source === 'api') a.api++;
    for (const [mk, n] of Object.entries(b.byMajor)) a.byMajor[mk as MajorKey] = (a.byMajor[mk as MajorKey] ?? 0) + (n ?? 0);
    m.set(k, a);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

const rate = (a: { total: number; suspicious: number }) => (a.total ? a.suspicious / a.total : 0);

/**
 * 核查驾驶舱：由核查批次实时聚合，按角色分层展示。
 * 区域看辖内各子公司（含本区域的全辖抽查）；集团看各区域，点击下钻到子公司。
 */
export function CockpitPage() {
  const user = useUser();
  const can = useCan('cockpit');
  const all = useAllBatches();
  const [range, setRange] = useState<'30' | '7'>('30');
  const [source, setSource] = useState<'all' | 'ui' | 'api'>('all');
  const [drill, setDrill] = useState<string | null>(null);
  const since = range === '7' ? '2026-10-08' : '2026-09-14';
  const scoped = useMemo(() => visibleBatches(all, user).filter((b) => b.time.slice(0, 10) >= since && (source === 'all' || b.source === source)), [all, user, since, source]);

  // 集团：未下钻时按区域聚合；区域或下钻后按组织（子公司 / 本区域）聚合
  const branch = user.role === 'tier2' ? user.orgCode : drill;
  const inBranch = branch ? scoped.filter((b) => b.orgCode === branch || orgByCode(b.orgCode)?.parent === branch) : scoped;
  const groups = useMemo(
    () =>
      branch
        ? aggregate(inBranch, (b) => b.orgCode, (k) => (k === branch ? `${orgLabel(k)}（本区域抽查）` : orgLabel(k)))
        : aggregate(inBranch, (b) => (orgByCode(b.orgCode)?.level === 'tier2' ? b.orgCode : tier2Of(b.orgCode)?.code ?? b.orgCode), orgLabel),
    [inBranch, branch],
  );
  const total = useMemo(() => aggregate(inBranch, () => 'all', () => '合计')[0], [inBranch]);
  const daily = useMemo(() => {
    const d = new Map<string, { total: number; suspicious: number }>();
    for (const b of inBranch) {
      const k = b.time.slice(5, 10);
      const x = d.get(k) ?? { total: 0, suspicious: 0 };
      x.total += b.total;
      x.suspicious += b.suspicious;
      d.set(k, x);
    }
    return [...d.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, v]) => ({ x, y: Math.round(rate(v) * 1000) / 10, sub: `${fmtInt(v.suspicious)} / ${fmtInt(v.total)} 笔` }));
  }, [inBranch]);
  const majors = MAJORS.filter((m) => groups.some((g) => g.byMajor[m.key]));
  const avg = total ? rate(total) : 0;

  useFlowStep('cockpit', (c) => {
    setDrill(null);
    setRange('30');
    setSource('all');
    c.sub(0);
    c.hover('[data-flow-anchor="cockpit-kpi"]');
    c.later(2600, () => {
      c.sub(1);
      c.hover('[data-flow-anchor="cockpit-loop"]');
    });
    c.later(5400, () => {
      c.sub(2);
      c.hover('[data-flow-anchor="cockpit-orgs"]');
    });
    c.later(8200, () => {
      c.sub(3);
      c.hover('[data-flow-anchor="cockpit-majors"]');
    });
    c.later(11000, () => {
      c.sub(4);
      c.click('[data-demo="drill-110000"]', () => setDrill('110000'));
    });
    c.later(13600, () => c.hover('[data-flow-anchor="cockpit-orgs"]'));
    c.later(15800, () => c.done());
  });

  if (!can)
    return (
      <>
        <PageHeader title="核查驾驶舱" crumbs={['单据智能核查', '核查驾驶舱']} />
        <div className="px-10 py-7">
          <Empty icon="lock" title="驾驶舱面向区域与集团财务管理员">
            子公司岗位可在“核查结果”中查看本公司的批次与疑点。请在顶栏切换为区域或集团角色查看。
          </Empty>
        </div>
      </>
    );

  const levelText = user.role === 'tier1' ? (drill ? `${orgLabel(drill)}（下钻：各子公司）` : '全集团（各区域）') : `${orgLabel(user.orgCode)}（辖内各子公司）`;

  return (
    <>
      <PageHeader
        title="核查驾驶舱"
        crumbs={['单据智能核查', '核查驾驶舱']}
        desc="由核查批次实时聚合，按角色分层：区域看辖内各子公司，集团看各区域并可下钻到子公司。国别疑点单列为一个大类。"
        actions={<FormatLink k="cockpitAgg" label="聚合口径" />}
      />
      <div className="space-y-6 px-10 py-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-sm text-primary-800 ring-1 ring-primary-100">
            <Icon name="link" size={13} />
            {user.name}（{user.roleName}）· <span className="code text-xs">{portalCookie(user.empNo)}</span>
          </span>
          {user.role === 'tier1' && drill ? (
            <button type="button" onClick={() => setDrill(null)} className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:underline">
              <Icon name="chevronLeft" size={14} />
              返回全集团
            </button>
          ) : null}
          <span className="text-sm font-semibold text-ink-900">{levelText}</span>
          <span className="ml-auto flex items-center gap-2">
            <Segmented<'all' | 'ui' | 'api'>
              value={source}
              onChange={setSource}
              items={[
                { value: 'all', label: '全部来源' },
                { value: 'ui', label: '界面上传' },
                { value: 'api', label: '接口上传' },
              ]}
            />
            <Segmented<'30' | '7'>
              value={range}
              onChange={setRange}
              items={[
                { value: '30', label: '近 30 天' },
                { value: '7', label: '近 7 天' },
              ]}
            />
          </span>
        </div>

        {total ? (
          <>
            <dl data-flow-anchor="cockpit-kpi" className="grid grid-cols-6 gap-3">
              {[
                ['核查批次', fmtInt(total.batches), `接口上传 ${fmtInt(total.api)}`],
                ['核查笔数', fmtInt(total.total), '三类单据合计'],
                ['疑点笔数', fmtInt(total.suspicious), '含疑问数据'],
                ['疑点率', fmtPct(avg), branch ? '本区域辖内' : '全集团'],
                ['国别疑点', fmtInt(total.country), '同一交易对方国别不唯一等'],
                ['覆盖组织', fmtInt(groups.length), branch ? '子公司 / 本区域' : '区域'],
              ].map(([k, v, h]) => (
                <div key={k} className="rounded-[16px] bg-surface px-4 py-3 shadow-raise ring-1 ring-black/[0.04]">
                  <dt className="text-xs text-ink-500">{k}</dt>
                  <dd className="num mt-0.5 text-[26px] font-semibold leading-tight text-ink-900">{v}</dd>
                  <dd className="text-2xs text-ink-400">{h}</dd>
                </div>
              ))}
            </dl>

            <ClosureStrip batches={inBranch} />

            <div className="grid grid-cols-12 gap-6">
              <Panel className="col-span-5" anchor="cockpit-orgs" title={branch ? '各组织疑点率' : '各区域疑点率'} desc={`深色为高于平均（${fmtPct(avg)}）的组织`}>
                <BarList items={groups.map((g) => ({ label: g.label, value: rate(g), sub: `${fmtInt(g.suspicious)} / ${fmtInt(g.total)} 笔` }))} format={fmtPct} highlight={(v) => v > avg} />
              </Panel>
              <Panel className="col-span-7" title="每日疑点率" desc="按核查日期汇总；10 月 1–7 日国庆假期无核查">
                <LineChart data={daily} yFormat={(v) => `${v.toFixed(1)}%`} label="每日疑点率" />
              </Panel>
            </div>

            <Panel anchor="cockpit-majors" title="疑点大类分布（笔）" desc="行是组织，列是疑点大类；颜色越深疑点越多。国别为一个大类（同一批次同一交易对方国别不唯一、国别为中国 / ZZZ、与地址不一致）。">
              <Heatmap rows={groups.map((g) => g.label)} cols={majors.map((m) => m.label)} values={groups.map((g) => majors.map((m) => g.byMajor[m.key] ?? 0))} label="组织 × 疑点大类" />
            </Panel>

            <Panel title={branch ? '组织明细' : '区域明细（点击下钻到子公司）'} desc="表格与上方图表口径一致">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr>
                    <th className="py-1.5 font-normal">{branch ? '组织' : '区域'}</th>
                    <th className="py-1.5 text-right font-normal">批次</th>
                    <th className="py-1.5 text-right font-normal">核查笔数</th>
                    <th className="py-1.5 text-right font-normal">疑点笔数</th>
                    <th className="py-1.5 text-right font-normal">疑点率</th>
                    <th className="py-1.5 text-right font-normal">国别疑点</th>
                    <th className="py-1.5 text-right font-normal">接口上传占比</th>
                    <th className="py-1.5 font-normal">　</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05]">
                  {groups.map((g) => {
                    const canDrill = user.role === 'tier1' && !branch && ORGS.find((o) => o.code === g.code)?.level === 'tier2';
                    return (
                      <tr
                        key={g.code}
                        data-demo={canDrill ? `drill-${g.code}` : undefined}
                        onClick={canDrill ? () => setDrill(g.code) : undefined}
                        className={cx(canDrill && 'cursor-pointer hover:bg-primary-50/50')}
                      >
                        <td className="py-2 text-ink-900">{g.label}</td>
                        <td className="num py-2 text-right text-ink-700">{fmtInt(g.batches)}</td>
                        <td className="num py-2 text-right text-ink-700">{fmtInt(g.total)}</td>
                        <td className="num py-2 text-right text-ink-700">{fmtInt(g.suspicious)}</td>
                        <td className={cx('num py-2 text-right', rate(g) > avg ? 'font-semibold text-ink-900' : 'text-ink-700')}>{fmtPct(rate(g))}</td>
                        <td className="num py-2 text-right text-ink-700">{fmtInt(g.country)}</td>
                        <td className="num py-2 text-right text-ink-700">{fmtPct(g.batches ? g.api / g.batches : 0)}</td>
                        <td className="py-2 pl-3 text-right">{canDrill ? <Badge tone="primary">下钻</Badge> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </>
        ) : (
          <Empty icon="chart" title="当前范围内没有核查批次">
            调整时间范围或来源。
          </Empty>
        )}
      </div>
    </>
  );
}

/** 闭环：接口上传被挂起的付款申请（= 接口批次的疑点笔数），复核确认疑点的整改率，判定误报回流 */
function ClosureStrip({ batches }: { batches: CheckBatch[] }) {
  const user = useUser();
  const cases = useCases();
  const items = useRectified();
  const scope = scopeOrgs(user);
  const mine = cases.filter((c) => scope.includes(orgOfDoc(c.docNo)));
  const r = rectifyRate(mine, items);
  const api = batches.filter((b) => b.source === 'api');
  const apiTotal = api.reduce((a, b) => a + b.total, 0);
  const apiHold = api.reduce((a, b) => a + b.suspicious, 0);
  const rejected = mine.filter((c) => c.decision === 'reject').length;
  const tiles: { k: string; v: string; h: string; bar?: number }[] = [
    { k: '付款申请被挂起', v: fmtInt(apiHold), h: `接口上传 ${fmtInt(apiTotal)} 笔，放行 ${fmtInt(apiTotal - apiHold)} 笔` },
    { k: '复核确认疑点', v: fmtInt(r.confirmed), h: '进入核查岗待整改清单' },
    { k: '已整改', v: `${fmtInt(r.done)} / ${fmtInt(r.confirmed)}`, h: `整改率 ${fmtPct(r.rate)}`, bar: r.rate },
    { k: '判定误报', v: fmtInt(rejected), h: '回流判例库与规则调优建议' },
  ];
  return (
    <Panel anchor="cockpit-loop" title="闭环：付款挂起与疑点整改" desc="核查结论有没有落到业务里：接口上传的疑点付款申请在协同平台被挂起，复核确认的疑点在 ERP 整改；判例与整改登记为演示数据。" actions={<FormatLink k="rectify" label="整改记录" />}>
      <div className="grid grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-[14px] bg-ink-50/80 px-4 py-3">
            <div className="text-xs text-ink-500">{t.k}</div>
            <div className="num mt-0.5 text-[22px] font-semibold leading-tight text-ink-900">{t.v}</div>
            {t.bar !== undefined ? (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-pine-500 transition-[width] duration-500" style={{ width: `${Math.round(t.bar * 100)}%` }} />
              </div>
            ) : null}
            <div className="mt-1 text-2xs text-ink-400">{t.h}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
