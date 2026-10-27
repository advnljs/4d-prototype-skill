import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Empty, Input, Select, Tabs, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { BIZ_SHEET, fmtDate8 } from '@/domain/docs';
import { countryLabel } from '@/domain/countries';
import { orgByCode } from '@/domain/orgs';
import { cleanName } from '@/domain/names';
import { SCENARIOS } from '@/mock/ledger';
import { fmtAmt, fmtInt } from '@/lib/format';
import { fmtDuration } from '@/agent/pipeline';
import { inconsistentGroups } from '@/agent/batchCountry';
import { hitsByMajor, type CheckRun } from '@/rules/engine';
import { MAJORS, MAJOR_LABEL, type MajorKey, type RecordResult } from '@/rules/types';

/* ---------------- 汇总 ---------------- */

export function ResultSummary({ run, actions }: { run: CheckRun; actions?: ReactNode }) {
  const s = run.stats;
  const country = run.results.filter((r) => r.findings.some((f) => f.major === 'country')).length;
  const cps = run.ctx.batch ? inconsistentGroups(run.ctx.batch).length : 0;
  const items: { label: string; value: number; tone: string; hint?: string }[] = [
    { label: '总核查笔数', value: s.total, tone: 'text-ink-900' },
    { label: '疑点笔数', value: s.suspicious, tone: 'text-seal-600', hint: `含疑问数据 ${s.warnCount}` },
    { label: '错误数据', value: s.failCount, tone: 'text-seal-600' },
    { label: '疑问数据', value: s.warnCount, tone: 'text-amber-600', hint: '需人工确认' },
    { label: '国别疑点', value: country, tone: 'text-seal-600', hint: `国别不唯一的交易对方 ${cps} 个` },
    { label: '通过', value: s.passCount, tone: 'text-pine-600' },
    { label: '误报拦截', value: s.cleared, tone: 'text-agent-600', hint: '预筛命中、智能体排除' },
  ];
  return (
    <div className="flex items-stretch justify-between gap-6">
      <dl className="flex flex-wrap items-stretch divide-x divide-ink-100">
        {items.map((it) => (
          <div key={it.label} className="px-5 first:pl-0">
            <dt className="text-xs text-ink-500">{it.label}</dt>
            <dd className={cx('mt-0.5 text-2xl font-semibold', it.tone)}>{fmtInt(it.value)}</dd>
            {it.hint ? <dd className="text-2xs text-ink-400">{it.hint}</dd> : null}
          </div>
        ))}
      </dl>
      {actions ? <div className="flex items-end gap-2">{actions}</div> : null}
    </div>
  );
}

