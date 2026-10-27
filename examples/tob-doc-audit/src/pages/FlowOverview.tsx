import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Panel, Tabs, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { ActorChip, ActorDot, NecessityTag } from '@/components/flow/ActorChip';
import { DataChip, useDataModal } from '@/components/flow/DataObject';
import { LineageView } from '@/components/flow/LineageView';
import { Swimlane } from '@/components/flow/Swimlane';
import { DagLegend, FlowDag } from '@/components/flow/FlowDag';
import { FormatGallery } from '@/components/flow/FormatPreview';
import { ACTORS, ACTOR_ORDER } from '@/flow/actors';
import { DATA_OBJECTS, DATA_ORDER, type DataKey } from '@/flow/dataObjects';
import { goToStep, openFlowStart, startFlow, stepStateOf, useFlow, type FlowState } from '@/flow/director';
import { counterpartyLineage, recordLineage } from '@/flow/lineage';
import { DAG_COLS, EDGES, PHASES, STEPS, STEP_INDEX, depsOf, stepById, succOf, type StepId } from '@/flow/workflow';
import { USERS } from '@/domain/orgs';
import { mockLedger, SCENARIOS } from '@/mock/ledger';
import { runChecks } from '@/rules/engine';
import { hash } from '@/lib/format';
import type { BizType } from '@/domain/docs';
import { href } from '@/lib/router';
import { useCases } from '@/state/casebook';
import { useCheckSetup } from '@/state/useCheckSetup';

type LineageTab = 'ui' | 'api' | 'country';
type GraphTab = 'dag' | 'lane';

