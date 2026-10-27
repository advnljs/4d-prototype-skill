import { useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Callout, Empty, Field, Input, Panel, Select, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/Toast';
import { MajorDistribution, ResultSummary, ResultTable } from '@/components/check/ResultViews';
import { RecordDrawer } from '@/components/check/RecordDrawer';
import { SecrecyModal } from '@/components/check/SecrecyModal';
import { FormatLink } from '@/components/flow/DataObject';
import { BIZ_SHEET } from '@/domain/docs';
import { ORGS, USERS, orgByCode, scopeOrgs } from '@/domain/orgs';
import { SOURCE_LABEL } from '@/mock/batches';
import { batchResultXlsx, downloadBytes } from '@/lib/exporters';
import { fmtInt, fmtPct } from '@/lib/format';
import { MAJORS, MAJOR_LABEL, LEVEL_LABEL, type MajorKey, type RecordResult } from '@/rules/types';
import { addCase, casebookStore, useCases, type CaseEntry } from '@/state/casebook';
import { orgOfDoc, rectify, rectifyActionOf, rectifyStore, useRectified } from '@/state/closure';
import { TODAY } from '@/state/context';
import { batchFindings, batchRun, libLabelOf, orgLabel, useAllBatches, visibleBatches, type CheckBatch } from '@/state/results';
import { portalCookie, useUser } from '@/state/session';
import { useFlowStep } from '@/flow/director';
import { dateTime } from '@/lib/format';

const PAGE = 12;

/**
 * 核查结果：每次核查（界面上传 / RPA 接口上传）保存为一个批次。
 * 系统集成：统一认证带入工号 → doc_user_org → 可见范围（子公司看本公司 / 区域看辖内 / 集团看全部）。
 */
export function ResultsPage() {
  const user = useUser();
  const all = useAllBatches();
  const visible = useMemo(() => visibleBatches(all, user), [all, user]);
  const scope = scopeOrgs(user);
  const [org, setOrg] = useState('');
  const [source, setSource] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [countryOnly, setCountryOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);
  const list = visible.filter(
    (b) =>
      (!org || b.orgCode === org || orgByCode(b.orgCode)?.parent === org) &&
      (!source || b.source === source) &&
      (!from || b.time.slice(0, 10) >= from) &&
      (!to || b.time.slice(0, 10) <= to) &&
      (!countryOnly || b.countryRecs > 0),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const sel = selId ? all.find((b) => b.id === selId) ?? null : null;
  const kpi = useMemo(() => {
    const total = list.reduce((s, b) => s + b.total, 0);
    const sus = list.reduce((s, b) => s + b.suspicious, 0);
    return { batches: list.length, total, sus, rate: total ? sus / total : 0, country: list.reduce((s, b) => s + b.countryRecs, 0), api: list.filter((b) => b.source === 'api').length };
  }, [list]);
  const scopeText = user.role === 'tier1' ? `全集团 ${ORGS.filter((o) => o.level === 'tier2').length} 个区域及所辖子公司` : user.role === 'tier2' ? `${orgLabel(user.orgCode)}及辖内 ${scope.length - 1} 个子公司` : `本公司（${orgLabel(user.orgCode)}）`;
  const orgOptions = ORGS.filter((o) => scope.includes(o.code) && (user.role !== 'tier1' || o.level !== 'sub'));

  const [major, setMajor] = useState<MajorKey | ''>('');
  const open = (id: string) => {
    setSelId(id);
    setMajor('');
    window.setTimeout(() => document.getElementById('batch-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  /* ---------- 全流程演示 ---------- */
  const [drawer, setDrawer] = useState<RecordResult | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // 复核岗：打开本公司最新一批 → 国别大类 → 打开国别疑点 → 确认疑点
  useFlowStep('review', (c) => {
    const pickBatch = visibleRef.current.find((b) => b.source === 'ui' && b.countryRecs > 0) ?? visibleRef.current[0];
    if (!pickBatch) {
      c.done();
      return;
    }
    setOrg('');
    setSource('');
    setCountryOnly(false);
    setPage(0);
    c.sub(0);
    c.hover('[data-flow-anchor="results-list"]');
    c.later(2200, () => c.click(`[data-demo="batch-${pickBatch.id}"]`, () => open(pickBatch.id)));
    c.later(4200, () => {
      c.sub(1);
      c.hover('[data-flow-anchor="batch-detail"]');
    });
    c.later(6600, () => {
      c.sub(2);
      c.click('[data-demo="major-country"]', () => setMajor('country'));
    });
    c.later(9200, () => {
      const run = batchRun(pickBatch);
      const rec = run?.results.find((r) => r.findings.some((f) => f.ruleId === 'R405' || f.ruleId === 'R406')) ?? run?.results.find((r) => r.findings.some((f) => f.major === 'country'));
      if (!rec) return;
      c.sub(3);
      c.click(`[data-demo="row-${rec.rec.key}"]`, () => setDrawer(rec));
      c.later(2400, () => c.hover('[data-flow-anchor="drawer-trace"]'));
      c.later(5600, () => {
        c.sub(4);
        const f = rec.findings.find((x) => x.major === 'country')!;
        c.click(`[data-demo="confirm-${f.ruleId}"]`, () => {
          addCase(rec, f, 'confirm', `${user.name}（${user.empNo}）`, dateTime(new Date(TODAY.getTime() + (Date.now() % 3600000))));
          toast('success', '已确认疑点', '结论进入判例库');
        });
      });
      c.later(8200, () => c.click('[data-demo="drawer-close"]', () => setDrawer(null)));
      c.later(9400, () => c.done());
    });
    return () => setDrawer(null);
  });

  // 核查岗：复核确认的疑点 → 在 ERP 整改并登记 → 整改状态回传
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const pendingCases = () => casebookStore.get().cases.filter((x) => x.decision === 'confirm' && scopeRef.current.includes(orgOfDoc(x.docNo)) && !rectifyStore.get().items.some((i) => i.caseId === x.id));
  useFlowStep('rectify', (c) => {
    setSelId(null);
    // 自备上游：本公司还没有待整改的确认疑点时，用演示批次里的国别疑点补一条（与复核环节的同一条），复核人记为演示复核岗
    if (!pendingCases().length) {
      const b = visibleRef.current.find((x) => x.source === 'ui' && x.countryRecs > 0) ?? visibleRef.current[0];
      const rec = b ? batchRun(b)?.results.find((r) => r.findings.some((f) => f.major === 'country')) : undefined;
      const f = rec?.findings.find((x) => x.major === 'country');
      if (rec && f) addCase(rec, f, 'confirm', `${USERS.reviewer.name}（${USERS.reviewer.empNo}）`, dateTime(new Date(TODAY.getTime() + (Date.now() % 3600000))));
    }
    c.sub(0);
    c.hover('[data-flow-anchor="rectify-list"]');
    c.later(2600, () => {
      const t = pendingCases()[0];
      if (!t) {
        c.done();
        return;
      }
      c.sub(1);
      c.click(`[data-demo="rectify-${t.id}"]`, () => {
        rectify(t, `${user.name}（${user.empNo}）`, dateTime(new Date(TODAY.getTime() + 5400000 + (Date.now() % 600000))));
        toast('success', '已登记整改', rectifyActionOf(t.ruleId));
      });
      c.later(2600, () => {
        c.sub(2);
        c.hover('[data-flow-anchor="rectify-list"]');
      });
      c.later(4800, () => c.done());
    });
  });

  // 区域：统一认证身份 → 辖内范围 → 打开某子公司的接口上传批次
  useFlowStep('branch-view', (c) => {
    setOrg('');
    setSource('');
    setCountryOnly(false);
    setPage(0);
    setSelId(null);
    c.sub(0);
    c.hover('[data-flow-anchor="scope-note"]');
    c.later(2400, () => {
      c.sub(1);
      c.hover('[data-flow-anchor="results-list"]');
    });
    c.later(4800, () => {
      const b = visibleRef.current.slice(0, PAGE).find((x) => x.orgCode !== user.orgCode && x.source === 'api' && x.suspicious > 0) ?? visibleRef.current.find((x) => x.orgCode !== user.orgCode);
      if (!b) return c.done();
      c.sub(2);
      c.click(`[data-demo="batch-${b.id}"]`, () => open(b.id));
      c.later(2600, () => c.hover('[data-flow-anchor="batch-detail"]'));
      c.later(5200, () => c.done());
    });
  });

  return (
    <>
      <PageHeader
        title="核查结果"
        crumbs={['单据智能核查', '核查结果']}
        desc="保存每一次核查（界面上传与 RPA 接口上传）的批次、统计与疑点明细。查看范围由统一认证身份决定：子公司岗位看本公司，区域看辖内全部，集团看全集团。"
      />
      <div className="space-y-6 px-10 py-7">
        <div data-flow-anchor="scope-note" className="flex flex-wrap items-center gap-2 rounded-[14px] bg-primary-50/70 px-4 py-2.5 text-sm text-primary-800 ring-1 ring-primary-100">
          <Icon name="link" size={15} />
          系统集成：统一认证 <span className="code text-xs">{portalCookie(user.empNo)}</span> → doc_user_org → {user.name}（{user.roleName}，{orgLabel(user.orgCode)}）→ 可见范围：<b className="font-semibold">{scopeText}</b>
        </div>

        <Panel anchor="results-list" title={`核查批次（${fmtInt(list.length)}）`} desc="点击批次查看疑点明细；历史批次为演示种子，本机核查的批次排在最前。" actions={<FormatLink k="batchRecord" label="批次表结构" />}>
          <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto_auto] items-end gap-3">
            {user.role === 'checker' || user.role === 'reviewer' ? (
              <Field label="组织">
                <div className="flex h-9 items-center text-sm text-ink-700">{orgLabel(user.orgCode)}</div>
              </Field>
            ) : (
              <Field label={user.role === 'tier1' ? '区域' : '组织'} htmlFor="r-org">
                <Select
                  id="r-org"
                  value={org}
                  onChange={(e) => {
                    setOrg(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">全部</option>
                  {orgOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="来源" htmlFor="r-src">
              <Select
                id="r-src"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">全部</option>
                <option value="ui">界面上传</option>
                <option value="api">接口上传（RPA）</option>
              </Select>
            </Field>
            <Field label="核查日期起" htmlFor="r-from">
              <Input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="核查日期止" htmlFor="r-to">
              <Input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={countryOnly} onChange={(e) => setCountryOnly(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-500)]" />
              只看有国别疑点
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                setOrg('');
                setSource('');
                setFrom('');
                setTo('');
                setCountryOnly(false);
              }}
            >
              重置
            </Button>
          </div>
          <dl className="mt-4 flex flex-wrap divide-x divide-ink-100 rounded-[12px] bg-ink-50/70 px-4 py-2.5">
            {[
              ['批次', fmtInt(kpi.batches)],
              ['核查笔数', fmtInt(kpi.total)],
              ['疑点笔数', fmtInt(kpi.sus)],
              ['疑点率', fmtPct(kpi.rate)],
              ['国别疑点', fmtInt(kpi.country)],
              ['接口上传批次', fmtInt(kpi.api)],
            ].map(([k, v]) => (
              <div key={k} className="px-4 first:pl-0">
                <dt className="text-2xs text-ink-500">{k}</dt>
                <dd className="num text-lg font-semibold text-ink-900">{v}</dd>
              </div>
            ))}
          </dl>
          {rows.length ? (
            <div className="mt-3 overflow-x-auto rounded-[14px] border border-black/[0.07]">
              <table className="w-full min-w-[1180px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[176px]" />
                  <col className="w-[132px]" />
                  <col className="w-[120px]" />
                  <col className="w-[128px]" />
                  <col className="w-[84px]" />
                  <col />
                  <col className="w-[230px]" />
                  <col className="w-[64px]" />
                  <col className="w-[84px]" />
                  <col className="w-[196px]" />
                </colgroup>
                <thead className="bg-ink-50 text-left text-xs text-ink-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 font-medium">批次号</th>
                    <th className="px-3 py-2 font-medium">核查时间</th>
                    <th className="px-3 py-2 font-medium">组织</th>
                    <th className="px-3 py-2 font-medium">操作人</th>
                    <th className="px-3 py-2 font-medium">来源</th>
                    <th className="px-3 py-2 font-medium">文件</th>
                    <th className="px-3 py-2 font-medium">三类笔数</th>
                    <th className="px-3 py-2 text-right font-medium">疑点</th>
                    <th className="px-3 py-2 text-right font-medium">国别疑点</th>
                    <th className="px-3 py-2 font-medium">规则库</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] bg-surface">
                  {rows.map((b) => (
                    <tr
                      key={b.id}
                      data-demo={`batch-${b.id}`}
                      tabIndex={0}
                      onClick={() => open(b.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          open(b.id);
                        }
                      }}
                      className={cx('cursor-pointer transition-colors hover:bg-primary-50/50 focus-visible:bg-primary-50', sel?.id === b.id && 'bg-primary-50/70')}
                    >
                      <td className="code px-3 py-2 text-ink-800">
                        {b.id}
                        {!b.seed ? <Badge tone="primary" className="ml-1.5">本机</Badge> : null}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-ink-600">{b.time.slice(0, 16)}</td>
                      <td className="truncate px-3 py-2 text-ink-800">{orgLabel(b.orgCode)}</td>
                      <td className="truncate px-3 py-2 text-ink-700" title={b.empNo}>
                        {b.userName}
                      </td>
                      <td className="px-3 py-2">{b.source === 'api' ? <Badge tone="amber" icon="robot">接口</Badge> : <Badge>界面</Badge>}</td>
                      <td className="truncate px-3 py-2 text-xs text-ink-600" title={b.fileName}>
                        {b.fileName}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-2 text-xs text-ink-600">{b.sheets.map((x) => `${BIZ_SHEET[x.biz]} ${x.rows}`).join(' / ')}</td>
                      <td className="num px-3 py-2 text-right text-seal-700">{b.suspicious}</td>
                      <td className={cx('num px-3 py-2 text-right', b.countryRecs ? 'text-seal-700' : 'text-ink-400')}>{b.countryRecs}</td>
                      <td className="truncate px-3 py-2 text-xs text-ink-600">{libLabelOf(b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="inbox" title="没有符合条件的批次">
              调整筛选条件，或到“一键核查”上传数据。
            </Empty>
          )}
          <div className="mt-3 flex items-center justify-end gap-1 text-xs text-ink-500">
            <Button size="sm" variant="ghost" icon="chevronLeft" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="上一页" />
            <span className="num px-2">
              {cur + 1} / {pages}
            </span>
            <Button size="sm" variant="ghost" icon="chevronRight" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="下一页" />
          </div>
        </Panel>

        {sel ? <BatchDetail key={sel.id} b={sel} major={major} onMajor={setMajor} onOpen={setDrawer} /> : null}

        <RectifyPanel scope={scope} canRectify={user.role === 'checker'} who={`${user.name}（${user.empNo}）`} />
      </div>
      <BatchDrawer b={sel} res={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

function BatchDrawer({ b, res, onClose }: { b: CheckBatch | null; res: RecordResult | null; onClose: () => void }) {
  const run = b ? batchRun(b) : undefined;
  if (!run) return null;
  return <RecordDrawer res={res} rules={run.rules} ctx={run.ctx} onClose={onClose} />;
}

function BatchDetail({ b, major, onMajor, onOpen }: { b: CheckBatch; major: MajorKey | ''; onMajor: (m: MajorKey | '') => void; onOpen: (r: RecordResult) => void }) {
  const run = useMemo(() => batchRun(b), [b]);
  const [exportOpen, setExportOpen] = useState(false);
  const meta = { batchId: b.id, time: b.time, lib: libLabelOf(b), empNo: b.empNo, source: SOURCE_LABEL[b.source] };
  return (
    <Panel
      id="batch-detail"
      anchor="batch-detail"
      title={`批次 ${b.id}：${orgLabel(b.orgCode)} · ${b.userName}`}
      desc={`${b.fileName} · ${SOURCE_LABEL[b.source]} · 核查时间 ${b.time} · ${libLabelOf(b)} · 结果文件 ${b.reportName}`}
      actions={
        <Button
          variant="primary"
          icon="download"
          onClick={() => {
            if (run) setExportOpen(true);
            else toast('info', '原始明细未留存', '刷新页面后本机批次只保留疑点明细；可重新上传核查生成结果文件');
          }}
        >
          下载结果文件
        </Button>
      }
    >
      {run ? (
        <>
          <ResultSummary run={run} />
          <div className="mt-5 grid grid-cols-12 gap-8 border-t border-black/[0.05] pt-4">
            <div className="col-span-12">
              <h3 className="mb-3 text-sm font-semibold text-ink-900">疑点大类分布（笔，国别为一个大类）</h3>
              <MajorDistribution run={run} />
            </div>
          </div>
          <div className="mt-5 border-t border-black/[0.05] pt-4">
            <ResultTable run={run} onOpen={onOpen} major={major} onMajorChange={onMajor} />
          </div>
          <SecrecyModal
            open={exportOpen}
            fileName={b.reportName}
            rows={b.suspicious}
            onCancel={() => setExportOpen(false)}
            onConfirm={() => {
              downloadBytes(batchResultXlsx(run.results, run.ctx.batch, meta), b.reportName);
              setExportOpen(false);
              toast('download', '已重新导出', b.reportName);
            }}
          />
        </>
      ) : (
        <FindingList b={b} />
      )}
    </Panel>
  );
}

/** 刷新后本机批次只剩疑点明细（不留存原始记录）：按大类列出 */
function FindingList({ b }: { b: CheckBatch }) {
  const rows = batchFindings(b);
  const [major, setMajor] = useState<MajorKey | ''>('');
  const shown = rows.filter((r) => !major || r.major === major);
  return (
    <div>
      <Callout tone="neutral" icon="lock" title="原始单据明细未留存">
        为保护客商信息，刷新页面后本机批次只保留疑点明细（单据编号、规则、说明）；需要单据详情请重新上传核查。
      </Callout>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!major} onClick={() => setMajor('')} className={cx('h-7 rounded-full px-3 text-xs', !major ? 'bg-ink-900 text-white' : 'bg-black/[0.05] text-ink-700')}>
          全部 {rows.length}
        </button>
        {MAJORS.filter((m) => rows.some((r) => r.major === m.key)).map((m) => (
          <button key={m.key} type="button" aria-pressed={major === m.key} onClick={() => setMajor(m.key)} className={cx('h-7 rounded-full px-3 text-xs', major === m.key ? 'bg-ink-900 text-white' : 'bg-black/[0.05] text-ink-700')}>
            {m.label} {rows.filter((r) => r.major === m.key).length}
          </button>
        ))}
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th className="py-1.5 font-normal">单据编号</th>
            <th className="py-1.5 font-normal">类别</th>
            <th className="py-1.5 font-normal">大类</th>
            <th className="py-1.5 font-normal">疑点类型</th>
            <th className="py-1.5 font-normal">说明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05]">
          {shown.map((r, i) => (
            <tr key={`${r.docNo}-${r.ruleId}-${i}`} className="align-top">
              <td className="code py-1.5 pr-3 text-ink-800">{r.docNo}</td>
              <td className="py-1.5 pr-3 text-ink-600">{BIZ_SHEET[r.biz]}</td>
              <td className="py-1.5 pr-3 text-ink-600">{MAJOR_LABEL[r.major]}</td>
              <td className={cx('py-1.5 pr-3', r.level === 'error' ? 'text-seal-700' : 'text-amber-700')}>
                {r.ruleName}（{LEVEL_LABEL[r.level]}）
              </td>
              <td className="py-1.5 text-ink-700">{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 复核确认的疑点 → 核查岗在 ERP 整改并登记；整改率计入驾驶舱 */
function RectifyPanel({ scope, canRectify, who }: { scope: string[]; canRectify: boolean; who: string }) {
  const cases = useCases();
  const done = useRectified();
  const list = cases.filter((c) => c.decision === 'confirm' && scope.includes(orgOfDoc(c.docNo)));
  const doneOf = (c: CaseEntry) => done.find((x) => x.caseId === c.id);
  const n = list.filter(doneOf).length;
  return (
    <Panel
      anchor="rectify-list"
      title={`复核确认的疑点 · 整改（${n}/${list.length}）`}
      desc="复核岗确认的疑点进入核查岗的待整改清单：在 ERP 中更正单据后登记整改，整改率计入驾驶舱。判定为误报的不需要整改，回流判例库。"
      actions={<FormatLink k="rectify" label="整改记录" />}
      bodyClassName="p-0"
    >
      {list.length ? (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[200px]" />
            <col />
            <col className="w-[200px]" />
            <col className="w-[300px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="bg-ink-50 text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">单据编号</th>
              <th className="px-3 py-2 font-medium">疑点</th>
              <th className="px-3 py-2 font-medium">复核确认</th>
              <th className="px-3 py-2 font-medium">整改</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {list.map((c) => {
              const d = doneOf(c);
              return (
                <tr key={c.id} className={d ? undefined : 'bg-amber-50/40'}>
                  <td className="code px-4 py-2 text-xs text-ink-700">{c.docNo}</td>
                  <td className="truncate px-3 py-2 text-ink-800" title={c.ruleName}>
                    <span className="code mr-1.5 text-xs text-ink-500">{c.ruleId}</span>
                    {c.ruleName}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-600">
                    {c.who.replace(/（.*）/, '')} · {c.at.slice(5)}
                  </td>
                  <td className="px-3 py-2 text-xs">{d ? <span className="text-pine-700">{d.action}（{d.who.replace(/（.*）/, '')} · {d.at.slice(5)}）</span> : <span className="font-medium text-amber-700">待整改</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {d ? (
                      <Badge tone="pine" icon="checkCircle">
                        已整改
                      </Badge>
                    ) : canRectify ? (
                      <Button size="sm" variant="primary" data-demo={`rectify-${c.id}`} onClick={() => rectify(c, who, dateTime(new Date(TODAY.getTime() + 5400000 + (Date.now() % 600000))))}>
                        登记整改
                      </Button>
                    ) : (
                      <span className="text-xs text-ink-400">由核查岗整改</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="px-5 py-5 text-sm text-ink-500">当前范围内还没有复核确认的疑点。</p>
      )}
    </Panel>
  );
}
