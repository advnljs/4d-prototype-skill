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
import { moneyLineage, orderLineage } from '@/flow/lineage';
import { DAG_COLS, EDGES, PHASES, STEPS, STEP_INDEX, depsOf, stepById, succOf, type StepId } from '@/flow/workflow';
import { USERS } from '@/state/session';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { runScenario } from '@/sim/world';
import { useScenario } from '@/state/live';

type GraphTab = 'dag' | 'lane';
type LineageTab = 'order' | 'money';

/** 全流程总览：依赖图 / 泳道、操作方分工、数据流转、文件与数据格式、数据对象目录、自动化与人工把关 */
export function FlowOverview() {
  const f = useFlow((s) => s);
  const running = f.active && f.status !== 'finished' ? STEPS[f.idx].id : null;
  const [selected, setSelected] = useState<StepId>(running ?? 'dispatch');
  const [graph, setGraph] = useState<GraphTab>('dag');
  const sel = STEPS[STEP_INDEX[selected]];
  const pick = (id: StepId) => {
    setSelected(id);
    if (f.active) goToStep(id);
  };
  const data = useDataModal();
  const machineSteps = STEPS.filter((s) => s.machine);
  const humanSteps = STEPS.filter((s) => s.human);

  return (
    <>
      <PageHeader
        title="全流程总览：一单外卖从开店到结算"
        crumbs={['原型讨论区', '全流程总览']}
        desc="把业务按真实依赖关系组成一张流程图（DAG）：发券、开店、骑手上线 → 下单、支付 → 商家接单出餐 ∥ 派单与骑手到店，在取餐配送汇合 → 收货评价 → 运营看板；资金一支从支付流水起：渠道对账 → T+1 结算 → 打款，售后退款在下期冲减时与结算汇合。每个环节由谁、在什么时点、由什么触发、处理什么数据、产出什么。"
        actions={
          <Button size="lg" variant="primary" icon="play" onClick={openFlowStart}>
            一键运行完整流程
          </Button>
        }
      >
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          {[
            [String(STEPS.length), '个环节'],
            [String(EDGES.length), '条依赖'],
            [String(DAG_COLS), '层（同层可并行）'],
            [String(ACTOR_ORDER.length), '类操作方'],
            [String(machineSteps.length), '个环节有系统自动处理'],
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
          title={graph === 'dag' ? '流程依赖图（DAG）：谁依赖谁、哪些可以并行' : '操作方泳道：午高峰这一单，谁在什么时候做什么'}
          desc={
            graph === 'dag'
              ? `行是业务分支，列是依赖深度：箭头指向的环节必须等上游完成，同一列互不依赖、可并行（如商家接单与智能派单、备餐出餐与骑手到店）。${f.active ? '演示进行中：点击任一环节直接切换演示到该环节。' : '悬停或点击环节查看沿边传递的数据。'}`
              : '行是操作方，列是这一单的时间顺序（一键运行的默认顺序）。实心卡片为主责方，小标签为参与方。'
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

        <Panel id="sec-actors" title="操作方分工" desc="人只在需要判断、授权和承担责任的地方出现：下单、接单、出餐、取送、发券；价格、回调、派单、结算交给系统。">
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

        <Panel id="sec-formats" title="文件与数据格式" desc="每种数据实际长什么样：App 界面按三端原样，库表给出建议表名与样例行，接口报文给出 JSON，结算对账文件可下载。数据来自当前情景的真实执行结果。">
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
                    <td className="num px-3 py-2 text-xs text-ink-600">{out.map((s) => STEP_INDEX[s.id] + 1).join('、') || '—'}</td>
                    <td className="num px-5 py-2 text-xs text-ink-600">{inn.map((s) => STEP_INDEX[s.id] + 1).join('、') || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>

        <Panel id="sec-auto" title="自动化介入点与人工把关" bodyClassName="p-0" desc="系统负责“算”和“传”：价格、回调、派单、预警、结算；人负责“判断”和“担责”：发券、接单出餐、取送、售后同意。">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs text-ink-500">
              <tr>
                <th className="w-[220px] px-5 py-2 font-medium">环节</th>
                <th className="px-3 py-2 font-medium">系统 / 算法 / 外部系统做什么</th>
                <th className="w-[320px] px-5 py-2 font-medium">人工把关</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05] align-top">
              {STEPS.filter((s) => s.machine || s.human).map((s) => (
                <tr key={s.id} className="cursor-pointer hover:bg-ink-50/60" onClick={() => setSelected(s.id)}>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="num text-xs text-ink-400">{STEP_INDEX[s.id] + 1}</span>
                      <span className="font-medium text-ink-900">{s.short}</span>
                      <NecessityTag n={s.necessity} short />
                    </div>
                    <div className="mt-1">
                      <ActorChip actor={s.actor} size="xs" short />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs leading-relaxed text-agent-700">{s.machine ?? <span className="text-ink-400">—</span>}</td>
                  <td className="px-5 py-2.5 text-xs leading-relaxed text-primary-700">{s.human ?? <span className="text-ink-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
      {data.modal}
    </>
  );
}

const SECTIONS: { id: string; label: string }[] = [
  { id: 'sec-graph', label: '流程依赖图' },
  { id: 'sec-actors', label: '操作方分工' },
  { id: 'sec-lineage', label: '数据流转' },
  { id: 'sec-formats', label: '文件与数据格式' },
  { id: 'sec-objects', label: '数据对象目录' },
  { id: 'sec-auto', label: '自动化与人工把关' },
];

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
    title: 'App 与后台界面',
    desc: '三端与运营后台上看到的样子',
    items: [
      { k: 'cart', label: '确认订单（价格试算）', hint: '用户端 · 价格明细与计算过程' },
      { k: 'push', label: '新订单通知与推送记录', hint: '商家端 · 语音播报' },
      { k: 'review', label: '评价', hint: '商家端 · 星级与标签' },
      { k: 'couponTpl', label: '平台券配置', hint: '运营后台 · 表单' },
    ],
  },
  {
    title: '业务库表',
    desc: '原型建议表名，需研发确认',
    items: [
      { k: 'order', label: '订单与状态轨迹', hint: 'ord_order / ord_trail' },
      { k: 'menu', label: '菜单与库存', hint: 'mch_dish' },
      { k: 'track', label: '骑手轨迹', hint: 'rider_track · 时序库' },
      { k: 'metrics', label: '运营指标', hint: '实时数仓 · 半小时' },
    ],
  },
  {
    title: '接口报文与算法',
    desc: '支付网关报文、派单决策',
    items: [
      { k: 'payment', label: '支付请求与回调（幂等）', hint: 'PayRequest / PayCallback' },
      { k: 'dispatch', label: '派单决策过程', hint: '召回 → 打分 → ETA' },
      { k: 'refund', label: '退款分摊与网关退款', hint: 'RefundCalc / RefundRequest' },
    ],
  },
  {
    title: '文件',
    desc: '可下载',
    items: [{ k: 'settlement', label: '结算对账文件（Excel）', hint: '结算明细 · 勾稽' }],
  },
];

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
          <div className="flex flex-wrap gap-1">{step.inputs.length ? step.inputs.map((k) => <DataChip key={k} k={k} onOpen={onData} />) : <span className="text-xs text-ink-400">流程起点</span>}</div>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-500">产出数据</div>
          <div className="flex flex-wrap gap-1">
            {step.outputs.map((k) => (
              <DataChip key={k} k={k} onOpen={onData} tone="out" />
            ))}
          </div>
        </div>
        {step.machine ? (
          <p className="flex gap-1.5 text-xs leading-relaxed text-agent-700">
            <Icon name="cpu" size={13} className="mt-[3px] shrink-0" />
            {step.machine}
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

function LineagePanel() {
  const [tab, setTab] = useState<LineageTab>('order');
  const scenario = useScenario();
  const w = useMemo(() => runScenario(scenario), [scenario]);
  const stages = tab === 'order' ? orderLineage(w) : moneyLineage(w);
  return (
    <Panel
      id="sec-lineage"
      title="数据结构如何一步步变化"
      desc={`按当前情景“${SCENARIO_MAP[scenario].title}”真实执行一遍，跟踪订单与钱在每个阶段的结构：哪些字段原样保留、映射改名、派生计算、新增、脱敏、不再携带，以及状态怎么迁移。`}
      actions={
        <Tabs<LineageTab>
          value={tab}
          onChange={setTab}
          items={[
            { value: 'order', label: '一单订单' },
            { value: 'money', label: '一笔钱' },
          ]}
        />
      }
    >
      <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
        <Icon name="eye" size={13} />
        跟踪对象：<span className="code text-ink-800">{w.order!.no}</span>
      </p>
      <LineageView key={`${tab}-${scenario}`} stages={stages} />
    </Panel>
  );
}
