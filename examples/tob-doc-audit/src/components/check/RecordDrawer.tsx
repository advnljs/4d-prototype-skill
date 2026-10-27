import { useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Callout, Drawer, EngineTag, Stamp, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/Toast';
import { BIZ_LABEL, type FieldKey } from '@/domain/docs';
import { SCENARIOS } from '@/mock/ledger';
import { traceRule } from '@/rules/engine';
import { LEVEL_LABEL, MAJOR_LABEL, type CheckContext, type Judgement, type RecordResult, type RuleDef } from '@/rules/types';
import { LineageView } from '@/components/flow/LineageView';
import { recordLineage } from '@/flow/lineage';
import { dateTime } from '@/lib/format';
import { addCase, findCase, useCases } from '@/state/casebook';
import { TODAY } from '@/state/context';
import { useCan, useUser } from '@/state/session';
import { DeclarationForm } from './DeclarationForm';
import { TraceTimeline } from './TraceTimeline';

const OUTCOME: Record<Judgement['verdict'], { label: string; tone: 'seal' | 'amber' | 'pine' | 'neutral' }> = {
  fail: { label: '疑点', tone: 'seal' },
  warn: { label: '疑问（需人工确认）', tone: 'amber' },
  pass: { label: '通过', tone: 'pine' },
  skip: { label: '不适用', tone: 'neutral' },
};

export function RecordDrawer({
  res,
  rules,
  ctx,
  onClose,
  extra,
}: {
  res: RecordResult | null;
  rules: RuleDef[];
  ctx: CheckContext;
  onClose: () => void;
  extra?: (res: RecordResult) => ReactNode;
}) {
  return (
    <Drawer
      open={!!res}
      onClose={onClose}
      width={1180}
      title={res ? <span className="code text-lg">{res.rec.f.docNo || res.rec.key}</span> : ''}
      subtitle={res ? `${BIZ_LABEL[res.rec.biz]}：${res.rec.f.domesticName} → ${res.rec.f.counterparty}` : ''}
    >
      {res ? <DrawerBody key={res.rec.key} res={res} rules={rules} ctx={ctx} extra={extra} /> : null}
    </Drawer>
  );
}

function DrawerBody({ res, rules, ctx, extra }: { res: RecordResult; rules: RuleDef[]; ctx: CheckContext; extra?: (res: RecordResult) => ReactNode }) {
  const evals = useMemo(() => rules.filter((rule) => rule.biz.includes(res.rec.biz)).map((rule) => ({ rule, j: traceRule(res.rec, rule, ctx) })), [res, rules, ctx]);
  const canReview = useCan('review');
  const order = { fail: 0, warn: 1, pass: 2, skip: 3 } as const;
  const sorted = [...evals].sort((a, b) => order[a.j.verdict] - order[b.j.verdict] || a.rule.id.localeCompare(b.rule.id));
  const firstAgent = sorted.find((e) => (e.j.verdict === 'fail' || e.j.verdict === 'warn') && e.rule.engine !== 'code') ?? sorted.find((e) => e.j.verdict === 'fail' || e.j.verdict === 'warn');
  const [open, setOpen] = useState<Set<string>>(() => new Set(firstAgent ? [firstAgent.rule.id] : res.cleared.map((c) => c.ruleId)));
  const cases = useCases();
  const user = useUser();
  const lineage = useMemo(() => recordLineage(res, rules, ctx, { cases }), [res, rules, ctx, cases]);
  const feedback = (ruleId: string) => findCase(cases, res, ruleId)?.decision;
  const sendFeedback = (f: (typeof res.findings)[number], decision: 'confirm' | 'reject') =>
    addCase(res, f, decision, `${user.name}（${user.empNo}）`, dateTime(new Date(TODAY.getTime() + (Date.now() % 3600000))));
  const scenario = SCENARIOS[res.rec.key];
  const bad = new Set<FieldKey>(res.findings.filter((f) => f.level === 'error').flatMap((f) => f.fields));
  const warn = new Set<FieldKey>(res.findings.filter((f) => f.level === 'warn').flatMap((f) => f.fields));
  const counts = { fail: 0, warn: 0, pass: 0, skip: 0 };
  evals.forEach((e) => counts[e.j.verdict]++);

  return (
    <div className="space-y-5 px-6 py-5">
      {scenario ? (
        <Callout tone="primary" icon="compass" title={`业务情景：${scenario.title}`}>
          {scenario.story}
          <span className="mt-1 block text-primary-600">期望智能体：{scenario.expect}</span>
        </Callout>
      ) : null}

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-7" data-flow-anchor="drawer-form">
          <DeclarationForm rec={res.rec} highlight={bad} warnFields={warn} />
        </div>
        <div className="col-span-5 space-y-3">
          <div className="relative rounded-[14px] border border-black/[0.07] bg-surface p-4" data-flow-anchor="drawer-findings">
            <div className="absolute right-4 top-3">
              {res.status === 'fail' ? <Stamp /> : res.status === 'warn' ? <Stamp label="待确认" tone="amber" /> : <Stamp label="通过" tone="pine" />}
            </div>
            <h3 className="text-md font-semibold text-ink-900">核查结论</h3>
            <p className="mt-0.5 text-xs text-ink-500">
              执行 {evals.length} 条规则：错误数据 {counts.fail}、疑问数据 {counts.warn}、通过 {counts.pass}、不适用 {counts.skip}
            </p>
            {res.findings.length ? (
              <ul className="mt-3 space-y-2.5">
                {res.findings.map((f) => (
                  <li key={f.ruleId} className={cx('rounded-md border px-3 py-2.5', f.level === 'error' ? 'border-seal-200 bg-seal-50/60' : 'border-amber-100 bg-amber-50')}>
                    <div className="flex items-center gap-2">
                      <Badge tone={f.level === 'error' ? 'seal' : 'amber'}>{LEVEL_LABEL[f.level]}</Badge>
                      <span className="text-xs text-ink-500">{MAJOR_LABEL[f.major]}</span>
                      <span className="text-sm font-semibold text-ink-900">{f.ruleName}</span>
                      <span className="code ml-auto text-xs text-ink-400">{f.ruleId}</span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{f.message}</p>
                    {f.suggestion ? (
                      <p className="mt-1 flex gap-1 text-sm text-primary-700">
                        <Icon name="arrowRight" size={14} className="mt-[3px] shrink-0" />
                        {f.suggestion}
                      </p>
                    ) : null}
                    <div className="mt-2 flex items-center gap-2">
                      <EngineTag engine={f.engine} />
                      {f.confidence !== undefined && f.engine !== 'code' ? <span className="num text-xs text-ink-500">置信度 {f.confidence.toFixed(2)}</span> : null}
                      <span className="ml-auto flex gap-1">
                        {feedback(f.ruleId) ? (
                          <span className="flex items-center gap-1 text-xs text-ink-500">
                            <Icon name="database" size={12} />
                            {feedback(f.ruleId) === 'confirm' ? '已确认为疑点，已入判例库' : '已标记为误报，已入判例库'}
                          </span>
                        ) : !canReview ? (
                          <span className="text-2xs text-ink-400">复核岗确认 / 判定误报</span>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              data-demo={`confirm-${f.ruleId}`}
                              onClick={() => {
                                sendFeedback(f, 'confirm');
                                toast('success', '已确认疑点', '结论进入判例库，后续同类用途说明优先复用');
                              }}
                            >
                              确认疑点
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                sendFeedback(f, 'reject');
                                toast('info', '已标记为误报', '进入判例库：下次跑批同类用途说明按误报处理，并用于提示词示例');
                              }}
                            >
                              判定误报
                            </Button>
                          </>
                        )}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-pine-700">所有适用规则均通过。</p>
            )}
            {res.cleared.length ? (
              <Callout tone="agent" icon="shield" className="mt-3" title="智能体拦截了关键词预筛的误报">
                {res.cleared.map((c) => c.reason).join('；')}
              </Callout>
            ) : null}
          </div>
          {extra ? <div data-flow-anchor="drawer-extra">{extra(res)}</div> : null}
        </div>
      </div>

      <section data-flow-anchor="drawer-trace">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-md font-semibold text-ink-900">逐条规则执行明细</h3>
          <span className="text-xs text-ink-500">展开查看确定性规则的表达式求值，或智能体的推理轨迹</span>
        </div>
        <ul className="divide-y divide-black/[0.05] overflow-hidden rounded-[14px] border border-black/[0.07] bg-surface">
          {sorted.map(({ rule, j }) => {
            const o = OUTCOME[j.verdict];
            const isOpen = open.has(rule.id);
            return (
              <li key={rule.id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(rule.id)) n.delete(rule.id);
                      else n.add(rule.id);
                      return n;
                    })
                  }
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink-50"
                >
                  <Icon name="chevronRight" size={14} className={cx('shrink-0 text-ink-400 transition-transform duration-150', isOpen && 'rotate-90')} />
                  <span className="code w-12 shrink-0 text-ink-500">{rule.id}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{rule.name}</span>
                  <EngineTag engine={rule.engine} />
                  <span className="w-24 text-right">
                    <Badge tone={o.tone}>{o.label}</Badge>
                  </span>
                </button>
                {isOpen ? (
                  <div className="border-t border-black/[0.05] bg-ink-50/50 px-5 pb-1 pt-3 pl-12">
                    {j.steps?.length ? <TraceTimeline steps={j.steps} compact={rule.engine === 'code'} /> : <p className="pb-3 text-sm text-ink-500">{j.message}</p>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section data-flow-anchor="drawer-lineage">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-md font-semibold text-ink-900">数据流转：这笔记录的结构如何一步步变化</h3>
          <span className="text-xs text-ink-500">每个阶段的类型、由谁产生、字段是原样 / 映射 / 派生 / 新增 / 脱敏 / 不再携带</span>
        </div>
        <div className="rounded-[14px] border border-black/[0.07] bg-ink-50/50 p-4">
          <LineageView stages={lineage} compact initial={1} />
        </div>
      </section>
    </div>
  );
}