/** 全流程总览：端到端业务流程、操作方与时序、数据结构变化、智能体介入点与人机闭环 */
export function FlowOverview() {
  const f = useFlow((s) => s);
  const running = f.active && f.status !== 'finished' ? STEPS[f.idx].id : null;
  const [selected, setSelected] = useState<StepId>(running ?? 'check-run');
  const [graph, setGraph] = useState<GraphTab>('dag');
  const sel = STEPS[STEP_INDEX[selected]];
  // 演示进行中（含已完成）：点击环节直接把演示切换到该环节；未演示时只在下方展开详情
  const pick = (id: StepId) => {
    setSelected(id);
    if (f.active) goToStep(id);
  };
  const data = useDataModal();
  const agentSteps = STEPS.filter((s) => s.agent);
  const humanSteps = STEPS.filter((s) => s.human);

  return (
    <>
      <PageHeader
        title="全流程总览：一笔单据从提交到治理"
        crumbs={['原型讨论区', '全流程总览']}
        desc="把业务按真实依赖关系组成一张流程图（DAG）：规则库区域维护 → 界面上传 / RPA 接口上传 → 按区域规则库核查、自动导出并保存 → 复核与辖内查看 → 驾驶舱。每个环节由谁（子公司核查岗、复核岗、区域与集团财务管理员、RPA、后台批量、智能体）在什么时点、由什么触发、处理什么数据、产出什么。可一键按依赖自动运行，也可点击任一环节单独查看。"
        actions={
          <>
            <Button size="lg" variant="primary" icon="play" onClick={openFlowStart}>
              一键运行完整流程
            </Button>
          </>
        }
      >
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {[
            [String(STEPS.length), '个环节'],
            [String(EDGES.length), '条依赖'],
            [String(DAG_COLS), '层（同层可并行）'],
            [String(ACTOR_ORDER.length), '类操作方'],
            [String(agentSteps.length), '个环节有智能体参与'],
            [String(humanSteps.length), '处人工把关'],
            [String(DATA_ORDER.length), '种数据对象'],
          ].map(([n, l]) => (
            <div key={l} className="flex items-baseline gap-1.5">
              <dt className="num text-[22px] font-semibold text-ink-900">{n}</dt>
              <dd className="text-sm text-ink-500">{l}</dd>
            </div>
          ))}
        </dl>
      </PageHeader>

      <SectionNav />
      <div className="space-y-6 px-10 pb-7 pt-4">
        <Panel
          id="sec-graph"
          title={graph === 'dag' ? '流程依赖图（DAG）：谁依赖谁、哪些可以并行' : '操作方泳道：示例一天里谁在什么时候做什么'}
          desc={
            graph === 'dag'
              ? `行是业务分支，列是依赖深度：箭头指向的环节必须等上游完成，同一列的环节互不依赖、可并行。${f.active ? '演示进行中：点击任一环节直接切换演示到该环节。' : '悬停或点击环节查看沿边传递的数据。'}`
              : '行是操作方，列是示例一天的时间顺序（依赖图的一种执行顺序，也是一键运行的默认顺序）。实心卡片为主责方，小标签为参与方。'
          }
          actions={
            <Tabs<GraphTab>
              value={graph}
              onChange={setGraph}
              items={[
                { value: 'dag', label: '依赖图（DAG）' },
                { value: 'lane', label: '操作方泳道' },
              ]}
            />
          }
        >
          {graph === 'dag' ? (
            <>
              <FlowDag f={f} selected={selected} onSelect={pick} />
              <DagLegend />
            </>
          ) : (
            <Swimlane selected={selected} running={running} done={f.active ? [...f.completed, ...f.assumed] : []} onSelect={pick} />
          )}
          <StepCard step={sel} f={f} onData={data.open} onSelect={setSelected} />
        </Panel>

        <Panel id="sec-actors" title="操作方分工" desc="人工只在需要判断、授权和承担责任的地方出现；重复、可规则化的工作交给 RPA 与后台批量；需要“读懂”的部分交给智能体。">
          <div className="grid grid-cols-4 gap-3">
            {ACTOR_ORDER.map((a) => {
              const lead = STEPS.filter((s) => s.actor === a);
              const join = STEPS.filter((s) => s.with.includes(a));
              return (
                <div key={a} className="rounded-[14px] bg-ink-50/70 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <ActorChip actor={a} />
                    <span className="text-2xs text-ink-400">{ACTORS[a].kind}</span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-ink-600">{ACTORS[a].desc}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {lead.map((s) => (
                      <button key={s.id} type="button" onClick={() => setSelected(s.id)} className="num rounded-full bg-white px-1.5 text-2xs leading-[18px] text-ink-800 ring-1 ring-black/[0.06] hover:ring-primary-300" title={s.title}>
                        {STEP_INDEX[s.id] + 1} 主责
                      </button>
                    ))}
                    {join.map((s) => (
                      <button key={s.id} type="button" onClick={() => setSelected(s.id)} className="num rounded-full px-1.5 text-2xs leading-[18px] text-ink-500 ring-1 ring-black/[0.06] hover:ring-primary-300" title={s.title}>
                        {STEP_INDEX[s.id] + 1} 参与
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <LineagePanel />

        <Panel
          id="sec-formats"
          title="文件与数据格式"
          desc="每种文件和数据实际长什么样：Excel 文件按导出模块的同一份版式渲染（与下载文件一致，可下载样例），内存与接口数据给出 JSON 样例。数据来自本次演示的真实执行结果。"
        >
          <FormatGallery groups={FORMAT_GROUPS} />
        </Panel>

        <Panel id="sec-objects" title="数据对象目录" desc="流程中流转的每一种数据结构：类型、载体、敏感度、由哪个环节产生、被哪些环节使用。点击行查看格式样例与字段结构。" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs text-ink-500">
              <tr>
                <th className="px-5 py-2 font-medium">数据对象</th>
                <th className="px-3 py-2 font-medium">类型</th>
                <th className="px-3 py-2 font-medium">产生方</th>
                <th className="px-3 py-2 font-medium">载体与存放</th>
                <th className="px-3 py-2 font-medium">敏感度</th>
                <th className="px-3 py-2 font-medium">产生于</th>
                <th className="px-5 py-2 font-medium">使用于</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {DATA_ORDER.map((k) => {
                const d = DATA_OBJECTS[k];
                const out = STEPS.filter((s) => s.outputs.includes(k));
                const inn = STEPS.filter((s) => s.inputs.includes(k));
                return (
                  <tr key={k} className="cursor-pointer hover:bg-ink-50/60" onClick={() => data.open(k)}>
                    <td className="px-5 py-2 font-medium text-ink-900">{d.name}</td>
                    <td className="code px-3 py-2 text-agent-700">{d.type}</td>
                    <td className="px-3 py-2">
                      <ActorChip actor={d.producer} size="xs" short />
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-600">{d.carrier}</td>
                    <td className="px-3 py-2">
                      <Badge tone={d.sensitivity === '高' ? 'seal' : d.sensitivity === '中' ? 'amber' : 'pine'}>{d.sensitivity}</Badge>
                    </td>
                    <td className="num px-3 py-2 text-xs text-ink-600">{out.map((s) => STEP_INDEX[s.id] + 1).join('、') || (d.producer === 'portal' || k === 'policyDoc' ? '外部' : '运行时组装')}</td>
                    <td className="num px-5 py-2 text-xs text-ink-600">{inn.map((s) => STEP_INDEX[s.id] + 1).join('、') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <div id="sec-agent" className="grid scroll-mt-16 grid-cols-12 gap-6">
          <Panel title="智能体介入点与人工把关" className="col-span-8" bodyClassName="p-0" desc="智能体只做“读懂与判断”，结论附置信度与推理轨迹；是否采纳、发布、退回由人决定。">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="w-[200px] px-5 py-2 font-medium">环节</th>
                  <th className="px-3 py-2 font-medium">智能体做什么</th>
                  <th className="w-[260px] px-5 py-2 font-medium">人工把关</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] align-top">
                {STEPS.filter((s) => s.agent || s.human).map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-ink-50/60" onClick={() => setSelected(s.id)}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="num text-xs text-ink-400">{STEP_INDEX[s.id] + 1}</span>
                        <span className="font-medium text-ink-900">{s.short}</span>
                      </div>
                      <div className="mt-1">
                        <ActorChip actor={s.actor} size="xs" short />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs leading-relaxed text-agent-700">{s.agent ?? <span className="text-ink-400">—</span>}</td>
                    <td className="px-5 py-2.5 text-xs leading-relaxed text-primary-700">{s.human ?? <span className="text-ink-400">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <CasebookPanel className="col-span-4" />
        </div>
      </div>
      {data.modal}
    </>
  );
}

/* ---------------- 页内分区导航 ---------------- */

const SECTIONS: { id: string; label: string }[] = [
  { id: 'sec-graph', label: '流程依赖图' },
  { id: 'sec-actors', label: '操作方分工' },
  { id: 'sec-lineage', label: '数据流转' },
  { id: 'sec-formats', label: '文件与数据格式' },
  { id: 'sec-objects', label: '数据对象目录' },
  { id: 'sec-agent', label: '智能体与人工把关' },
];

/** 吸顶的分区导航：长页面里快速定位，并显示当前所在分区 */
function SectionNav() {
  const [cur, setCur] = useState(SECTIONS[0].id);
  useEffect(() => {
    const root = document.getElementById('main');
    const els = SECTIONS.map((x) => document.getElementById(x.id)).filter((x): x is HTMLElement => !!x);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setCur(vis[0].target.id);
      },
      { root, rootMargin: '-80px 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <nav aria-label="页面分区" className="sticky top-0 z-20 mt-5 border-b border-black/[0.05] bg-paper/85 px-10 py-2.5 backdrop-blur-xl">
      <ul className="flex flex-wrap gap-1">
        {SECTIONS.map((x, i) => (
          <li key={x.id}>
            <button
              type="button"
              onClick={() => document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              aria-current={cur === x.id ? 'true' : undefined}
              className={cx('flex h-8 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors duration-150', cur === x.id ? 'bg-ink-900 font-medium text-white' : 'text-ink-600 hover:bg-black/[0.05] hover:text-ink-900')}
            >
              <span className={cx('num text-xs', cur === x.id ? 'text-white/70' : 'text-ink-400')}>{i + 1}</span>
              {x.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const FORMAT_GROUPS: { title: string; desc: string; items: { k: DataKey; label: string; hint: string }[] }[] = [
  {
    title: '文件（Excel）',
    desc: '上传的三类明细与自动导出的结果文件',
    items: [
      { k: 'docFile', label: '三类单据明细（收款 / 付款 / 进口结算单）', hint: '输入 · 界面或接口上传' },
      { k: 'resultXlsx', label: '核查结果文件', hint: '输出 · 各类疑点 + 国别疑点工作表' },
    ],
  },
  {
    title: '业务库表',
    desc: '规则库、用户组织、核查批次与判例（原型建议表名）',
    items: [
      { k: 'userOrg', label: '用户与组织对应表', hint: 'doc_user_org' },
      { k: 'ruleLib', label: '区域规则库', hint: 'doc_rule_lib · 含大类与依据' },
      { k: 'ruleDiff', label: '规则库版本与变更', hint: 'doc_rule_lib_version · diff' },
      { k: 'batchRecord', label: '核查批次与疑点明细', hint: 'doc_check_batch / finding' },
      { k: 'casebook', label: '判例库条目', hint: 'doc_casebook' },
      { k: 'cockpitAgg', label: '驾驶舱聚合', hint: '按组织 / 大类 / 日期' },
    ],
  },
  {
    title: '文书、页面与接口',
    desc: '制度文件、供应商协同平台 数据来源与上传接口',
    items: [
      { k: 'policyDoc', label: '制度文件与手册', hint: '文件原文版式' },
      { k: 'platformData', label: '供应商待付款申请', hint: 'RPA 数据来源' },
      { k: 'apiUpload', label: '接口上传请求', hint: 'POST /batches' },
    ],
  },
  {
    title: '内部数据（JSON）',
    desc: '核查过程中的中间结构',
    items: [
      { k: 'docRecord', label: '标准化单据记录', hint: 'DocRecord' },
      { k: 'batchIndex', label: '批次级国别索引', hint: '三类合并 · 交易对方国别分布' },
      { k: 'semKey', label: '语义组合与判定缓存', hint: '编码 + 规范化用途说明' },
      { k: 'judgement', label: '规则判定与推理轨迹', hint: '推理轨迹 / JSON' },
      { k: 'recordResult', label: '单笔核查结果', hint: 'RecordResult' },
      { k: 'runStats', label: '批次统计', hint: 'RunStats' },
    ],
  },
];

/* ---------------- 选中环节详情 ---------------- */

function StepCard({ step, f, onData, onSelect }: { step: (typeof STEPS)[number]; f: FlowState; onData: (k: DataKey) => void; onSelect: (id: StepId) => void }) {
  const i = STEP_INDEX[step.id];
  const phase = PHASES.find((p) => p.key === step.phase)!;
  return (
    <div key={step.id} className="anim-fade mt-5 grid grid-cols-12 gap-6 rounded-[16px] bg-ink-50/70 p-5">
      <div className="col-span-5">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          <span className="num flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: ACTORS[step.actor].color }}>
            {i + 1}
          </span>
          {phase.title}
        </div>
        <h3 className="mt-2 text-[17px] font-semibold leading-snug text-ink-900">
          {step.title}
          <NecessityTag n={step.necessity} className="ml-2 align-[3px]" />
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ActorChip actor={step.actor} />
          {step.with.map((a) => (
            <ActorChip key={a} actor={a} size="xs" short />
          ))}
          <Badge tone="neutral" icon="clock">
            {step.when} · {step.trigger}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-700">{step.narration}</p>
        {step.necessity ? (
          <p className={cx('mt-2 rounded-[10px] px-3 py-2 text-xs leading-relaxed', step.necessity === 'required' ? 'bg-ink-900/[0.05] text-ink-800' : 'border border-dashed border-ink-300 bg-white text-ink-600')}>
            <span className="font-semibold">{step.necessity === 'required' ? '为什么必需：' : '为什么可选：'}</span>
            {step.basis}
          </p>
        ) : null}
        <div className="mt-3 space-y-1.5">
          {(
            [
              ['上游（先完成）', depsOf(step.id), 'up'],
              ['下游（等待本环节）', succOf(step.id), 'down'],
            ] as const
          ).map(([label, ids, dir]) => (
            <div key={label} className="flex flex-wrap items-center gap-1.5">
              <span className="w-[108px] shrink-0 text-xs text-ink-500">{label}</span>
              {ids.length ? (
                ids.map((id) => {
                  const e = EDGES.find((x) => (dir === 'up' ? x.from === id && x.to === step.id : x.from === step.id && x.to === id))!;
                  const st = stepStateOf(f, id);
                  return (
                    <button key={id} type="button" onClick={() => onSelect(id)} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-white px-2 text-xs text-ink-800 ring-1 ring-black/[0.06] hover:ring-primary-300">
                      <span className="num font-semibold" style={{ color: ACTORS[stepById(id).actor].color }}>
                        {STEP_INDEX[id] + 1}
                      </span>
                      {stepById(id).short}
                      <span className={cx('text-2xs', e.data ? 'text-primary-600' : 'text-ink-400')}>{e.label}</span>
                      {st === 'done' ? <Icon name="check" size={11} className="text-pine-500" /> : null}
                    </button>
                  );
                })
              ) : (
                <span className="text-xs text-ink-400">{dir === 'up' ? '无，可直接启动（与其他起点并行）' : '无，流程终点'}</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" icon="arrowRight" onClick={() => goToStep(step.id)}>
            打开此环节页面
          </Button>
          <Button size="sm" variant="ghost" icon="play" onClick={() => void startFlow({ mode: 'auto', reset: false, from: step.id })}>
            从此环节开始演示
          </Button>
          <span className="self-center text-2xs text-ink-400">演示角色：{USERS[step.role].roleName}</span>
        </div>
      </div>
      <div className="col-span-4">
        <div className="mb-2 text-xs font-medium text-ink-500">子步骤（按发生顺序）</div>
        <ol className="space-y-1.5">
          {step.subs.map((x, k) => (
            <li key={k} className="flex items-center gap-2 text-sm">
              <span className="num w-4 text-right text-xs text-ink-400">{k + 1}</span>
              <ActorDot actor={x.actor} />
              <span className="min-w-0 flex-1 text-ink-800">{x.title}</span>
              <span className="shrink-0 text-2xs" style={{ color: ACTORS[x.actor].color }}>
                {ACTORS[x.actor].short}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="col-span-3 space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-500">输入数据</div>
          <div className="flex flex-wrap gap-1">{step.inputs.length ? step.inputs.map((k) => <DataChip key={k} k={k} onOpen={onData} />) : <span className="text-xs text-ink-400">外部来源</span>}</div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-500">产出数据</div>
          <div className="flex flex-wrap gap-1">
            {step.outputs.map((k) => (
              <DataChip key={k} k={k} onOpen={onData} tone="out" />
            ))}
          </div>
        </div>
        {step.agent ? (
          <p className="flex gap-1.5 text-xs leading-relaxed text-agent-700">
            <Icon name="sparkle" size={13} className="mt-[3px] shrink-0" />
            {step.agent}
          </p>
        ) : null}
        {step.human ? (
          <p className="flex gap-1.5 text-xs leading-relaxed text-primary-700">
            <Icon name="user" size={13} className="mt-[3px] shrink-0" />
            {step.human}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------- 数据流转 ---------------- */

function LineagePanel() {
  const [tab, setTab] = useState<LineageTab>('ui');
  const { ctx, rules, libLabel, user } = useCheckSetup();
  const cases = useCases();
  // 界面上传：三类演示台账合并为一个批次；接口上传：RPA 的收款线上付款申请（与一键核查页的演示数据一致）
  const uiRun = useMemo(() => runChecks((['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b)), rules, ctx), [rules, ctx]);
  const apiRun = useMemo(() => runChecks(mockLedger('receipt').filter((r) => (SCENARIOS[r.key] ? hash(r.key) % 2 === 0 : hash(r.key) % 5 === 0)), rules, ctx), [rules, ctx]);
  const uiStages = useMemo(() => {
    const pick = uiRun.results.find((r) => r.findings.some((f) => f.ruleId === 'R405' || f.ruleId === 'R406')) ?? uiRun.results.find((r) => r.status === 'fail') ?? uiRun.results[0];
    return { stages: recordLineage(pick, rules, uiRun.ctx, { cases, source: 'ui', libLabel, empNo: user.empNo }), subject: `${pick.rec.f.docNo}（${pick.rec.f.remark1}）` };
  }, [uiRun, rules, cases, libLabel, user.empNo]);
  const apiStages = useMemo(() => {
    const pick = apiRun.results.find((r) => r.status === 'fail' && r.findings.some((f) => f.engine !== 'code')) ?? apiRun.results.find((r) => r.status === 'fail') ?? apiRun.results[0];
    return { stages: recordLineage(pick, rules, apiRun.ctx, { cases, source: 'api', libLabel, empNo: user.empNo }), subject: `${pick.rec.f.docNo}（${pick.rec.f.domesticName}）` };
  }, [apiRun, rules, cases, libLabel, user.empNo]);
  const countryStages = useMemo(() => counterpartyLineage(uiRun), [uiRun]);
  const cur = tab === 'ui' ? uiStages : tab === 'api' ? apiStages : countryStages;
  return (
    <Panel
      id="sec-lineage"
      title="数据结构如何一步步变化"
      desc="跟踪一笔真实执行的演示数据，看它在每个阶段是什么结构、由谁产生、哪些字段原样保留 / 映射改名 / 派生计算 / 新增 / 脱敏 / 不再携带。"
      actions={
        <Tabs<LineageTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'ui', label: '界面上传的一笔' },
            { value: 'api', label: '接口上传的一笔（RPA）' },
            { value: 'country', label: '一个交易对方（国别大类）' },
          ]}
        />
      }
    >
      {cur ? (
        <>
          <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
            <Icon name="eye" size={13} />
            跟踪对象：<span className="code text-ink-800">{cur.subject}</span>
          </p>
          <LineageView key={tab} stages={cur.stages} />
        </>
      ) : (
        <p className="text-sm text-ink-500">本批次没有国别不唯一的交易对方。</p>
      )}
    </Panel>
  );
}

/* ---------------- 判例库 ---------------- */

function CasebookPanel({ className }: { className?: string }) {
  const cases = useCases();
  return (
    <Panel title="人机协同闭环：判例库" className={className} desc="复核岗“确认疑点 / 判定误报”的结论回流判例库：夜间跑批时同类用途说明直接复用，并作为提示词中的示例。">
      <div className="flex items-baseline gap-2">
        <span className="num text-2xl font-semibold text-ink-900">{cases.length}</span>
        <span className="text-sm text-ink-500">
          条（确认 {cases.filter((c) => c.decision === 'confirm').length}，误报 {cases.filter((c) => c.decision === 'reject').length}）
        </span>
      </div>
      <ul className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
        {cases.map((c) => (
          <li key={c.id} className="rounded-[12px] bg-ink-50/70 px-3 py-2">
            <div className="flex items-center gap-2">
              <Badge tone={c.decision === 'confirm' ? 'seal' : 'pine'}>{c.decision === 'confirm' ? '确认疑点' : '判定误报'}</Badge>
              <span className="code text-xs text-ink-500">{c.ruleId}</span>
              <span className="num ml-auto text-2xs text-ink-400">{c.at}</span>
            </div>
            <div className="code mt-1 truncate text-xs text-ink-800" title={c.key}>
              {c.key}
            </div>
            <div className="mt-0.5 text-2xs text-ink-400">{c.who}</div>
          </li>
        ))}
      </ul>
      <a href={href('/agent-ops')} className={cx('mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-500 hover:underline')}>
        判定缓存与夜间跑批
        <Icon name="arrowRight" size={12} />
      </a>
    </Panel>
  );
}
