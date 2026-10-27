import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Callout, Drawer, Empty, EngineTag, Field, Input, Panel, Select, Switch, Tabs, Textarea, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/Toast';
import { TraceTimeline } from '@/components/check/TraceTimeline';
import { PipelineView, PlayerControls, useRunPlayer } from '@/components/check/RunViews';
import { FormatLink } from '@/components/flow/DataObject';
import { NecessityTag } from '@/components/flow/ActorChip';
import { useCases, type CaseEntry } from '@/state/casebook';
import { BIZ_SHEET, type BizType, type DocRecord } from '@/domain/docs';
import { ORGS, PERMS, USER_ORG, USERS, orgByCode, ruleLibOrgOf, scopeOrgs } from '@/domain/orgs';
import { runChecks } from '@/rules/engine';
import { MAJORS, MAJOR_LABEL, REF_DOC_LABEL, type MajorKey, type RuleDef } from '@/rules/types';
import { mockLedger } from '@/mock/ledger';
import { POLICIES, type PolicyDoc } from '@/mock/policies';
import { EXAMPLES, proposeChanges, type NlProposal } from '@/agent/ruleAuthor';
import type { Stage } from '@/agent/pipeline';
import { setQuery, useRoute } from '@/lib/router';
import { buildContext } from '@/state/context';
import { CHANGE_LABEL, POOL_MAP, RULE_POOL, libName, libParams, libRules, publishVersion, useRuleLib, type LibVersion, type RuleChange, type RuleLib } from '@/state/ruleLibs';
import { useCan, useUser } from '@/state/session';
import { useFlow, useFlowStep } from '@/flow/director';
import { STEPS } from '@/flow/workflow';
import { ORG_SYNC } from '@/mock/orgSync';
import { useStore } from '@/lib/store';
import { ruleLibStore } from '@/state/ruleLibs';

type Tab = 'catalog' | 'nl' | 'versions' | 'policy' | 'users';

/** 上线前校准建议（示意）：原型未接入真实数据，以下为用历史数据回放时需要重点关注的口径 */
const CALIBRATION: Record<string, string> = {
  R601: '时限判断依赖“银行流水号日期 = 到账日期”的推断。建议上线前用一个月历史单据回放，确认命中率合理后再作为错误数据启用。',
  R301: '取整差额多来自线上付款申请的手工录入，可在供应商协同平台录入端限制金额精度，从源头减少。',
  R403: '只有法律形式后缀等弱线索时只给出“需人工确认”；建议首期以疑问数据呈现，积累判例后再调整。',
  R505: '授权门槛与审批单号格式以集团授权手册为准；“先付款后补审批”的情形可在复核时判定误报并回流判例库。',
  R303: '“扣费另收”与“扣费从款项中扣收”两种口径都视为合理；如集团统一口径，可收紧为一种。',
  R101: '同一中类内的细分差异（如管理咨询与检验检测）降为提示，适合作为人工复核候选。',
  R102: '笼统词表需要与业务共同维护：“快递费”“诉讼费”这类短但明确的用途不应判为笼统。',
};