/** 疑点按大类分布（大类下列出命中的规则）：单系列横向条形，数值标在条端 */
export function MajorDistribution({ run }: { run: CheckRun }) {
  const byMajor = hitsByMajor(run.results);
  const majors = MAJORS.filter((m) => byMajor[m.key]).sort((a, b) => (byMajor[b.key] ?? 0) - (byMajor[a.key] ?? 0));
  const max = Math.max(1, ...majors.map((m) => byMajor[m.key] ?? 0));
  if (!majors.length) return <p className="text-sm text-ink-500">本次无疑点。</p>;
  return (
    <ul className="space-y-2.5">
      {majors.map((m) => {
        const n = byMajor[m.key] ?? 0;
        const rules = Object.entries(run.stats.ruleHits)
          .map(([id, k]) => ({ id, k, rule: run.rules.find((r) => r.id === id) }))
          .filter((x) => x.rule?.major === m.key)
          .sort((a, b) => b.k - a.k);
        return (
          <li key={m.key}>
            <div className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3" title={`${m.label}：${n} 笔（${m.ref}）`}>
              <span className={cx('truncate text-sm font-medium', m.key === 'country' ? 'text-seal-700' : 'text-ink-800')}>{m.label}</span>
              <span className="flex items-center gap-2">
                <span className={cx('h-3 rounded-r-[4px]', m.key === 'country' ? 'bg-seal-500' : 'bg-primary-400')} style={{ width: `${Math.max(2, (n / max) * 100)}%`, maxWidth: 'calc(100% - 3rem)' }} />
                <span className="num text-xs text-ink-700">{n} 笔</span>
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-[10.75rem] text-2xs text-ink-500">
              {rules.map((x) => (
                <span key={x.id}>
                  <span className="code text-ink-400">{x.id}</span> {x.rule?.name} {x.k}
                </span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** 批量 vs 逐笔在线的成本对比（同一批数据） */
export function CostCompare({ run }: { run: CheckRun }) {
  const s = run.stats;
  const onlineCalls = Math.round(s.estTokens.online / 820);
  const rows = [
    { k: '大模型调用', batch: fmtInt(s.semantic.llmCalls), online: fmtInt(onlineCalls), save: 1 - s.semantic.llmCalls / Math.max(1, onlineCalls) },
    { k: 'Token 消耗', batch: fmtInt(s.estTokens.batch), online: fmtInt(s.estTokens.online), save: 1 - s.estTokens.batch / Math.max(1, s.estTokens.online) },
    { k: '语义核查耗时', batch: fmtDuration(s.estMs.batch), online: fmtDuration(s.estMs.online), save: 1 - s.estMs.batch / Math.max(1, s.estMs.online) },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-ink-500">
          <th className="pb-1.5 font-normal">指标</th>
          <th className="pb-1.5 text-right font-normal">批量 + 语义缓存</th>
          <th className="pb-1.5 text-right font-normal">逐笔在线</th>
          <th className="pb-1.5 text-right font-normal">节省</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/[0.05]">
        {rows.map((r) => (
          <tr key={r.k}>
            <td className="py-1.5 text-ink-700">{r.k}</td>
            <td className="num py-1.5 text-right font-medium text-ink-900">{r.batch}</td>
            <td className="num py-1.5 text-right text-ink-600">{r.online}</td>
            <td className="num py-1.5 text-right text-pine-600">{Math.max(0, Math.round(r.save * 100))}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- 结果表 ---------------- */

type Filter = 'suspect' | 'fail' | 'warn' | 'pass' | 'all';

export function ResultTable({
  run,
  onOpen,
  compact,
  rowExtra,
  defaultFilter = 'suspect',
  major: majorProp,
  onMajorChange,
}: {
  run: CheckRun;
  onOpen: (r: RecordResult) => void;
  compact?: boolean;
  rowExtra?: (r: RecordResult) => ReactNode;
  defaultFilter?: Filter;
  /** 受控的大类筛选（演示光标需要从外部切换） */
  major?: MajorKey | '';
  onMajorChange?: (m: MajorKey | '') => void;
}) {
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [majorState, setMajorState] = useState<MajorKey | ''>('');
  const major = majorProp ?? majorState;
  const setMajor = (m: MajorKey | '') => (onMajorChange ? onMajorChange(m) : setMajorState(m));
  const [rule, setRule] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 15;
  const counts = useMemo(() => {
    const c = { suspect: 0, fail: 0, warn: 0, pass: 0, all: run.results.length };
    run.results.forEach((r) => {
      c[r.status]++;
      if (r.status !== 'pass') c.suspect++;
    });
    return c;
  }, [run]);
  const list = useMemo(() => {
    const kw = q.trim().toUpperCase();
    return run.results.filter(
      (r) =>
        (filter === 'all' || (filter === 'suspect' ? r.status !== 'pass' : r.status === filter)) &&
        (!major || r.findings.some((f) => f.major === major)) &&
        (!rule || r.findings.some((f) => f.ruleId === rule)) &&
        (!kw || `${r.rec.f.docNo}${r.rec.f.domesticName}${r.rec.f.counterparty}${r.rec.f.remark1}`.toUpperCase().includes(kw)),
    );
  }, [run, filter, major, rule, q]);
  const byMajor = useMemo(() => hitsByMajor(run.results), [run]);
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const rows = list.slice(cur * pageSize, cur * pageSize + pageSize);
  const hitRules = Object.keys(run.stats.ruleHits)
    .filter((id) => !major || run.rules.find((r) => r.id === id)?.major === major)
    .sort();
  const pickMajor = (m: MajorKey | '') => {
    setMajor(m);
    setRule('');
    setPage(0);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="按大类筛选">
        <span className="mr-1 text-xs text-ink-500">疑点大类</span>
        <MajorChip active={!major} label="全部" n={counts.suspect} onClick={() => pickMajor('')} />
        {MAJORS.filter((m) => byMajor[m.key]).map((m) => (
          <MajorChip key={m.key} active={major === m.key} label={m.label} n={byMajor[m.key] ?? 0} tone={m.key === 'country' ? 'seal' : undefined} onClick={() => pickMajor(m.key)} demo={`major-${m.key}`} />
        ))}
      </div>
      {major === 'country' ? <CountryGroups run={run} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs<Filter>
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setPage(0);
          }}
          items={[
            { value: 'suspect', label: '疑点', count: counts.suspect },
            { value: 'fail', label: '错误数据', count: counts.fail },
            { value: 'warn', label: '疑问数据', count: counts.warn },
            { value: 'pass', label: '通过', count: counts.pass },
            { value: 'all', label: '全部', count: counts.all },
          ]}
          className="flex-1"
        />
        <div className="flex items-center gap-2 pb-1.5">
          <div className="w-[260px]">
            <Select
              aria-label="按规则筛选"
              value={rule}
              onChange={(e) => {
                setRule(e.target.value);
                setPage(0);
              }}
            >
              <option value="">{major ? `${MAJOR_LABEL[major]}：全部规则` : '全部疑点类型'}</option>
              {hitRules.map((id) => (
                <option key={id} value={id}>
                  {id} {run.rules.find((r) => r.id === id)?.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="relative w-[260px]">
            <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input
              aria-label="搜索"
              placeholder="单据编号、名称或用途说明…"
              className="pl-8"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      {rows.length ? (
        <div className="mt-3 overflow-x-auto rounded-[14px] border border-black/[0.07]">
          <table className={cx('w-full table-fixed text-sm', rowExtra ? 'min-w-[1780px]' : 'min-w-[1660px]')}>
            <colgroup>
              <col className="w-[52px]" />
              <col className="w-[84px]" />
              <col className="w-[72px]" />
              <col className="w-[230px]" />
              <col className="w-[196px]" />
              <col className="w-[104px]" />
              <col className={compact ? 'w-[170px]' : 'w-[190px]'} />
              <col />
              <col className="w-[96px]" />
              <col className="w-[86px]" />
              <col className="w-[200px]" />
              <col className="w-[130px]" />
              {rowExtra ? <col className="w-[120px]" /> : null}
            </colgroup>
            <thead className="bg-ink-50 text-left text-xs text-ink-500">
              <tr>
                <th className="px-3 py-2 font-medium">序号</th>
                <th className="px-3 py-2 font-medium">结论</th>
                <th className="px-3 py-2 font-medium">类别</th>
                <th className="px-3 py-2 font-medium">疑点类型</th>
                <th className="px-3 py-2 font-medium">单据编号</th>
                <th className="px-3 py-2 font-medium">单据日期</th>
                <th className="px-3 py-2 font-medium">本方单位</th>
                <th className="px-3 py-2 font-medium">交易对方</th>
                <th className="px-3 py-2 font-medium">国家/地区</th>
                <th className="px-3 py-2 font-medium">类别编码</th>
                <th className="px-3 py-2 font-medium">用途说明</th>
                <th className="px-3 py-2 text-right font-medium">金额</th>
                {rowExtra ? <th className="px-3 py-2 font-medium">操作</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05] bg-surface">
              {rows.map((r, i) => {
                const sc = SCENARIOS[r.rec.key];
                return (
                  <tr
                    key={r.rec.key}
                    data-demo={`row-${r.rec.key}`}
                    tabIndex={0}
                    onClick={() => onOpen(r)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(r);
                      }
                    }}
                    className={cx('cursor-pointer align-top transition-colors hover:bg-primary-50/50 focus-visible:bg-primary-50', r.status === 'fail' && 'bg-seal-50/40')}
                  >
                    <td className="num px-3 py-2 text-ink-500">{cur * pageSize + i + 1}</td>
                    <td className="px-3 py-2">
                      {r.status === 'fail' ? <Badge tone="seal">错误</Badge> : r.status === 'warn' ? <Badge tone="amber">疑问</Badge> : <Badge tone="pine">通过</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-ink-600">{BIZ_SHEET[r.rec.biz]}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {r.findings.map((f) => (
                          <span key={f.ruleId} className={cx('truncate text-xs', f.level === 'error' ? 'text-seal-700' : 'text-amber-700')} title={`${MAJOR_LABEL[f.major]}：${f.message}`}>
                            {f.ruleName}
                          </span>
                        ))}
                        {!r.findings.length && r.cleared.length ? <span className="text-xs text-agent-600">误报已拦截</span> : null}
                        {sc ? (
                          <span className="inline-flex items-center gap-1 text-2xs text-primary-600" title={sc.story}>
                            <Icon name="compass" size={11} />
                            情景：{sc.title}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="code px-3 py-2 text-ink-800">{r.rec.f.docNo}</td>
                    <td className="num whitespace-nowrap px-3 py-2 text-ink-600">{fmtDate8(r.rec.f.docDate)}</td>
                    <td className="truncate px-3 py-2 text-ink-800" title={r.rec.f.domesticName}>
                      {r.rec.f.domesticName}
                      <div className="truncate text-2xs text-ink-400">{orgByCode(r.rec.f.orgCode)?.short ?? r.rec.f.orgCode}</div>
                    </td>
                    <td className="truncate px-3 py-2 text-ink-700" title={r.rec.f.counterparty}>
                      {r.rec.f.counterparty}
                    </td>
                    <td className="truncate px-3 py-2 text-ink-700" title={countryLabel(r.rec.f.country)}>
                      {countryLabel(r.rec.f.country)}
                    </td>
                    <td className="code px-3 py-2 text-ink-800">{r.rec.f.code1 || '—'}</td>
                    <td className="px-3 py-2 text-ink-700">
                      <span className="line-clamp-2" title={r.rec.f.remark1}>
                        {r.rec.f.remark1 || '—'}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right text-ink-800">
                      {fmtAmt(Number(r.rec.f.amount) || 0)}
                      <div className="text-2xs text-ink-400">{r.rec.f.currency}</div>
                    </td>
                    {rowExtra ? <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>{rowExtra(r)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="checkCircle" title="当前筛选条件下没有记录">
          切换上方页签或清空筛选条件查看其他记录。
        </Empty>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
        <span>
          共 {fmtInt(list.length)} 笔，点击任意一行查看单据、规则执行明细与智能体推理轨迹
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon="chevronLeft" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="上一页" />
          <span className="num px-2">
            {cur + 1} / {pages}
          </span>
          <Button size="sm" variant="ghost" icon="chevronRight" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="下一页" />
        </div>
      </div>
    </div>
  );
}

function MajorChip({ active, label, n, onClick, tone, demo }: { active: boolean; label: string; n: number; onClick: () => void; tone?: 'seal'; demo?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-demo={demo}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
        active ? (tone === 'seal' ? 'bg-seal-600 text-white' : 'bg-ink-900 text-white') : tone === 'seal' ? 'bg-seal-50 text-seal-700 hover:bg-seal-100' : 'bg-black/[0.05] text-ink-700 hover:bg-black/[0.08]',
      )}
    >
      {label}
      <span className={cx('num', active ? 'text-white/80' : 'text-ink-500')}>{n}</span>
    </button>
  );
}

/** 国别大类：按交易对方归组，展示本批次（三类单据合并）的国别分布与建议国别 */
export function CountryGroups({ run }: { run: CheckRun }) {
  const idx = run.ctx.batch;
  const groups = idx ? inconsistentGroups(idx) : [];
  const excluded = idx ? idx.groups.filter((g) => g.exclude && g.countries.length > 1) : [];
  const vetoes = idx ? idx.merges.filter((m) => m.decision === 'keep-apart') : [];
  const recs = (keys: string[]) => run.results.filter((r) => keys.includes(r.rec.key));
  if (!idx) return <p className="mb-3 text-sm text-ink-500">本区域规则库未启用批次级国别规则。</p>;
  return (
    <div data-flow-anchor="country-groups" className="mb-4 rounded-[14px] bg-seal-50/50 px-4 py-3 ring-1 ring-seal-100">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-ink-900">同一批次同一交易对方国别应唯一（三类单据合并核查）</h4>
        <span className="text-2xs text-ink-500">
          境外往来记录 {fmtInt(idx.counted)} 笔 · 交易对方 {fmtInt(idx.groups.length)} 个 · 国别不唯一 {groups.length} 个
        </span>
      </div>
      {groups.length ? (
        <ul className="mt-2 grid grid-cols-2 gap-2">
          {groups.map((g) => {
            const all = g.variants.flatMap((v) => Object.values(v.countries).flat());
            const bizs = [...new Set(recs(all).map((r) => BIZ_SHEET[r.rec.biz]))];
            return (
              <li key={g.id} className="rounded-[12px] bg-white px-3 py-2.5 ring-1 ring-black/[0.05]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink-900" title={g.name}>
                    {g.name}
                  </span>
                  {g.majority ? <Badge tone="pine">建议 {countryLabel(g.majority)}</Badge> : <Badge tone="amber">平局，需人工确认</Badge>}
                </div>
                <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                  {g.countries.map(([c, n], i) => (
                    <span key={c} className={i === 0 && g.majority ? 'bg-pine-500' : 'bg-seal-500'} style={{ width: `${(n / g.total) * 100}%` }} />
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-2xs text-ink-600">
                  {g.countries.map(([c, n]) => (
                    <span key={c}>
                      {countryLabel(c)} <span className="num">{n}</span> 笔
                    </span>
                  ))}
                  <span className="text-ink-400">· 涉及{bizs.join('、')}</span>
                </div>
                {g.variants.length > 1 ? (
                  <div className="mt-1 text-2xs text-ink-500" title={g.variants.map((v) => v.raw).join('\n')}>
                    写法 {g.variants.length} 种：{g.variants.map((v) => cleanName(v.raw) === g.name ? v.raw.replace(/;.*/, '') : v.raw).slice(0, 2).join(' / ')}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-600">本批次没有国别不唯一的交易对方。</p>
      )}
      {excluded.length || vetoes.length ? (
        <p className="mt-2 text-2xs leading-relaxed text-agent-700">
          <Icon name="sparkle" size={11} className="mr-1 inline" />
          智能体复核：{excluded.map((g) => `${g.name}（${g.exclude!.kind === 'platform' ? '平台按站点多国收付' : '名称无识别性'}）`).join('、')}
          {excluded.length && vetoes.length ? '；' : ''}
          {vetoes.map((m) => `“${m.a}”与“${m.b}”字面相似但判定为不同主体`).join('；')}，不计为国别疑点。
        </p>
      ) : null}
    </div>
  );
}
