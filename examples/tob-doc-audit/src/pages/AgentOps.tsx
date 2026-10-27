import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Callout, Field, Input, Panel, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PipelineView, PlayerControls, useRunPlayer } from '@/components/check/RunViews';
import { fmtDuration, type Stage } from '@/agent/pipeline';
import { demoSemanticStats } from '@/mock/scale';
import { fmtInt, fmtPct } from '@/lib/format';
import { useFlowStep } from '@/flow/director';
import { useCases } from '@/state/casebook';

const TOKENS = 820;
const SEC = 1.6;

interface Est {
  n: number;
  comboRate: number;
  cacheRate: number;
  conc: number;
  semRules: number;
}

function estimate(e: Est) {
  const lines = Math.round(e.n * 1.02);
  const combos = Math.round(lines * e.comboRate);
  const fresh = Math.round(combos * (1 - e.cacheRate));
  const perRecord = Math.round(e.n * 0.12);
  const batchCalls = fresh + perRecord;
  const onlineCalls = e.n * e.semRules;
  return {
    lines,
    combos,
    fresh,
    perRecord,
    batchCalls,
    onlineCalls,
    batchTokens: batchCalls * TOKENS,
    onlineTokens: onlineCalls * TOKENS,
    batchMs: Math.ceil(batchCalls / e.conc) * SEC * 1000,
    onlineMs: onlineCalls * SEC * 1000,
  };
}