/** 演示数据：三类台账合并为一个批次（与一键核查的演示文件一致） */
function demoRecords(): DocRecord[] {
  return (['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b));
}

/** 在演示数据上回放本区域规则库（含停用规则，便于查看停用的影响） */
function useReplay(lib: RuleLib) {
  return useMemo(() => {
    const run = runChecks(demoRecords(), libRules(lib, { includeDisabled: true }), buildContext(libParams(lib)));
    const ex = new Map<string, { rec: DocRecord; msg: string }[]>();
    for (const r of run.results)
      for (const f of r.findings) {
        const list = ex.get(f.ruleId) ?? [];
        if (list.length < 4) list.push({ rec: r.rec, msg: f.message });
        ex.set(f.ruleId, list);
      }
    return { hits: run.stats.ruleHits, examples: ex };
  }, [lib]);
}

/** 一条变更在演示数据上的影响：该规则变更前后的命中笔数 */
function impactOf(c: RuleChange, lib: RuleLib): { before: number; after: number } | null {
  const def = POOL_MAP.get(c.ruleId);
  if (!def) return null;
  const recs = demoRecords();
  const count = (enabled: boolean, params: Record<string, number | string>, level = def.level) => {
    if (!enabled) return 0;
    const run = runChecks(recs, [{ ...def, level }], buildContext({ ...libParams(lib), [def.id]: params }));
    return run.stats.ruleHits[def.id] ?? 0;
  };
  const it = lib.items[c.ruleId];
  const before = it ? count(it.enabled, it.params, it.level) : 0;
  const nextParams = { ...(it?.params ?? Object.fromEntries((def.params ?? []).map((p) => [p.key, p.value]))), ...(c.patch.params ?? {}) };
  const enabled = c.patch.enabled ?? (c.patch.add ? true : it?.enabled ?? false);
  return { before, after: count(enabled, nextParams, c.patch.level ?? it?.level) };
}

export function RuleLibrary() {
  const { query } = useRoute();
  const tab = (query.get('tab') as Tab) || 'catalog';
  const user = useUser();
  const ownLib = ruleLibOrgOf(user.empNo) ?? user.orgCode;
  // 集团可查看各区域规则库（只读）；其余岗位只看本区域
  const [viewOrg, setViewOrg] = useState<string | null>(null);
  const libOrg = user.role === 'tier1' && viewOrg ? viewOrg : ownLib;
  const lib = useRuleLib(libOrg);
  const canEdit = PERMS.ruleMaintain[user.role] && libOrg === ownLib;
  const [open, setOpen] = useState<RuleDef | null>(null);
  const libOrgs = ORGS.filter((o) => o.level !== 'sub');
  return (
    <>
      <PageHeader
        title="核查规则库"
        crumbs={['单据智能核查', '核查规则库']}
        desc="每个区域自行维护一套规则库：集团与各区域独立启停、调参、改类别、新增规则，可用自然语言维护，每次更新生成新版本并记录变更。核查时按当前用户工号匹配所属区域的规则库，三类单据共用。"
        actions={
          <span className="flex items-center gap-2">
            {user.role === 'tier1' ? (
              <Select aria-label="查看规则库" value={libOrg} onChange={(e) => setViewOrg(e.target.value === ownLib ? null : e.target.value)} className="w-[200px]">
                {libOrgs.map((o) => (
                  <option key={o.code} value={o.code}>
                    {libName(o.code)}
                    {o.code === ownLib ? '（本区域）' : ''}
                  </option>
                ))}
              </Select>
            ) : null}
            <span className="flex items-center gap-2 rounded-md border border-pine-100 bg-pine-50 px-3 py-1.5 text-xs text-pine-700">
              <Icon name="checkCircle" size={14} />
              {libName(libOrg)} {lib.version}
              {canEdit ? '（本区域，可维护）' : '（只读）'}
            </span>
          </span>
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={(v) => setQuery({ tab: v })}
          items={[
            { value: 'catalog', label: '规则目录', count: Object.keys(lib.items).length },
            { value: 'nl', label: '自然语言维护' },
            { value: 'versions', label: '版本与变更', count: lib.versions.length },
            { value: 'policy', label: 'AI 解读制度文件' },
            { value: 'users', label: '用户与规则库' },
          ]}
        />
      </PageHeader>
      <div className="px-10 py-7">
        {tab === 'catalog' ? (
          <Catalog lib={lib} canEdit={canEdit} onOpen={setOpen} />
        ) : tab === 'nl' ? (
          <NlTab lib={lib} canEdit={canEdit} onOpen={(id) => setOpen(POOL_MAP.get(id) ?? null)} />
        ) : tab === 'versions' ? (
          <VersionsTab lib={lib} />
        ) : tab === 'policy' ? (
          <PolicyTab onOpen={(id) => setOpen(POOL_MAP.get(id) ?? null)} />
        ) : (
          <UsersTab />
        )}
      </div>
      <RuleDrawer rule={open} lib={lib} canEdit={canEdit} onClose={() => setOpen(null)} />
    </>
  );
}

const refText = (r: RuleDef['refs'][number]) => `${r.doc === 'policy' ? '制度 ' : r.doc === 'manual' ? '手册 ' : ''}${r.no ?? REF_DOC_LABEL[r.doc]}`;

/* ================= 规则目录 ================= */

function Catalog({ lib, canEdit, onOpen }: { lib: RuleLib; canEdit: boolean; onOpen: (r: RuleDef) => void }) {
  const user = useUser();
  const replay = useReplay(lib);
  const [major, setMajor] = useState<MajorKey | ''>('');
  const [engine, setEngine] = useState('');
  const [biz, setBiz] = useState('');
  const [q, setQ] = useState('');
  const rules = libRules(lib, { includeDisabled: true });
  const list = rules.filter((r) => (!major || r.major === major) && (!engine || r.engine === engine) && (!biz || r.biz.includes(biz as BizType)) && (!q || `${r.id}${r.name}${r.desc}`.includes(q.trim())));
  const unused = RULE_POOL.filter((r) => !lib.items[r.id]);
  const who = `${user.name}（${user.empNo}）`;

  return (
    <div className="grid grid-cols-[248px_minmax(0,1fr)] gap-6">
      <nav aria-label="规则大类" className="space-y-1">
        <CatButton active={!major} onClick={() => setMajor('')} label="全部规则" n={rules.length} />
        {MAJORS.map((m) => (
          <CatButton key={m.key} active={major === m.key} onClick={() => setMajor(m.key)} label={m.label} n={rules.filter((r) => r.major === m.key).length} />
        ))}
        <div className="mt-4 rounded-[14px] border border-black/[0.07] bg-surface p-3.5 text-xs leading-relaxed text-ink-600">
          <div className="mb-1.5 font-semibold text-ink-800">大类口径</div>
          参照（虚构的）《资金收付管理制度（2026 版）》第二至五章的结构：及时性、完整性、收付方向、国家/地区、交易对方、币种金额账户、往来类型、款项性质、审批与合同、类别与用途。
          <div className="mb-1 mt-3 font-semibold text-ink-800">当前角色</div>
          {canEdit ? `${user.roleName}：可维护本区域规则库（启停、参数、类别、自然语言维护），集团制度刚性规则不可停用。` : user.role === 'tier1' ? '集团：查看其他区域规则库为只读。' : `${user.roleName}：只读查看本区域适用的规则。`}
        </div>
      </nav>
      <Panel
        anchor="lib-catalog"
        title={major ? `${MAJOR_LABEL[major]}` : '全部规则'}
        desc={major ? `${MAJORS.find((m) => m.key === major)!.ref}。${MAJORS.find((m) => m.key === major)!.desc}` : '点击任意规则查看说明、依据（资金收付管理制度条款 / 填写规范手册章节）、AI 生成的逻辑代码、回放与变更记录。'}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-[160px]">
              <Select aria-label="执行方式" value={engine} onChange={(e) => setEngine(e.target.value)}>
                <option value="">全部执行方式</option>
                <option value="code">确定性规则</option>
                <option value="agent">智能体判断</option>
                <option value="hybrid">规则预筛 + 智能体</option>
              </Select>
            </div>
            <div className="w-[130px]">
              <Select aria-label="适用单据" value={biz} onChange={(e) => setBiz(e.target.value)}>
                <option value="">三类单据</option>
                <option value="receipt">收款</option>
                <option value="payment">付款</option>
                <option value="settlement">进口结算单</option>
              </Select>
            </div>
            <div className="w-[180px]">
              <Input aria-label="搜索规则" placeholder="编号或名称…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <FormatLink k="ruleLib" label="规则记录结构" />
          </div>
        }
        bodyClassName="p-0"
      >
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[66px]" />
            <col />
            <col className="w-[150px]" />
            <col className="w-[72px]" />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
            <col className="w-[180px]" />
            <col className="w-[84px]" />
            <col className="w-[64px]" />
          </colgroup>
          <thead className="bg-ink-50 text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">编号</th>
              <th className="px-3 py-2 font-medium">规则</th>
              <th className="px-3 py-2 font-medium">大类</th>
              <th className="px-3 py-2 font-medium">类别</th>
              <th className="px-3 py-2 font-medium">适用单据</th>
              <th className="px-3 py-2 font-medium">执行方式</th>
              <th className="px-3 py-2 font-medium">依据</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium">演示命中</th>
              <th className="px-3 py-2 font-medium">启用</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {list.map((r) => {
              const on = lib.items[r.id]?.enabled ?? false;
              return (
                <tr key={r.id} className={cx('cursor-pointer align-top transition-colors hover:bg-primary-50/40', !on && 'opacity-55')} onClick={() => onOpen(r)}>
                  <td className="code px-4 py-2.5 text-ink-500">{r.id}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5 font-medium text-ink-900">
                      {r.name}
                      {r.rigid ? <Icon name="lock" size={12} className="text-ink-400" aria-label="集团制度刚性规则" /> : null}
                      {r.batchLevel ? <Badge tone="agent">批次级</Badge> : null}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-xs text-ink-500">
                      {r.owner} · {r.desc}
                    </div>
                  </td>
                  <td className={cx('px-3 py-2.5 text-xs', r.major === 'country' ? 'font-medium text-seal-700' : 'text-ink-700')}>{MAJOR_LABEL[r.major]}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={r.level === 'error' ? 'seal' : 'amber'}>{r.level === 'error' ? '错误' : '疑问'}</Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-ink-600">{r.biz.length === 3 ? '三类' : r.biz.map((b) => BIZ_SHEET[b]).join('、')}</td>
                  <td className="px-3 py-2.5">
                    <EngineTag engine={r.engine} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.refs.slice(0, 3).map((x, i) => (
                        <span key={i} title={`${REF_DOC_LABEL[x.doc]}${x.no ? ` ${x.no}` : ''}：${x.title}`} className={cx('rounded px-1.5 text-2xs leading-[18px]', x.doc === 'policy' ? 'bg-primary-50 text-primary-700' : x.doc === 'manual' ? 'bg-agent-50 text-agent-700' : 'bg-amber-50 text-amber-700')}>
                          {refText(x)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="num px-3 py-2.5 text-right">{replay.hits[r.id] ?? 0}</td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={on}
                      label={`${on ? '停用' : '启用'} ${r.name}`}
                      disabled={!canEdit || r.rigid}
                      onChange={(v) => {
                        const c: RuleChange = { id: `m${Date.now()}`, kind: v ? 'enable' : 'disable', ruleId: r.id, ruleName: r.name, field: '启用状态', before: v ? '停用' : '启用', after: v ? '启用' : '停用', reason: '手工调整', patch: { enabled: v } };
                        const ver = publishVersion(lib.orgCode, { who, via: 'manual', confirmed: [c] });
                        toast('success', `已${v ? '启用' : '停用'} ${r.id}`, `${libName(lib.orgCode)}更新为 ${ver}，本区域用户下一次核查即生效`);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.length ? <Empty icon="book" title="没有符合条件的规则" /> : null}
        {unused.length && !major ? (
          <p className="border-t border-black/[0.05] px-4 py-3 text-xs text-ink-500">
            规则实现池中本区域未选用：{unused.map((r) => `${r.id} ${r.name}`).join('、')}。可通过“自然语言维护”新增。
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

function CatButton({ active, onClick, label, n }: { active: boolean; onClick: () => void; label: string; n: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors', active ? 'bg-primary-500 font-medium text-white' : 'text-ink-700 hover:bg-ink-100')}
    >
      <span className="truncate">{label}</span>
      <span className={cx('num rounded px-1.5 text-xs', active ? 'bg-white/20' : 'bg-ink-100 text-ink-500')}>{n}</span>
    </button>
  );
}

/* ================= 规则详情 ================= */

function RuleDrawer({ rule, lib, canEdit, onClose }: { rule: RuleDef | null; lib: RuleLib; canEdit: boolean; onClose: () => void }) {
  return (
    <Drawer open={!!rule} onClose={onClose} width={1000} title={rule ? `${rule.id} ${rule.name}` : ''} subtitle={rule ? `${MAJOR_LABEL[rule.major]}；${rule.owner}；${libName(lib.orgCode)} ${lib.version}` : ''}>
      {rule ? <RuleBody key={rule.id} rule={rule} lib={lib} canEdit={canEdit} /> : null}
    </Drawer>
  );
}

function RuleBody({ rule, lib, canEdit: canEditLib }: { rule: RuleDef; lib: RuleLib; canEdit: boolean }) {
  const replay = useReplay(lib);
  const user = useUser();
  const item = lib.items[rule.id];
  const level = item?.level ?? rule.level;
  const canEdit = canEditLib && !!item && !rule.rigid;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries((rule.params ?? []).map((p) => [p.key, String(item?.params[p.key] ?? p.value)])));
  const logs = lib.versions.flatMap((v) => v.changes.filter((c) => c.ruleId === rule.id || c.ruleId === '*').map((c) => ({ v, c })));
  const ex = replay.examples.get(rule.id) ?? [];

  return (
    <div className="space-y-5 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{MAJOR_LABEL[rule.major]}</Badge>
        <EngineTag engine={rule.engine} />
        <Badge tone={level === 'error' ? 'seal' : 'amber'}>{level === 'error' ? '错误数据（疑点）' : '疑问数据（需人工确认）'}</Badge>
        {rule.rigid ? (
          <Badge tone="neutral" icon="lock">
            集团制度（不可停用）
          </Badge>
        ) : null}
        {rule.batchLevel ? <Badge tone="agent">批次级：三类单据合并判断</Badge> : null}
        <span className="text-xs text-ink-500">适用：{rule.biz.map((b) => BIZ_SHEET[b]).join('、')}</span>
        <span className="ml-auto text-xs text-ink-500">{item ? (item.enabled ? '本区域规则库：已启用' : '本区域规则库：已停用') : '本区域规则库未选用'}</span>
      </div>

      <section className="grid grid-cols-2 gap-5">
        <div className="rounded-[14px] border border-black/[0.07] bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink-900">规则说明</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{rule.desc}</p>
          <h3 className="mt-4 text-sm font-semibold text-ink-900">依据</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{rule.basis}</p>
          <ul className="mt-2 space-y-1">
            {rule.refs.map((x, i) => (
              <li key={i} className="flex gap-2 text-xs text-ink-600">
                <span className={cx('shrink-0 rounded px-1.5 leading-[18px]', x.doc === 'policy' ? 'bg-primary-50 text-primary-700' : x.doc === 'manual' ? 'bg-agent-50 text-agent-700' : 'bg-amber-50 text-amber-700')}>{REF_DOC_LABEL[x.doc]}</span>
                <span>
                  {x.no ? <span className="code mr-1">{x.no}</span> : null}
                  {x.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[14px] border border-black/[0.07] bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink-900">参数（本区域规则库）</h3>
          {rule.params?.length ? (
            <div className="mt-2 space-y-3">
              {rule.params.map((p) => (
                <Field key={p.key} label={`${p.label}${p.unit ? `（${p.unit}）` : ''}`} htmlFor={`p-${p.key}`}>
                  <Input id={`p-${p.key}`} value={draft[p.key] ?? ''} disabled={!canEdit || typeof p.value !== 'number'} inputMode="decimal" onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))} />
                </Field>
              ))}
              {canEdit ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const changes: RuleChange[] = [];
                    for (const p of rule.params ?? []) {
                      if (typeof p.value !== 'number') continue;
                      const v = Number(draft[p.key]);
                      if (!Number.isFinite(v) || v <= 0) {
                        toast('error', `${p.label}需为正数`);
                        return;
                      }
                      const cur = Number(item?.params[p.key] ?? p.value);
                      if (v !== cur) changes.push({ id: `m${Date.now()}${p.key}`, kind: 'param', ruleId: rule.id, ruleName: rule.name, field: p.label, before: `${cur}${p.unit ? ` ${p.unit}` : ''}`, after: `${v}${p.unit ? ` ${p.unit}` : ''}`, reason: '手工调整', patch: { params: { [p.key]: v } } });
                    }
                    if (!changes.length) {
                      toast('info', '参数未变化');
                      return;
                    }
                    const ver = publishVersion(lib.orgCode, { who: `${user.name}（${user.empNo}）`, via: 'manual', confirmed: changes });
                    toast('success', `参数已保存，${libName(lib.orgCode)}更新为 ${ver}`, changes.map((c) => `${c.field} ${c.before} → ${c.after}`).join('；'));
                  }}
                >
                  保存参数（发布新版本）
                </Button>
              ) : (
                <p className="text-xs text-ink-500">{rule.rigid ? '集团制度刚性规则，参数由集团制度确定。' : '当前角色或规则库无修改权限。'}</p>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink-500">本规则无可调参数。</p>
          )}
        </div>
      </section>

      <section className="rounded-[14px] border border-black/[0.07] bg-surface">
        <div className="flex items-center justify-between border-b border-black/[0.05] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-ink-900">逻辑代码（AI 生成，人工审核）</h3>
          <Badge tone="agent" icon="sparkle">
            由规则说明自动转换
          </Badge>
        </div>
        <pre className="code overflow-x-auto bg-ink-50 px-5 py-4 text-[12.5px] leading-6 text-ink-800">{rule.logic}</pre>
      </section>

      <section className="grid grid-cols-2 gap-5">
        <div className="rounded-[14px] border border-black/[0.07] bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink-900">演示数据回放</h3>
          <p className="mt-1 text-xs text-ink-500">三类演示台账（246 笔）合并为一个批次，按本区域规则库参数执行。</p>
          <div className="mt-2 text-2xl font-semibold text-ink-900">{replay.hits[rule.id] ?? 0} 项</div>
          {ex.length ? (
            <ul className="mt-3 space-y-1.5">
              {ex.map((e) => (
                <li key={e.rec.key} className="text-xs leading-relaxed text-ink-600">
                  <span className="code mr-1.5 text-ink-500">{e.rec.f.docNo.slice(-10)}</span>
                  {e.msg}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="rounded-[14px] border border-black/[0.07] bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink-900">上线前校准建议</h3>
          <p className="mt-1 text-xs text-ink-500">原型未接入真实数据。上线前建议用一个月历史单据回放每条规则，确认命中量级与口径。</p>
          {CALIBRATION[rule.id] ? (
            <Callout tone={rule.id === 'R601' ? 'amber' : 'neutral'} icon="scale" className="mt-3" title="口径提示">
              {CALIBRATION[rule.id]}
            </Callout>
          ) : (
            <p className="mt-3 text-sm text-ink-500">本规则口径明确，回放时关注命中量级即可。</p>
          )}
        </div>
      </section>

      <section className="rounded-[14px] border border-black/[0.07] bg-surface p-4">
        <h3 className="text-sm font-semibold text-ink-900">本区域规则库中的变更记录</h3>
        <ul className="mt-2 divide-y divide-black/[0.05]">
          {logs.map(({ v, c }) => (
            <li key={`${v.version}-${c.id}`} className="flex gap-4 py-2 text-sm">
              <span className="code w-[96px] shrink-0 text-ink-500">{v.version}</span>
              <span className="num w-[124px] shrink-0 text-ink-500">{v.at}</span>
              <span className="w-[150px] shrink-0 truncate text-ink-700">{v.who}</span>
              <span className="w-[72px] shrink-0 font-medium text-ink-900">{CHANGE_LABEL[c.kind]}</span>
              <span className="min-w-0 text-ink-600">
                {c.field}：{c.before} → {c.after}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ================= 自然语言维护 ================= */

type Decision = 'confirm' | 'reject';

function NlTab({ lib, canEdit, onOpen }: { lib: RuleLib; canEdit: boolean; onOpen: (id: string) => void }) {
  const user = useUser();
  const [text, setText] = useState(EXAMPLES[0]);
  const [result, setResult] = useState<(NlProposal & { id: number; instruction: string; libVersion: string }) | null>(null);
  const [dec, setDec] = useState<Record<string, Decision>>({});
  const [published, setPublished] = useState<string | null>(null);
  const steps = result?.steps ?? [];
  const stage: Stage[] = useMemo(() => (result ? [{ key: 'nl', title: 'AI 拆解', engine: 'agent', summary: '', lines: [], ms: Math.max(1600, steps.length * 650) }] : []), [result, steps.length]);
  const player = useRunPlayer(stage, result?.id ?? 0);
  const visible = player.done ? steps.length : Math.ceil(player.progress(0) * steps.length);
  const impacts = useMemo(() => (result && player.done ? Object.fromEntries(result.changes.map((c) => [c.id, impactOf(c, lib)])) : {}), [result, player.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const actionable = result?.changes.filter((c) => !c.blocked) ?? [];
  const confirmed = actionable.filter((c) => dec[c.id] === 'confirm');
  const stale = result && result.libVersion !== lib.version && !published;

  function run(input: string) {
    setDec({});
    setPublished(null);
    setResult({ ...proposeChanges(input, lib, user), id: Date.now(), instruction: input.trim(), libVersion: lib.version });
  }

  function publish() {
    if (!result || !confirmed.length) return;
    const rejected = result.changes.filter((c) => !confirmed.includes(c));
    const ver = publishVersion(lib.orgCode, { who: `${user.name}（${user.empNo}）`, via: 'nl', instruction: result.instruction, confirmed, rejected });
    setPublished(ver);
    toast('success', `${libName(lib.orgCode)}已发布 ${ver}`, `确认 ${confirmed.length} 条变更，只影响本区域用户的一键核查`);
  }

  /* ---------- 全流程演示：区域用自然语言维护规则库 ---------- */
  const flowRun = useRef(0);
  const tail = useRef(0);
  const resultRef = useRef(result);
  resultRef.current = result;
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const ctl = useFlowStep('rule-nl', (c) => {
    setText('');
    setResult(null);
    c.sub(0);
    c.click('[data-demo="nl-example-0"]', () => setText(EXAMPLES[0]));
    c.later(1600, () =>
      c.click('[data-demo="nl-run"]', () => {
        flowRun.current = Date.now();
        run(EXAMPLES[0]);
        c.sub(1);
      }),
    );
  });
  useEffect(() => {
    if (!ctl || !result || !flowRun.current || result.id < flowRun.current) return;
    if (!player.done || tail.current === ctl.nonce) return;
    tail.current = ctl.nonce;
    const list = result.changes.filter((x) => !x.blocked);
    ctl.sub(2);
    ctl.hover('[data-flow-anchor="nl-diff"]');
    ctl.later(2600, () => {
      ctl.sub(3);
      if (list[0]) ctl.click(`[data-demo="confirm-change-0"]`, () => setDec((d) => ({ ...d, [list[0].id]: 'confirm' })));
    });
    ctl.later(4400, () => ctl.click('[data-demo="confirm-all"]', () => setDec(Object.fromEntries(list.map((x) => [x.id, 'confirm' as Decision])))));
    ctl.later(6400, () => {
      ctl.sub(4);
      ctl.click('[data-demo="publish-version"]', () => publishRef.current());
    });
    ctl.later(8200, () => ctl.click('[data-demo="goto-versions"]', () => setQuery({ tab: 'versions' })));
    ctl.later(10200, () => ctl.done());
  }, [ctl, result, player.done]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 全流程演示：误报回流，智能体给出调优建议，区域采纳为草稿（原型补充 · 可选） ---------- */
  const cases = useCases();
  const tips = useMemo(() => tuneSuggestions(cases), [cases]);
  const adopt = (t: string) => {
    setText(t);
    setResult(null);
    toast('info', '已采纳为草稿', '点“生成变更”拆解，逐条确认、发布新版本后才生效');
  };
  const tipsRef = useRef(tips);
  tipsRef.current = tips;
  useFlowStep('rule-tune', (c) => {
    setResult(null);
    c.sub(0);
    c.hover('[data-flow-anchor="tune-suggest"]');
    c.later(2600, () => {
      c.sub(1);
      c.hover('[data-demo="tune-rule-0"]');
    });
    c.later(5200, () => {
      const t = tipsRef.current[0];
      c.sub(2);
      if (t) c.click('[data-demo="tune-adopt-0"]', () => adopt(t.text));
    });
    c.later(7200, () => c.hover('[data-flow-anchor="nl-input"]'));
    c.later(9000, () => c.done());
  });

  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-5 space-y-6">
      <TuneCard tips={tips} cases={cases} onAdopt={adopt} />
      <Panel anchor="nl-input" title="用一句话维护本区域规则库" desc={`智能体按工号找到 ${libName(lib.orgCode)}（${lib.version}），把要求拆成若干条变更，逐条确认后发布新版本。`}>
        {!canEdit ? (
          <Callout tone="neutral" icon="lock" className="mb-4">
            当前角色（{user.roleName}）或当前查看的规则库不可维护：可以试用拆解，发布需本区域管理员。
          </Callout>
        ) : null}
        <Textarea aria-label="维护要求" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="如：单笔 5 万美元以上的服务贸易收入，用途说明要写合同号…" />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e, i) => (
            <button key={e} type="button" data-demo={`nl-example-${i}`} onClick={() => setText(e)} className={cx('rounded-full border px-2.5 py-1 text-left text-xs transition-colors', text === e ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-ink-200 text-ink-600 hover:border-ink-300')}>
              {e}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="agent" icon="sparkle" disabled={!text.trim()} onClick={() => run(text)} data-demo="nl-run">
            生成变更
          </Button>
        </div>
        <Callout tone="neutral" icon="help" className="mt-4">
          示例分别演示：一句话拆成多条变更（新增 / 改类别 / 调参数）、新增规则、停用集团刚性规则被拦下、识别与已有规则重复、数据不足无法实现、信息不全时反问。
        </Callout>
      </Panel>
      </div>
      <div className="col-span-7 space-y-6">
        <Panel anchor="nl-trace" title="智能体处理过程" actions={result ? <PlayerControls player={player} /> : null}>
          {!result ? (
            <Empty icon="sparkle" title="等待输入">
              选择左侧示例或输入要求，点击“生成变更”。
            </Empty>
          ) : (
            <TraceTimeline steps={steps} visible={visible} compact />
          )}
        </Panel>
        {result && player.done ? (
          <Panel
            anchor="nl-diff"
            title={`变更 diff：${result.changes.length} 条（${libName(lib.orgCode)} ${result.libVersion} → 新版本）`}
            desc="逐条确认或全部确认；只发布已确认的变更，未确认的也记录在版本中。右侧为该规则在三类演示台账上的命中变化。"
            actions={
              result.changes.length ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setDec(Object.fromEntries(actionable.map((c) => [c.id, 'confirm' as Decision])))} disabled={!!published} data-demo="confirm-all">
                    全部确认
                  </Button>
                  <Button size="sm" variant="primary" icon="check" disabled={!canEdit || !confirmed.length || !!published || !!stale} onClick={publish} data-demo="publish-version">
                    发布已确认的 {confirmed.length} 条
                  </Button>
                </>
              ) : null
            }
          >
            {stale ? (
              <Callout tone="amber" icon="alert" className="mb-3">
                规则库已更新为 {lib.version}，这份变更基于 {result.libVersion}，请重新生成。
              </Callout>
            ) : null}
            {published ? (
              <Callout tone="pine" icon="checkCircle" className="mb-3" title={`已发布 ${published}`}>
                确认 {confirmed.length} 条，未确认 {result.changes.length - confirmed.length} 条已留痕。
                <button type="button" data-demo="goto-versions" onClick={() => setQuery({ tab: 'versions' })} className="ml-2 font-medium text-pine-700 underline">
                  查看版本与变更
                </button>
              </Callout>
            ) : null}
            {result.changes.length ? (
              <ul className="space-y-2">
                {result.changes.map((c, i) => {
                  const d = dec[c.id];
                  const im = impacts[c.id];
                  return (
                    <li key={c.id} className={cx('rounded-[14px] border px-4 py-3', c.blocked ? 'border-black/[0.06] bg-ink-50/60' : d === 'confirm' ? 'border-pine-100 bg-pine-50/50' : d === 'reject' ? 'border-black/[0.06] opacity-60' : 'border-black/[0.08] bg-surface')}>
                      <div className="flex items-center gap-2">
                        <Badge tone={c.kind === 'add' ? 'primary' : c.kind === 'disable' ? 'seal' : c.kind === 'level' ? 'amber' : 'neutral'}>{CHANGE_LABEL[c.kind]}</Badge>
                        <button type="button" onClick={() => onOpen(c.ruleId)} className="code text-xs text-primary-600 hover:underline">
                          {c.ruleId}
                        </button>
                        <span className="text-sm font-medium text-ink-900">{c.ruleName}</span>
                        <span className="ml-auto flex items-center gap-1">
                          {c.blocked ? (
                            <Badge tone="neutral" icon="lock">
                              不可执行
                            </Badge>
                          ) : (
                            <>
                              <Button size="sm" variant={d === 'confirm' ? 'primary' : 'ghost'} icon="check" disabled={!!published} onClick={() => setDec((x) => ({ ...x, [c.id]: 'confirm' }))} data-demo={`confirm-change-${i}`}>
                                确认
                              </Button>
                              <Button size="sm" variant="ghost" disabled={!!published} onClick={() => setDec((x) => ({ ...x, [c.id]: 'reject' }))}>
                                不采纳
                              </Button>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_120px] items-center gap-2 text-sm">
                        <span className="text-xs text-ink-500">{c.field}</span>
                        <span className="rounded bg-seal-50 px-2 py-1 text-seal-700 line-through decoration-seal-200">{c.before}</span>
                        <span className="rounded bg-pine-50 px-2 py-1 text-pine-700">{c.after}</span>
                        <span className="num text-right text-xs text-ink-600" title="该规则在三类演示台账（246 笔）上的命中项数">
                          {im ? `命中 ${im.before} → ${im.after}` : ''}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{c.blocked ?? c.reason}</p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {result.notes.length ? (
              <ul className="mt-3 space-y-1.5">
                {result.notes.map((n, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700">
                    <Badge tone={n.kind === 'duplicate' ? 'neutral' : 'amber'}>{n.kind === 'duplicate' ? '不重复新增' : '无法实现'}</Badge>
                    <span>{n.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {result.questions?.length ? (
              <Callout tone="primary" icon="help" title="智能体需要补充信息" className="mt-3">
                <ol className="list-decimal space-y-1 pl-5">
                  {result.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </Callout>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/* ================= 版本与变更 ================= */

function VersionsTab({ lib }: { lib: RuleLib }) {
  const [sel, setSel] = useState(lib.versions[0]?.version);
  useEffect(() => setSel(lib.versions[0]?.version), [lib.orgCode, lib.versions.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const v = lib.versions.find((x) => x.version === sel) ?? lib.versions[0];
  const idx = lib.versions.indexOf(v);
  const prev = lib.versions[idx + 1];
  return (
    <div data-flow-anchor="lib-versions" className="grid grid-cols-12 gap-6">
      <Panel title={`${libName(lib.orgCode)}：版本`} className="col-span-4" bodyClassName="p-2" actions={<FormatLink k="ruleDiff" label="版本表结构" />}>
        <ul className="space-y-1">
          {lib.versions.map((x) => (
            <li key={x.version}>
              <button type="button" onClick={() => setSel(x.version)} className={cx('w-full rounded-md px-3 py-2.5 text-left transition-colors', x.version === v?.version ? 'bg-primary-50' : 'hover:bg-ink-50')}>
                <div className="flex items-center gap-2">
                  <span className="code text-sm font-semibold text-ink-900">{x.version}</span>
                  {x === lib.versions[0] ? <Badge tone="pine">当前</Badge> : null}
                  <ViaBadge via={x.via} />
                  <span className="num ml-auto text-xs text-ink-500">{x.changes.length} 条</span>
                </div>
                <div className="mt-0.5 text-xs text-ink-500">
                  {x.at} · {x.who}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      {v ? <VersionDiff v={v} prev={prev} /> : null}
    </div>
  );
}

function ViaBadge({ via }: { via: LibVersion['via'] }) {
  return via === 'nl' ? (
    <Badge tone="agent" icon="sparkle">
      自然语言
    </Badge>
  ) : via === 'manual' ? (
    <Badge>手工</Badge>
  ) : (
    <Badge tone="primary">初始化</Badge>
  );
}

function VersionDiff({ v, prev }: { v: LibVersion; prev?: LibVersion }) {
  return (
    <Panel className="col-span-8" title={`${prev ? `${prev.version} → ` : ''}${v.version} 的变更`} desc={`${v.at} · ${v.who}`}>
      {v.instruction ? (
        <blockquote className="mb-4 rounded-[12px] border-l-[3px] border-agent-400 bg-agent-50/50 px-4 py-2.5 text-sm text-ink-800">
          <span className="mr-1 text-xs text-agent-700">{v.via === 'nl' ? '原话' : '说明'}</span>“{v.instruction}”
        </blockquote>
      ) : null}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[120px]" />
          <col className="w-[220px]" />
          <col className="w-[92px]" />
          <col className="w-[130px]" />
          <col className="w-[190px]" />
          <col />
        </colgroup>
        <thead className="text-left text-xs text-ink-500">
          <tr>
            <th className="py-1.5 font-normal">变更</th>
            <th className="py-1.5 font-normal">规则</th>
            <th className="py-1.5 font-normal">项目</th>
            <th className="py-1.5 font-normal">变更前</th>
            <th className="py-1.5 font-normal">变更后</th>
            <th className="py-1.5 font-normal">理由</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05]">
          {v.changes.map((c) => (
            <DiffRow key={c.id} c={c} />
          ))}
          {v.rejected.map((c) => (
            <DiffRow key={c.id} c={c} rejected />
          ))}
        </tbody>
      </table>
      {v.rejected.length ? <p className="mt-2 text-xs text-ink-500">灰色行为智能体提出但未被确认（或不可执行）的变更，只留痕，不生效。</p> : null}
    </Panel>
  );
}

function DiffRow({ c, rejected }: { c: RuleChange; rejected?: boolean }) {
  return (
    <tr className={cx('align-top', rejected && 'opacity-50')}>
      <td className="py-2 pr-3">
        <Badge tone={rejected ? 'neutral' : c.kind === 'add' ? 'primary' : c.kind === 'disable' ? 'seal' : c.kind === 'level' ? 'amber' : 'neutral'}>{rejected ? `未采纳·${CHANGE_LABEL[c.kind]}` : CHANGE_LABEL[c.kind]}</Badge>
      </td>
      <td className="py-2 pr-3">
        <span className="code mr-1 text-xs text-ink-500">{c.ruleId === '*' ? '全部' : c.ruleId}</span>
        <span className="text-ink-800">{c.ruleId === '*' ? '' : c.ruleName}</span>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-ink-600">{c.field}</td>
      <td className="py-2 pr-3">
        <span className="rounded bg-seal-50 px-1.5 text-seal-700 line-through decoration-seal-200">{c.before}</span>
      </td>
      <td className="py-2 pr-3">
        <span className="rounded bg-pine-50 px-1.5 text-pine-700">{c.after}</span>
      </td>
      <td className="py-2 text-xs text-ink-500">{c.blocked ?? c.reason}</td>
    </tr>
  );
}

/* ================= 用户与规则库 ================= */

const POST: Record<string, string> = { checker: '子公司财务核查岗', reviewer: '子公司财务复核岗', tier2: '区域财务管理员', tier1: '集团财务管理员' };

/** 每日主数据同步（walk 型环节：导演按子步骤推进，这里按子步骤显示进度；不在演示时显示今天 07:00 已完成） */
function OrgSyncPanel({ sub }: { sub: number }) {
  const steps = ['拉取人员与组织', '比对变更', '写入 doc_user_org，刷新规则库与可见范围'];
  const showChanges = sub < 0 || sub >= 1;
  return (
    <Panel anchor="org-sync" title="每日主数据同步" desc={`定时调度 · 每日 07:00 · ${ORG_SYNC.source} → doc_user_org。工号决定组织、岗位、使用的规则库与结果可见范围。`}>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4">
          <ol className="space-y-2">
            {steps.map((t, i) => {
              const state = sub < 0 || sub > i ? 'done' : sub === i ? 'run' : 'todo';
              return (
                <li key={t} className={cx('flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm transition-colors', state === 'run' ? 'bg-primary-50 text-ink-900' : state === 'done' ? 'text-ink-800' : 'text-ink-400')}>
                  <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs', state === 'done' ? 'bg-pine-500 text-white' : state === 'run' ? 'bg-primary-500 text-white' : 'bg-ink-100')}>{state === 'done' ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}</span>
                  {t}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              ['人员', ORG_SYNC.people],
              ['组织', ORG_SYNC.orgs],
              ['今日变更', showChanges ? ORG_SYNC.changes.length : '…'],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[12px] bg-ink-50 px-3 py-2">
                <div className="text-2xs text-ink-500">{k}</div>
                <div className="num text-[18px] font-semibold text-ink-900">{v}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">{sub < 0 ? `今天 ${ORG_SYNC.at.slice(11)} 已同步完成。` : '同步中…'}同步异常（如组织编码不存在）转集团管理员处理，不影响已有账号。</p>
        </div>
        <div data-flow-anchor="org-changes" className="col-span-8">
          <h3 className="mb-2 text-sm font-semibold text-ink-900">今日变更</h3>
          <ul className="divide-y divide-black/[0.05] rounded-[14px] border border-black/[0.07]">
            {showChanges ? (
              ORG_SYNC.changes.map((c) => (
                <li key={c.empNo} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  <Badge tone={c.kind === '离职' ? 'neutral' : c.kind === '入职' ? 'pine' : 'primary'}>{c.kind}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-900">
                      <span className="code text-xs text-ink-600">{c.empNo}</span> {c.name} · {POST[c.post]}
                      <span className="ml-2 text-ink-600">
                        {c.from ? orgByCode(c.from)?.name : ''}
                        {c.from && c.to ? ' → ' : ''}
                        {c.to ? orgByCode(c.to)?.name : ''}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500">{c.note}</div>
                  </div>
                </li>
              ))
            ) : (
              <li className="px-4 py-6 text-center text-sm text-ink-400">正在拉取人员与组织…</li>
            )}
          </ul>
        </div>
      </div>
    </Panel>
  );
}

interface TuneTip {
  ruleId: string;
  ruleName: string;
  rejected: number;
  total: number;
  sample: string;
  text: string;
}

/** 按判例库统计误报集中的规则，生成可直接作为自然语言维护草稿的调优建议 */
function tuneSuggestions(cases: CaseEntry[]): TuneTip[] {
  const byRule = new Map<string, CaseEntry[]>();
  for (const c of cases) byRule.set(c.ruleId, [...(byRule.get(c.ruleId) ?? []), c]);
  return [...byRule.values()]
    .map((list) => {
      const rej = list.filter((c) => c.decision === 'reject');
      const sample = rej[0]?.key.split('|')[1] ?? '';
      const r = list[0];
      return {
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        rejected: rej.length,
        total: list.length,
        sample,
        text: r.ruleId === 'R102' ? `用途说明笼统那条，把“${sample}”这类常见、明确的费用加入白名单，不再提示` : `${r.ruleName}误报较多，阈值调宽一些，先改为疑问数据`,
      };
    })
    .filter((t) => t.rejected > 0)
    .sort((a, b) => b.rejected / b.total - a.rejected / a.total);
}

function TuneCard({ tips, cases, onAdopt }: { tips: TuneTip[]; cases: CaseEntry[]; onAdopt: (text: string) => void }) {
  const confirm = cases.filter((c) => c.decision === 'confirm').length;
  return (
    <Panel
      anchor="tune-suggest"
      title={
        <span className="flex items-center gap-2">
          误报回流 · 调优建议 <NecessityTag n="optional" />
        </span>
      }
      desc={`智能体每天汇总判例库（确认 ${confirm} 条、误报 ${cases.length - confirm} 条），定位误报集中的规则；采纳后成为下面的一条草稿，仍要逐条确认、发布才生效。`}
      actions={<FormatLink k="casebook" label="判例库" />}
    >
      {tips.length ? (
        <ul className="space-y-2">
          {tips.slice(0, 2).map((t, i) => (
            <li key={t.ruleId} data-demo={`tune-rule-${i}`} className="rounded-[12px] bg-agent-50/60 px-3 py-2.5 ring-1 ring-inset ring-black/[0.04]">
              <div className="flex items-center gap-2 text-sm">
                <span className="code text-xs text-ink-500">{t.ruleId}</span>
                <span className="font-medium text-ink-900">{t.ruleName}</span>
                <span className="ml-auto text-xs text-ink-500">
                  误报 {t.rejected} / 判例 {t.total}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-600">
                {t.sample ? `误报样本：“${t.sample}”。` : ''}建议：{t.text}
              </p>
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="agent" icon="sparkle" data-demo={`tune-adopt-${i}`} onClick={() => onAdopt(t.text)}>
                  采纳为草稿
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">判例库中暂无误报，规则不需要调整。</p>
      )}
    </Panel>
  );
}

function UsersTab() {
  const libs = useStore(ruleLibStore, (s) => s.libs);
  const syncSub = useFlow((s) => (s.active && STEPS[s.idx]?.id === 'org-sync' ? s.sub : -1));
  useFlowStep('org-sync');
  const changed = new Map(ORG_SYNC.changes.map((c) => [c.empNo, c]));
  const left = ORG_SYNC.changes.filter((c) => c.kind === '离职');
  return (
    <div className="space-y-6">
    <OrgSyncPanel sub={syncSub} />
    <div className="grid grid-cols-12 gap-6">
      <Panel anchor="org-map" title="用户与组织对应表（doc_user_org）" className="col-span-8" desc="由统一认证 / 人力系统每日同步（系统集成）。统一认证只带工号，后台据此确定组织、岗位、使用的规则库和可查看的结果范围。" actions={<FormatLink k="userOrg" label="表结构" />} bodyClassName="p-0">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-left text-xs text-ink-500">
            <tr>
              <th className="px-4 py-2 font-medium">工号</th>
              <th className="px-3 py-2 font-medium">姓名</th>
              <th className="px-3 py-2 font-medium">所属组织</th>
              <th className="px-3 py-2 font-medium">岗位</th>
              <th className="px-3 py-2 font-medium">→ 规则库</th>
              <th className="px-3 py-2 font-medium">结果可见范围</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.05]">
            {USER_ORG.map((u) => {
              const lo = ruleLibOrgOf(u.empNo)!;
              const demo = Object.values(USERS).some((x) => x.empNo === u.empNo);
              return (
                <tr key={u.empNo} className={demo ? 'bg-primary-50/40' : changed.has(u.empNo) ? 'bg-pine-50/50' : undefined}>
                  <td className="code px-4 py-2 text-ink-700">{u.empNo}</td>
                  <td className="px-3 py-2 text-ink-900">
                    {u.name}
                    {demo ? <Badge tone="primary" className="ml-1.5">演示角色</Badge> : null}
                    {changed.has(u.empNo) ? <Badge tone="pine" className="ml-1.5">今日{changed.get(u.empNo)!.kind}</Badge> : null}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{orgByCode(u.orgCode)?.name}</td>
                  <td className="px-3 py-2 text-ink-700">{POST[u.post]}</td>
                  <td className="px-3 py-2 text-ink-700">
                    {libName(lo)} <span className="code text-xs text-ink-500">{libs[lo]?.version}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-600">{u.post === 'tier1' ? '全集团' : u.post === 'tier2' ? `本区域及辖内 ${scopeOrgs({ role: 'tier2', orgCode: u.orgCode }).length - 1} 个子公司` : '本公司'}</td>
                </tr>
              );
            })}
            {left.map((u) => (
              <tr key={u.empNo} className="text-ink-400">
                <td className="code px-4 py-2 line-through">{u.empNo}</td>
                <td className="px-3 py-2">
                  <span className="line-through">{u.name}</span>
                  <Badge tone="neutral" className="ml-1.5">
                    今日离职 · 已停用
                  </Badge>
                </td>
                <td className="px-3 py-2 line-through">{orgByCode(u.from!)?.name}</td>
                <td className="px-3 py-2 line-through">{POST[u.post]}</td>
                <td className="px-3 py-2">—</td>
                <td className="px-3 py-2 text-xs">不可登录</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="规则库匹配规则" className="col-span-4">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-ink-700">
          <li>统一认证带入工号（原型用顶栏“演示角色”模拟）。</li>
          <li>查 doc_user_org 得到所属组织与岗位。</li>
          <li>子公司 → 所属区域的规则库；区域 → 本区域规则库；集团 → 集团规则库。</li>
          <li>三类单据（收款单 / 付款单 / 进口结算单）用同一规则库；界面上传与 RPA 接口上传一致（接口按 operator 工号匹配）。</li>
        </ol>
        <h3 className="mt-5 text-sm font-semibold text-ink-900">各规则库当前版本</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {ORGS.filter((o) => o.level !== 'sub').map((o) => (
            <li key={o.code} className="flex justify-between">
              <span className="text-ink-700">{libName(o.code)}</span>
              <span className="code text-ink-500">
                {libs[o.code]?.version} · {Object.values(libs[o.code]?.items ?? {}).filter((x) => x.enabled).length} 条
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
    </div>
  );
}

/* ================= AI 解读制度文件 ================= */

function policyStages(doc: PolicyDoc): Stage[] {
  const covered = doc.clauses.filter((c) => c.map.kind === 'covered').length;
  const fresh = doc.clauses.filter((c) => c.map.kind === 'new').length;
  const manual = doc.clauses.filter((c) => c.map.kind === 'manual').length;
  return [
    { key: 'parse', title: '文档解析', engine: 'code', actor: 'batch', summary: `${doc.pages} 页`, lines: [`解析 ${doc.title}，共 ${doc.pages} 页`, '按章节、条款切分，识别表格与附件'], ms: 900 },
    { key: 'extract', title: '条款识别', engine: 'agent', actor: 'agent', summary: `${doc.clauses.length} 条`, lines: [`识别与单据数据核查相关的条款 / 章节 ${doc.clauses.length} 条`, '判断每条能否由上传的三类单据明细校验（单笔或整批）'], ms: 1500 },
    { key: 'map', title: '与现有规则比对', engine: 'agent', actor: 'agent', summary: `覆盖 ${covered}，新增 ${fresh}`, lines: [`已被现有规则覆盖 ${covered} 条`, `建议新增规则 ${fresh} 条`, `不可校验（需其他数据）${manual} 条`], ms: 1500 },
    { key: 'draft', title: '生成规则草案（含大类与依据）', engine: 'agent', actor: 'agent', summary: `${fresh} 份草案`, lines: ['为新增建议生成结构化规则说明、大类、依据条款与 DSL 逻辑代码', '草案提交审核，审核通过后作为“新增规则”变更进入规则库'], ms: 1200 },
  ];
}

function PolicyTab({ onOpen }: { onOpen: (id: string) => void }) {
  const [docId, setDocId] = useState(POLICIES[0].id);
  const [runs, setRuns] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());
  const doc = POLICIES.find((d) => d.id === docId)!;
  const stages = useMemo(() => policyStages(doc), [doc]);
  const player = useRunPlayer(runs[docId] ? stages : [], runs[docId] ?? 0);
  const can = useCan('ruleMaintain');
  const submit = (no: string) => {
    setSubmitted((s) => new Set(s).add(`${docId}:${no}`));
    toast('success', '草案已提交审核', '审核通过后作为“新增规则”变更进入规则库（原型仅演示）');
  };

  /* ---------- 全流程演示：集团 AI 解读制度文件并提交草案 ---------- */
  const flowRun = useRef(0);
  const tail = useRef(0);
  const ctl = useFlowStep('policy', (c) => {
    c.click('[data-demo="policy-doc-0"]', () => setDocId(POLICIES[0].id));
    c.later(1300, () =>
      c.click('[data-demo="policy-run"]', () => {
        const id = Date.now();
        flowRun.current = id;
        setRuns((r) => ({ ...r, [POLICIES[0].id]: id }));
      }),
    );
  });
  useEffect(() => {
    if (!ctl || runs[docId] !== flowRun.current || !flowRun.current) return;
    if (!player.done) {
      ctl.sub(Math.min(player.active, 3));
      return;
    }
    if (tail.current === ctl.nonce) return;
    tail.current = ctl.nonce;
    ctl.sub(4);
    const c = doc.clauses.find((x) => x.map.kind === 'new');
    ctl.later(600, () =>
      ctl.click('[data-demo="policy-submit"]', () => {
        if (c) submit(c.no);
        ctl.later(900, () => ctl.done());
      }),
    );
  }, [ctl, runs, docId, player.active, player.done, doc]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
      <Panel title="制度文件与手册" bodyClassName="p-2">
        <ul className="space-y-1">
          {POLICIES.map((d, i) => (
            <li key={d.id}>
              <button type="button" data-demo={`policy-doc-${i}`} onClick={() => setDocId(d.id)} className={cx('w-full rounded-md px-3 py-2.5 text-left transition-colors', d.id === docId ? 'bg-primary-50' : 'hover:bg-ink-50')}>
                <div className="text-sm font-medium text-ink-900">{d.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-500">
                  <Badge tone={d.kind === '区域通知' ? 'amber' : 'neutral'}>{d.kind}</Badge>
                  {d.pages} 页
                  {runs[d.id] ? <span className="text-pine-600">已解读</span> : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-3 py-2 text-xs leading-relaxed text-ink-500">制度与手册均为虚构，条款内容为原型编写的概括摘要。</p>
      </Panel>
      <Panel
        title={doc.title}
        desc="AI 解读 → 判断可校验性 → 与现有规则比对 → 生成带大类与依据的规则草案（需审核）"
        actions={
          runs[docId] ? (
            <PlayerControls player={player} />
          ) : (
            <Button variant="agent" icon="sparkle" onClick={() => setRuns((r) => ({ ...r, [docId]: Date.now() }))} data-demo="policy-run">
              AI 解读
            </Button>
          )
        }
      >
        {!runs[docId] ? (
          <Empty icon="file" title="尚未解读">
            点击“AI 解读”，查看智能体如何把制度与手册转为可执行的规则，以及哪些条款无法由上传的单据数据校验。
          </Empty>
        ) : (
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-4">
              <PipelineView stages={stages} player={player} />
            </div>
            <div className="col-span-8 space-y-3">
              {doc.clauses.slice(0, player.done ? doc.clauses.length : Math.floor((player.t / Math.max(1, player.total)) * doc.clauses.length)).map((c) => (
                <div key={c.no} className="anim-rise rounded-[14px] border border-black/[0.07] bg-surface p-4">
                  <div className="flex items-center gap-2">
                    <span className="code text-xs text-ink-500">{c.no}</span>
                    <Badge tone={c.checkable === 'none' ? 'neutral' : c.checkable === 'code' ? 'rule' : 'agent'}>{c.checkable === 'none' ? '不可由单据数据校验' : c.checkable === 'code' ? '可转为确定性规则' : '需智能体语义判断'}</Badge>
                    <span className="ml-auto">
                      {c.map.kind === 'covered' ? (
                        <Badge tone="pine" icon="checkCircle">
                          已覆盖
                        </Badge>
                      ) : c.map.kind === 'new' ? (
                        <Badge tone="primary" icon="plus">
                          建议新增
                        </Badge>
                      ) : (
                        <Badge tone="neutral">转人工 / 其他数据</Badge>
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-800">{c.summary}</p>
                  {c.map.kind === 'covered' ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.map.rules.map((id) => (
                        <button key={id} type="button" onClick={() => onOpen(id)} className="rounded-[12px] border border-black/[0.07] px-2 py-0.5 text-xs text-primary-600 hover:bg-primary-50">
                          {id} {POOL_MAP.get(id)?.name}
                          <span className="ml-1 text-ink-400">{POOL_MAP.get(id) ? MAJOR_LABEL[POOL_MAP.get(id)!.major] : ''}</span>
                        </button>
                      ))}
                    </div>
                  ) : c.map.kind === 'new' ? (
                    <div className="mt-2 rounded-md bg-primary-50/60 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-ink-800">
                        <Icon name="sparkle" size={14} className="text-agent-600" />
                        草案：{c.map.draft}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <EngineTag engine={c.map.engine} />
                        <Button size="sm" className="ml-auto" data-demo="policy-submit" disabled={!can || submitted.has(`${docId}:${c.no}`)} onClick={() => submit(c.no)}>
                          {submitted.has(`${docId}:${c.no}`) ? '已提交' : '提交审核'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-ink-500">{c.map.reason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