export function AgentOps() {
  const [est, setEst] = useState<Est>({ n: 4000, comboRate: 0.19, cacheRate: 0.72, conc: 8, semRules: 3 });
  const r = estimate(est);
  const s = demoSemanticStats();
  const ratio = s.uniqueNormalized / Math.max(1, s.txLines);
  return (
    <>
      <PageHeader
        title="智能体运行设计：逐笔在线还是离线跑批"
        crumbs={['原型讨论区', '智能体运行设计']}
        desc="需求按“点击后逐笔校验”描述。原型建议：确定性规则实时执行，语义判断按“归并 + 缓存 + 批量”方式运行，绝大多数场景秒级出结果，同时把大模型调用量压到逐笔方式的一成左右。"
        actions={<Badge tone="agent" icon="sparkle">供与业务、科技讨论</Badge>}
      />
      <div className="space-y-6 px-10 py-7">
        <Panel title="来自演示数据的依据" desc={`三类虚构单据合并统计：收款单、付款单、进口结算单共 ${fmtInt(s.rows)} 笔（上线前应以历史单据重新测算）。`}>
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-7">
              <Funnel
                rows={[
                  { label: '单据记录', value: s.rows, note: '需要核查的笔数' },
                  { label: '交易行（编码 + 用途说明）', value: s.txLines, note: '每笔 1–2 行' },
                  { label: '不重复的（编码, 用途说明）组合', value: s.uniqueRaw, note: '原文去重' },
                  { label: '规范化后的组合', value: s.uniqueNormalized, note: '去除项目标注、关联方前缀、单据号等' },
                ]}
              />
            </div>
            <div className="col-span-5 space-y-3 text-sm leading-relaxed text-ink-700">
              <p>
                语义判断（编码与用途说明是否匹配、用途说明是否笼统）的工作量取决于<strong>不重复的用途说明组合数</strong>，而不是记录笔数。演示数据中 {fmtInt(s.txLines)} 行只有 {fmtInt(s.uniqueNormalized)} 个组合（{fmtPct(ratio)}），“空运代理费”“一般贸易项下进口铁矿石货款”这类用途说明在真实业务中会每天重复出现。
              </p>
              <p>组合的判定结果可以缓存并跨天复用；只有新出现的组合才需要调用大模型。确定性规则（必填、金额勾稽、国家/地区、往来类型、审批、区域规则）全部用代码完成，单机毫秒级即可跑完上万笔。</p>
              <Callout tone="neutral" icon="help">
                组合率与缓存跨天命中率需要上线后实测；原型按 19% 与 72% 估算。明细金额取整、漏填账号这类问题完全不需要大模型。
              </Callout>
            </div>
          </div>
        </Panel>

        <Panel title="推荐架构：分层执行 + 语义缓存 + 人工反馈闭环">
          <Architecture />
        </Panel>

        <div className="grid grid-cols-12 gap-6">
          <Panel title="成本与时效估算" desc="调整参数查看两种方式的差异（单次调用按 820 tokens、1.6 秒估算）。" className="col-span-5">
            <div className="grid grid-cols-2 gap-4">
              <NumField label="日均核查笔数" value={est.n} min={100} max={50000} step={100} onChange={(v) => setEst({ ...est, n: v })} hint="假设：日均 1,000–4,000 笔" />
              <NumField label="语义规则数（逐笔方式）" value={est.semRules} min={1} max={10} step={1} onChange={(v) => setEst({ ...est, semRules: v })} hint="编码与用途、用途笼统、国家/地区与地址" />
              <NumField label="组合率（%）" value={Math.round(est.comboRate * 100)} min={1} max={100} step={1} onChange={(v) => setEst({ ...est, comboRate: v / 100 })} hint="原型假设 19%" />
              <NumField label="缓存命中率（%）" value={Math.round(est.cacheRate * 100)} min={0} max={99} step={1} onChange={(v) => setEst({ ...est, cacheRate: v / 100 })} hint="原型假设 72%" />
              <NumField label="批量并发数" value={est.conc} min={1} max={64} step={1} onChange={(v) => setEst({ ...est, conc: v })} hint="受模型服务配额限制" />
            </div>
          </Panel>
          <Panel title="估算结果（每日）" className="col-span-7" bodyClassName="p-0">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">指标</th>
                  <th className="px-4 py-2.5 text-right font-medium">逐笔在线</th>
                  <th className="px-4 py-2.5 text-right font-medium">批量 + 语义缓存</th>
                  <th className="px-5 py-2.5 text-right font-medium">节省</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05]">
                {[
                  ['大模型调用次数', fmtInt(r.onlineCalls), fmtInt(r.batchCalls), 1 - r.batchCalls / r.onlineCalls],
                  ['Token 消耗', fmtInt(r.onlineTokens), fmtInt(r.batchTokens), 1 - r.batchTokens / r.onlineTokens],
                  ['语义核查总耗时', fmtDuration(r.onlineMs), fmtDuration(r.batchMs), 1 - r.batchMs / r.onlineMs],
                ].map(([k, a, b, sv]) => (
                  <tr key={k as string}>
                    <td className="px-5 py-3 text-ink-700">{k}</td>
                    <td className="num px-4 py-3 text-right text-ink-600">{a}</td>
                    <td className="num px-4 py-3 text-right font-semibold text-ink-900">{b}</td>
                    <td className="num px-5 py-3 text-right text-pine-600">{fmtPct(Math.max(0, sv as number))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-black/[0.05] px-5 py-3 text-xs leading-relaxed text-ink-500">
              批量方式的调用 = 新组合 {fmtInt(r.fresh)}（{fmtInt(r.combos)} 个组合 × 未命中缓存）+ 逐笔复核 {fmtInt(r.perRecord)}（国别、性质语义复核约 12% 的记录）。逐笔方式 = 笔数 × 语义规则数，且串行等待。
            </div>
          </Panel>
        </div>

        <NightlyBatch est={est} r={r} />

        <div className="grid grid-cols-12 gap-6">
          <Panel title="三种运行方式对比" className="col-span-7" bodyClassName="p-0">
            <Compare />
          </Panel>
          <Panel title="建议的调度方式" className="col-span-5" bodyClassName="p-0">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-4 py-2 font-medium">场景</th>
                  <th className="px-3 py-2 font-medium">触发</th>
                  <th className="px-4 py-2 font-medium">运行方式</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.05] align-top">
                {[
                  ['界面上传核查', '核查岗上传后点击', '后台异步批量，数千笔约 1 分钟内出结果，自动导出并保存批次'],
                  ['接口上传核查', 'RPA 定时调用接口', 'RPA 读取供应商协同平台的待付款申请后上传，同一流程核查；接口返回批次号与结果'],
                  ['批次级国别一致性', '随每次核查', '三类单据合并统计同一交易对方的国家/地区，不依赖历史主数据'],
                  ['驾驶舱聚合', '实时', '由核查批次聚合，区域 / 集团分层展示'],
                  ['规则发布', '发布前', '强制回放近 30 天单据，命中量异常时提示'],
                  ['缓存预热', '每日夜间', '对前一日新出现的用途说明组合预先判定'],
                ].map(([a, b, c]) => (
                  <tr key={a}>
                    <td className="px-4 py-2.5 font-medium text-ink-900">{a}</td>
                    <td className="px-3 py-2.5 text-ink-600">{b}</td>
                    <td className="px-4 py-2.5 text-ink-700">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="大模型落地需要讨论的控制点">
          <div className="grid grid-cols-3 gap-6 text-sm leading-relaxed text-ink-700">
            {[
              ['一致性', '同一用途说明在不同时间应得到同一结论：固定模型版本、温度为 0、结构化输出；判定缓存与判例库进一步保证一致。'],
              ['可解释与可审计', '每个疑点保留推理轨迹（读取了哪些字段、调用了哪些工具、依据哪条规则、置信度），随核查批次留存，供内审与复核。'],
              ['不越权', '智能体只做判断与建议，不修改单据数据、不自动审批付款；规则库变更须管理员逐条确认后才发布。'],
              ['低置信度转人工', '置信度低于阈值（如 0.7）或仅有弱线索时输出“需人工确认”，而不是直接判错；人工结论回流判例库。'],
              ['数据安全', '使用集团内私有化部署的大模型，业务数据不出集团；提示词中尽量只放必要字段，名称类可脱敏。'],
              ['效果评估', '以人工复核结果为标签，按规则统计准确率与误报率；规则发布前后对比历史单据命中量，异常时自动告警。'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="mb-1 font-semibold text-ink-900">{t}</div>
                {d}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function NumField({ label, value, min, max, step, onChange, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; hint?: string }) {
  const id = `nf-${label}`;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
      />
    </Field>
  );
}

function Funnel({ rows }: { rows: { label: string; value: number; note: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-ink-800">{r.label}</span>
            <span className="text-xs text-ink-500">{r.note}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-5 rounded-r-[4px]" style={{ width: `calc(${(r.value / max) * 100}% - 6rem)`, minWidth: 6, background: i >= 2 ? '#2a78d6' : '#9ec5f4' }} />
            <span className="num text-sm font-semibold text-ink-900">{fmtInt(r.value)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const ARCH: { icon: IconName; title: string; desc: string; tone: 'ink' | 'rule' | 'agent' }[] = [
  { icon: 'inbox', title: '数据接入', desc: '界面上传、RPA 接口上传（三类 Excel）', tone: 'ink' },
  { icon: 'layers', title: '标准化', desc: '统一字段、推断到账日期', tone: 'ink' },
  { icon: 'code', title: '确定性规则', desc: '完整性、勾稽、款项性质、审批、区域', tone: 'rule' },
  { icon: 'merge', title: '语义归并', desc: '按（编码, 规范化用途说明）去重', tone: 'rule' },
  { icon: 'database', title: '判定缓存', desc: '命中即复用已确认结论', tone: 'rule' },
  { icon: 'sparkle', title: '批量智能体', desc: '并发、限流、失败重试', tone: 'agent' },
  { icon: 'shield', title: '自检与分级', desc: '误报拦截、低置信转人工', tone: 'agent' },
  { icon: 'sheet', title: '结果与报表', desc: '疑点文件、历史、看板', tone: 'ink' },
];

function Architecture() {
  const toneCls = { ink: 'border-ink-200 bg-surface text-ink-700', rule: 'border-rule-100 bg-rule-50 text-rule-700', agent: 'border-agent-100 bg-agent-50 text-agent-700' };
  return (
    <div>
      <ol className="flex items-stretch gap-2">
        {ARCH.map((a, i) => (
          <li key={a.title} className="flex min-w-0 flex-1 items-center gap-2">
            <div className={cx('flex h-full min-w-0 flex-1 flex-col rounded-lg border px-3 py-2.5', toneCls[a.tone])}>
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon name={a.icon} size={15} />
                {a.title}
              </div>
              <div className="mt-1 text-xs leading-snug opacity-80">{a.desc}</div>
            </div>
            {i < ARCH.length - 1 ? <Icon name="chevronRight" size={16} className="shrink-0 text-ink-300" /> : null}
          </li>
        ))}
      </ol>
      <div className="relative mx-[6%] mt-2 h-10" aria-hidden="true">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M 99 0 V 28 H 49 V 2" fill="none" stroke="#5a48b0" strokeWidth="0.25" vectorEffect="non-scaling-stroke" strokeDasharray="0" style={{ strokeWidth: 1.5 }} />
          <path d="M 47.8 6 L 49 1 L 50.2 6" fill="none" stroke="#5a48b0" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5 }} />
        </svg>
      </div>
      <div className="flex items-center justify-center gap-3 text-xs text-agent-700">
        <Icon name="refresh" size={14} />
        人工复核结论（确认疑点 / 判定误报）回流判例库与判定缓存，下次同类用途说明直接复用，并作为提示词中的示例
      </div>
      <div className="mt-4 flex items-center gap-5 text-xs text-ink-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-rule-100 bg-rule-50" />
          确定性代码（毫秒级，不调用大模型）
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-agent-100 bg-agent-50" />
          智能体（仅处理新组合与需语义复核的记录）
        </span>
      </div>
    </div>
  );
}

function Compare() {
  const rows: [string, string, string, string][] = [
    ['出结果时间', '数千笔需数小时，页面需一直等待', '秒级到分钟级（缓存命中多时更快）', '确定性规则即时；语义部分分钟级'],
    ['大模型调用量', '笔数 × 语义规则数', '只调用新组合 + 少量复核', '同批量'],
    ['同一用途说明结论一致性', '每次独立判断，可能前后不一', '缓存保证一致', '缓存保证一致'],
    ['失败处理', '单笔超时影响用户操作', '队列重试，不影响页面', '队列重试'],
    ['适合场景', '演示、少量即时查询', '日终全量预热缓存', '界面上传与接口上传（推荐）'],
  ];
  return (
    <table className="w-full text-sm">
      <thead className="bg-ink-50 text-left text-xs text-ink-500">
        <tr>
          <th className="px-4 py-2 font-medium" />
          <th className="px-3 py-2 font-medium">逐笔在线</th>
          <th className="px-3 py-2 font-medium">离线跑批</th>
          <th className="px-4 py-2 font-medium">
            实时规则 + 异步批量 <Badge tone="pine">推荐</Badge>
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-black/[0.05] align-top">
        {rows.map(([k, a, b, c]) => (
          <tr key={k}>
            <td className="px-4 py-2.5 font-medium text-ink-900">{k}</td>
            <td className="px-3 py-2.5 text-ink-600">{a}</td>
            <td className="px-3 py-2.5 text-ink-700">{b}</td>
            <td className="px-4 py-2.5 text-ink-800">{c}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NightlyBatch({ est, r }: { est: Est; r: ReturnType<typeof estimate> }) {
  const [runId, setRunId] = useState(0);
  const cases = useCases();
  const stages: Stage[] = useMemo(
    () => [
      { key: 'pull', title: '拉取当日数据', engine: 'code', actor: 'batch', summary: `${fmtInt(est.n)} 笔`, lines: [`界面上传与接口上传当日数据 ${fmtInt(est.n)} 笔`, '当日 ERP 新增单据（T+0 增量）'], ms: 900, real: '约 30 秒' },
      { key: 'rules', title: '确定性规则', engine: 'code', actor: 'batch', summary: `${fmtInt(est.n * 27)} 次判断`, lines: [`${fmtInt(est.n)} 笔 × 约 27 条规则`, '结论直接入结果库'], ms: 1000, real: fmtDuration(est.n * 27 * 0.004) },
      { key: 'merge', title: '语义归并', engine: 'code', actor: 'batch', summary: `${fmtInt(r.lines)} → ${fmtInt(r.combos)}`, lines: [`交易行 ${fmtInt(r.lines)}，不重复组合 ${fmtInt(r.combos)}`], ms: 900, real: '约 1 秒' },
      { key: 'cache', title: '判定缓存', engine: 'code', actor: 'batch', summary: `命中 ${fmtPct(est.cacheRate)}`, lines: [`命中缓存 ${fmtInt(r.combos - r.fresh)} 个组合，直接复用`, `判例库人工结论 ${cases.length} 条优先生效（确认疑点 ${cases.filter((c) => c.decision === 'confirm').length}、判定误报 ${cases.filter((c) => c.decision === 'reject').length}）`, `新组合 ${fmtInt(r.fresh)} 个进入智能体队列`], ms: 800, real: '约 1 秒' },
      { key: 'llm', title: '批量智能体', engine: 'agent', actor: 'agent', summary: `${fmtInt(r.batchCalls)} 次调用`, lines: [`并发 ${est.conc}，共 ${fmtInt(r.batchCalls)} 次调用，约 ${fmtInt(r.batchTokens)} tokens`, '失败自动重试 2 次，仍失败转人工队列'], ms: 2600, real: fmtDuration(r.batchMs) },
      { key: 'review', title: '自检与分级', engine: 'agent', actor: 'agent', summary: '低置信转人工', lines: ['置信度 < 0.7 或仅弱线索 → 需人工确认', '新判定写入缓存，供次日复用'], ms: 900, real: '约 5 秒' },
      { key: 'publish', title: '结果发布', engine: 'code', actor: 'batch', summary: '看板已更新', lines: ['疑点写入结果库并推送给经办组织', '更新单据质量看板'], ms: 700, real: '约 5 秒' },
    ],
    [est, r, cases],
  );
  const player = useRunPlayer(runId ? stages : [], runId);

  /* ---------- 全流程演示：⑫ 次日 02:00 夜间跑批 ---------- */
  const flowRun = useRef(0);
  const ctl = useFlowStep('night-batch', (c) => {
    c.later(800, () => {
      const id = Date.now();
      flowRun.current = id;
      setRunId(id);
    });
  });
  useEffect(() => {
    if (!ctl || !runId || runId !== flowRun.current) return;
    ctl.sub(Math.min(player.active, stages.length - 1));
    if (player.done) ctl.done();
  }, [ctl, runId, player.active, player.done, stages.length]);
  return (
    <Panel
      anchor="night-batch"
      title="模拟一次夜间跑批"
      desc={`按当前估算参数（${fmtInt(est.n)} 笔）演示批量流程；右侧为估算的真实耗时。`}
      actions={
        runId ? (
          <PlayerControls player={player} />
        ) : (
          <Button variant="primary" icon="play" onClick={() => setRunId(Date.now())}>
            开始模拟
          </Button>
        )
      }
    >
      {runId ? (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-6">
            <PipelineView stages={stages} player={player} />
          </div>
          <div className="col-span-6">
            <ul className="divide-y divide-black/[0.05] rounded-[14px] border border-black/[0.07]">
              {stages.map((s, i) => (
                <li key={s.key} className={cx('flex items-center justify-between px-4 py-2 text-sm', i === player.active && !player.done && 'bg-primary-50')}>
                  <span className="text-ink-700">{s.title}</span>
                  <span className="num text-ink-900">{s.real}</span>
                </li>
              ))}
              <li className="flex items-center justify-between bg-ink-50 px-4 py-2 text-sm font-semibold">
                <span>合计（估算）</span>
                <span className="num">{fmtDuration(r.batchMs + 60000 + est.n * 27 * 0.004)}</span>
              </li>
            </ul>
            <Callout tone="primary" icon="clock" className="mt-4">
              同样的数据如果逐笔在线调用，语义核查需要约 {fmtDuration(r.onlineMs)}。
            </Callout>
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-500">点击“开始模拟”。</p>
      )}
    </Panel>
  );
}
