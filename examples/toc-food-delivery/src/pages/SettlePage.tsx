import { Fragment, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Badge, Button, Panel, Progress, cx } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { ActorChip, NecessityTag } from '@/components/flow/ActorChip';
import { FormatLink } from '@/components/flow/DataObject';
import { SheetPreview } from '@/components/flow/FormatPreview';
import { SETTLE_RULE, balanced } from '@/domain/settlement';
import { vSetTimeout } from '@/flow/clock';
import { flowActive } from '@/flow/director';
import { downloadBytes } from '@/lib/download';
import { rmb } from '@/lib/format';
import { settleFileName, settlementSheet } from '@/lib/settleSheet';
import { buildXlsx } from '@/lib/xlsx/writer';
import { clockLabel, reached, type World } from '@/sim/world';
import { advance, prepareAt, useWorld } from '@/state/live';
import { useMoneyWalk, type MoneyStep } from '@/state/opsFlow';

const STAGES = ['汇总已对平的已完成订单', '逐笔分账与勾稽', '生成结算单与对账文件'];

export function SettlePage() {
  const w = useWorld();
  const [manual, setManual] = useState<{ id: MoneyStep; sub: number } | null>(null);
  const flow = useMoneyWalk();
  const cur = flow.id ? flow : manual ?? { id: null, sub: -1 };
  const settleSub = cur.id === 'settle' ? cur.sub : -1;
  const done = reached(w, 'settled');
  const run = () => {
    prepareAt('rated');
    setManual({ id: 'reconcile', sub: 0 });
    vSetTimeout(() => {
      advance('reconciled');
      setManual({ id: 'reconcile', sub: 2 });
    }, 1200);
    vSetTimeout(() => setManual({ id: 'settle', sub: 0 }), 2400);
    vSetTimeout(() => {
      setManual({ id: 'settle', sub: 1 });
      advance('settled');
    }, 3600);
    vSetTimeout(() => setManual({ id: 'settle', sub: 2 }), 4800);
    vSetTimeout(() => setManual(null), 6000);
  };
  const st = w.settle;
  const sheet = useMemo(() => (st ? settlementSheet(st.batch, st.line.orderNo) : null), [st]);
  const progress = done && settleSub < 0 ? 3 : Math.max(0, settleSub + (settleSub >= 0 ? 1 : 0));

  return (
    <>
      <PageHeader
        title="结算中心：对账、分账与打款"
        crumbs={['业务现场', '结算中心']}
        desc="次日 01:00 渠道对账，02:00 汇总已对平的已完成订单逐笔分账、勾稽后生成结算单与对账文件，08:00 打款到商家与骑手；售后退款在下一结算周期冲减。"
        actions={
          <Button variant="primary" icon="play" onClick={run} disabled={done || !!flow.id || !!manual} title={done ? '已结算；可在三端联动重新开始' : '演示订单还没走完时，会先用演示数据把它推进到“已评价”'}>
            立即运行（模拟 01:00 对账 + 02:00 结算）
          </Button>
        }
      />
      <div className="space-y-6 px-10 pb-8 pt-5">
        <MoneyChain w={w} cur={cur.id} />

        <Panel anchor="settle-recon" title="渠道对账" desc="定时调度 · 次日 01:00 · 下载网关对账单，与平台支付流水按 trade_no 逐笔核对；差异订单挂账，不进入当期结算。" actions={<FormatLink k="recon" label="数据格式" />}>
          <Recon w={w} sub={cur.id === 'reconcile' ? cur.sub : -1} />
        </Panel>

        <Panel anchor="settle-run" title="T+1 结算任务" desc="定时调度 · 次日 02:00 · 只结算“已完成”且渠道对账已对平的订单；售后退款在下一周期冲减。">
          <ol className="grid grid-cols-3 gap-4">
            {STAGES.map((s, i) => {
              const state = progress > i + 1 || (done && settleSub < 0) ? 'done' : settleSub === i ? 'run' : progress > i ? 'done' : 'todo';
              return (
                <li key={s} className={cx('rounded-[16px] p-4 ring-1 transition-colors duration-300', state === 'run' ? 'bg-primary-50 ring-primary-300' : state === 'done' ? 'bg-pine-50 ring-pine-100' : 'bg-ink-50 ring-ink-950/[0.04]')}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs', state === 'done' ? 'bg-pine-500 text-white' : state === 'run' ? 'brand-grad text-white' : 'bg-surface text-ink-500')}>{state === 'done' ? <Icon name="check" size={12} strokeWidth={3} /> : i + 1}</span>
                    {s}
                  </div>
                  <div className="mt-3">
                    <Progress value={state === 'done' ? 100 : state === 'run' ? 60 : 0} running={state === 'run'} tone={state === 'done' ? 'pine' : 'primary'} />
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    {i === 0 ? (st ? `${st.batch.length} 笔订单，用户实付 ${rmb(st.summary.payable)}` : '读取订单库中“已完成”且已对平的订单') : i === 1 ? (st ? `勾稽 ${st.summary.unbalanced ? `不平 ${st.summary.unbalanced} 笔` : '全部平衡'}` : '佣金、骑手收入、通道费、平台净收入') : st ? settleFileName() : '结算单 + 对账 Excel'}
                  </p>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <ActorChip actor="scheduler" size="xs" />
            <ActorChip actor="platform" size="xs" />
            <span>
              规则：佣金率 {SETTLE_RULE.commissionRate * 100}%（商品 + 包装 − 商家满减）· 通道费 {SETTLE_RULE.channelRate * 100}% · 骑手基础单价 {rmb(SETTLE_RULE.riderBase)}，超距每公里 {rmb(SETTLE_RULE.riderPerKm)}，雨天 +{rmb(SETTLE_RULE.riderRain)}，等餐超 10 分钟 +{rmb(SETTLE_RULE.riderWait)}
            </span>
          </div>
        </Panel>

        {st ? (
          <>
            <Panel anchor="settle-split" title="这一单的钱去了哪里" desc={`订单 ${st.line.orderNo}：用户实付 ${rmb(st.line.payable)}，拆成四份，合计必须等于实付。`} actions={<FormatLink k="settlement" label="数据格式" />}>
              <Split line={st.line} />
            </Panel>
            <Panel
              anchor="settle-file"
              title="结算对账文件"
              desc="与下载文件同一份版式模型；黄色行为演示订单。"
              actions={
                <Button icon="download" onClick={() => (flowActive() ? toast('info', '演示中未实际下载', settleFileName()) : sheet && downloadBytes(buildXlsx([sheet]), settleFileName()))}>
                  下载对账文件
                </Button>
              }
            >
              {sheet ? <SheetPreview sample={{ kind: 'sheet', title: '', fileName: settleFileName(), sheet, note: '' }} maxRows={14} maxCols={14} /> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="pine" icon="checkCircle">
                  {st.batch.filter(balanced).length}/{st.batch.length} 笔勾稽平衡
                </Badge>
                <Badge tone="neutral">商家应得合计 {rmb(st.summary.merchantNet)}</Badge>
                <Badge tone="neutral">骑手收入合计 {rmb(st.summary.rider)}</Badge>
                <Badge tone={st.summary.platformNet >= 0 ? 'neutral' : 'amber'}>平台净收入 {rmb(st.summary.platformNet)}</Badge>
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="还没有结算结果">
            <p className="text-sm text-ink-500">点右上角“立即运行”：演示订单还没走完时，会先用演示数据把它推进到“已评价”，再执行对账与结算。</p>
          </Panel>
        )}

        <Panel
          anchor="settle-payout"
          title="打款到账"
          desc="定时调度 · 次日 08:00 · 商家应得打到对公账户，骑手收入打到骑手钱包；网关代付回执成功后通知到账。"
          actions={
            <>
              <FormatLink k="payout" label="数据格式" />
              {!w.payout ? (
                <Button icon="send" onClick={() => advance('paidOut')} disabled={!done || !!flow.id} title={done ? '' : '先运行结算'}>
                  模拟 08:00 打款
                </Button>
              ) : null}
            </>
          }
        >
          <PayoutView w={w} sub={cur.id === 'payout' ? cur.sub : -1} />
        </Panel>

        <Panel
          anchor="settle-offset"
          title={
            <span className="flex items-center gap-2">
              下期冲减 <NecessityTag n="optional" />
            </span>
          }
          desc="定时调度 · 后天 02:00 · 已结算订单的部分退款，不改上一期已打款的结算单，而是从商家本期结算款中扣减。"
          actions={
            <>
              <FormatLink k="offset" label="数据格式" />
              {!w.offset ? (
                <Button icon="merge" onClick={() => advance('offset')} disabled={!reached(w, 'refunded') || !!flow.id} title={reached(w, 'refunded') ? '' : '先在三端联动完成售后退款'}>
                  模拟下期冲减
                </Button>
              ) : null}
            </>
          }
        >
          <OffsetView w={w} sub={cur.id === 'offset' ? cur.sub : -1} />
        </Panel>
      </div>
    </>
  );
}

/* ---------------- 资金链路总览：与依赖图的“资金 · 结算”一行对应 ---------------- */

type NodeState = 'todo' | 'run' | 'done' | 'wait';

function MoneyChain({ w, cur }: { w: World; cur: MoneyStep | null }) {
  const st = (id: MoneyStep, stage: Parameters<typeof reached>[1]): NodeState => (cur === id ? 'run' : reached(w, stage) ? 'done' : 'todo');
  const nodes: { id: MoneyStep; icon: IconName; title: string; when: string; state: NodeState; figure: string; optional?: boolean }[] = [
    { id: 'reconcile', icon: 'scale', title: '渠道对账', when: '次日 01:00', state: st('reconcile', 'reconciled'), figure: w.recon ? `${w.recon.matched}/${w.recon.statement.length} 笔对平` : '网关对账单 vs 支付流水' },
    { id: 'settle', icon: 'receipt', title: 'T+1 结算', when: '次日 02:00', state: st('settle', 'settled'), figure: w.settle ? `商家应得 ${rmb(w.settle.summary.merchantNet)}` : '逐笔分账与勾稽' },
    { id: 'payout', icon: 'send', title: '打款到账', when: '次日 08:00', state: st('payout', 'paidOut'), figure: w.payout ? `到账 ${rmb(w.payout.total)}` : '商家对公户 + 骑手钱包' },
    { id: 'offset', icon: 'merge', title: '下期冲减', when: '后天 02:00', state: cur === 'offset' ? 'run' : reached(w, 'offset') ? 'done' : reached(w, 'refunded') ? 'todo' : 'wait', figure: w.offset ? `商家冲减 ${rmb(-w.offset.merchantAdj)}` : reached(w, 'refunded') ? '退款已完成，待冲减' : '等待售后退款', optional: true },
  ];
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch gap-2">
      {nodes.map((n, i) => (
        <Fragment key={n.id}>
          {i > 0 ? (
            <div className="flex items-center text-ink-300">
              <Icon name="arrowRight" size={16} />
            </div>
          ) : null}
          <div
            className={cx(
              'relative rounded-[16px] px-4 py-3 ring-1 transition-colors duration-300',
              n.state === 'run' ? 'bg-primary-50 ring-primary-300' : n.state === 'done' ? 'bg-pine-50 ring-pine-100' : 'bg-surface ring-ink-950/[0.06]',
              n.optional && 'border border-dashed border-ink-300',
            )}
          >
            <div className="flex items-center gap-2">
              <span className={cx('flex h-7 w-7 items-center justify-center rounded-full', n.state === 'done' ? 'bg-pine-500 text-white' : n.state === 'run' ? 'brand-grad text-white' : 'bg-ink-100 text-ink-500')}>
                <Icon name={n.state === 'done' ? 'check' : n.icon} size={14} strokeWidth={n.state === 'done' ? 3 : 2} />
              </span>
              <span className="text-sm font-semibold text-ink-900">{n.title}</span>
              {n.optional ? <NecessityTag n="optional" short /> : null}
              <span className="num ml-auto text-2xs text-ink-400">{n.when}</span>
            </div>
            <div className={cx('mt-1.5 truncate text-xs', n.state === 'done' ? 'font-medium text-pine-700' : 'text-ink-500')}>{n.figure}</div>
            {n.id === 'offset' ? <div className="mt-0.5 text-2xs text-ink-400">另一路上游：三端联动的售后退款</div> : n.id === 'reconcile' ? <div className="mt-0.5 text-2xs text-ink-400">上游：支付回调写入的支付流水</div> : null}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function Recon({ w, sub }: { w: World; sub: number }) {
  const rc = w.recon;
  const steps = ['下载网关对账单', '与平台支付流水逐笔核对', '对平 / 差异挂账'];
  const rows = rc ? rc.statement.slice(-6) : [];
  return (
    <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-6">
      <div>
        <ol className="space-y-2">
          {steps.map((t, i) => {
            const state = sub === i ? 'run' : (rc && sub < 0) || sub > i ? 'done' : 'todo';
            return (
              <li key={t} className={cx('flex items-center gap-2 rounded-[12px] px-3 py-2 text-sm', state === 'run' ? 'bg-primary-50 text-ink-900' : state === 'done' ? 'text-ink-800' : 'text-ink-400')}>
                <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-2xs', state === 'done' ? 'bg-pine-500 text-white' : state === 'run' ? 'brand-grad text-white' : 'bg-ink-100')}>{state === 'done' ? <Icon name="check" size={11} strokeWidth={3} /> : i + 1}</span>
                {t}
              </li>
            );
          })}
        </ol>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ['对账单', rc ? `${rc.statement.length} 笔` : '—'],
            ['对平', rc ? `${rc.matched} 笔` : '—'],
            ['差异', rc ? `${rc.diffs.length} 笔` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[12px] bg-ink-50 px-3 py-2">
              <div className="text-2xs text-ink-500">{k}</div>
              <div className={cx('num text-[17px] font-bold', k === '差异' && rc?.diffs.length ? 'text-seal-600' : 'text-ink-900')}>{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-500">
          {rc ? `交易金额 ${rmb(rc.amount)}，通道费 ${rmb(rc.fee)}。` : ''}
          {rc?.dupIgnored ? `重复回调 ${rc.dupIgnored} 次已在支付环节幂等忽略、没有进入流水，所以对账不会多出一笔。` : '网关重发的回调只要被幂等忽略、没有进入流水，就不会造成长款。'}
        </p>
      </div>
      <div className="overflow-hidden rounded-[14px] ring-1 ring-ink-950/[0.06]">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-ink-50 text-left text-2xs text-ink-500">
            <tr>
              <th className="w-[38%] px-3 py-2 font-medium">trade_no（网关）</th>
              <th className="px-3 py-2 font-medium">平台订单号</th>
              <th className="w-[72px] px-3 py-2 text-right font-medium">金额</th>
              <th className="w-[80px] px-3 py-2 text-right font-medium">核对</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-950/[0.04]">
            {rows.length ? (
              rows.map((l) => (
                <tr key={l.trade_no} className={l.out_trade_no === w.order?.no ? 'bg-amber-50/70' : undefined}>
                  <td className="code truncate px-3 py-1.5 text-ink-700">{l.trade_no}</td>
                  <td className="code truncate px-3 py-1.5 text-ink-600">{l.out_trade_no}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-900">{rmb(l.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-pine-600">
                    <Icon name="checkCircle" size={13} className="inline align-[-2px]" /> 对平
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-ink-400">
                  {sub >= 0 ? '正在下载网关对账单…' : '01:00 定时任务运行后，这里显示对账单与核对结果'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {rc ? <div className="border-t border-ink-950/[0.04] bg-ink-50/60 px-3 py-1.5 text-2xs text-ink-500">共 {rc.statement.length} 行，只展示最后 6 行；黄色行为演示订单</div> : null}
      </div>
    </div>
  );
}

function PayoutView({ w, sub }: { w: World; sub: number }) {
  const po = w.payout;
  if (!po)
    return (
      <p className="text-sm text-ink-500">
        {sub >= 0 ? '正在生成打款批次…' : reached(w, 'settled') ? '结算单已生成；08:00 定时任务发起打款（可点右上角模拟）。' : '结算完成后，这里显示打款批次与到账回执。'}
      </p>
    );
  return (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
      <div className="overflow-hidden rounded-[14px] ring-1 ring-ink-950/[0.06]">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-ink-50 text-left text-2xs text-ink-500">
            <tr>
              <th className="px-3 py-2 font-medium">收款方</th>
              <th className="w-[150px] px-3 py-2 font-medium">账户</th>
              <th className="w-[64px] px-3 py-2 text-right font-medium">单数</th>
              <th className="w-[96px] px-3 py-2 text-right font-medium">金额</th>
              <th className="w-[84px] px-3 py-2 text-right font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-950/[0.04]">
            {po.items.map((i) => (
              <tr key={i.payee}>
                <td className="truncate px-3 py-2 text-ink-900">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: i.kind === 'merchant' ? 'var(--color-act-merchant)' : 'var(--color-act-rider)' }} />
                  {i.payee}
                </td>
                <td className="truncate px-3 py-2 text-xs text-ink-500">{i.account}</td>
                <td className="num px-3 py-2 text-right text-ink-700">{i.orders}</td>
                <td className="num px-3 py-2 text-right font-semibold text-ink-900">{rmb(i.amount)}</td>
                <td className={cx('px-3 py-2 text-right text-xs', sub === 1 ? 'text-primary-600' : 'text-pine-600')}>{sub === 1 ? '代付中…' : '已到账'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between border-t border-ink-950/[0.04] bg-ink-50/60 px-3 py-1.5 text-2xs text-ink-500">
          <span className="code">{po.batchNo}</span>
          <span>
            合计 <b className="num text-ink-800">{rmb(po.total)}</b> · 回执 {clockLabel(po.at + 0.5)}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {[
          { who: '商家版 · 张老板', title: '结算款已到账', body: `${po.items[0].orders} 单，到账 ${rmb(po.items[0].amount)}`, color: 'var(--color-act-merchant)' },
          { who: `橙子骑手 · ${po.items[1].payee.replace('骑手 · ', '')}`, title: '配送收入已到账', body: `订单 #12 配送收入 ${rmb(po.items[1].amount)}`, color: 'var(--color-act-rider)' },
        ].map((n) => (
          <div key={n.who} className={cx('rounded-[14px] bg-surface px-3 py-2.5 shadow-raise ring-1 ring-ink-950/[0.05] transition-opacity duration-300', sub >= 0 && sub < 2 ? 'opacity-40' : 'opacity-100')}>
            <div className="flex items-center gap-1.5 text-2xs text-ink-500">
              <span className="h-2 w-2 rounded-full" style={{ background: n.color }} />
              {n.who} · 推送
            </div>
            <div className="mt-0.5 text-sm font-semibold text-ink-900">{n.title}</div>
            <div className="text-xs text-ink-600">{n.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OffsetView({ w, sub }: { w: World; sub: number }) {
  const of = w.offset;
  const r = w.refund;
  if (!of)
    return (
      <p className="text-sm text-ink-500">
        {sub >= 0 ? '正在汇总上一周期已结算订单的退款…' : r?.doneAt ? `退款 ${rmb(r.calc.refund)} 已原路退回；下一结算周期在这里冲减。` : '售后部分退款完成后（三端联动），下一结算周期在这里冲减；没有售后则没有这一步。'}
      </p>
    );
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { k: '原订单', v: of.orderNo, small: true },
        { k: '退给用户', v: rmb(of.refund) },
        { k: '商家冲减（从本期结算款扣）', v: rmb(-of.merchantAdj) },
        { k: '平台承担', v: rmb(-of.platformAdj) },
      ].map((x) => (
        <div key={x.k} className="rounded-[14px] bg-ink-50 px-4 py-3">
          <div className="text-xs text-ink-500">{x.k}</div>
          <div className={cx('mt-1 font-bold text-ink-900', x.small ? 'code text-[13px]' : 'num text-[20px]')}>{x.v}</div>
        </div>
      ))}
      <p className="col-span-4 text-xs text-ink-500">
        计入 {of.cycle} 结算周期（{clockLabel(of.at)} 生成）；网关退款流水号 <span className="code">{of.refundNo}</span>。商家冲减 = 退款商品净额 − 退回佣金，其余由平台承担。
      </p>
    </div>
  );
}

function Split({ line }: { line: NonNullable<ReturnType<typeof useWorld>['settle']>['line'] }) {
  const parts = [
    { k: '商家应得', v: line.merchantNet, color: 'var(--color-act-merchant)', note: `商品 + 包装 − 商家满减 − 佣金 ${rmb(line.commission)}` },
    { k: '骑手收入', v: line.rider.total, color: 'var(--color-act-rider)', note: `基础 ${rmb(line.rider.base)}${line.rider.distance ? ` + 超距 ${rmb(line.rider.distance)}` : ''}${line.rider.rain ? ` + 天气 ${rmb(line.rider.rain)}` : ''}${line.rider.wait ? ` + 等餐 ${rmb(line.rider.wait)}` : ''}` },
    { k: '支付通道费', v: line.channelFee, color: 'var(--color-act-gateway)', note: '实付 × 0.6%' },
    { k: '平台净收入', v: line.platformNet, color: 'var(--color-act-platform)', note: line.platformNet < 0 ? '为负：这一单平台在补贴' : '佣金 + 配送费 − 平台券 − 骑手 − 通道费' },
  ];
  const pos = parts.filter((p) => p.v > 0);
  const total = pos.reduce((a, p) => a + p.v, 0);
  return (
    <div>
      <div className="flex h-10 overflow-hidden rounded-[12px]">
        {pos.map((p) => (
          <div key={p.k} className="flex items-center justify-center text-xs font-semibold text-white transition-[width] duration-700" style={{ width: `${(p.v / total) * 100}%`, background: p.color }} title={`${p.k} ${rmb(p.v)}`}>
            {p.v / total > 0.08 ? rmb(p.v) : ''}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-4">
        {parts.map((p) => (
          <div key={p.k} className="rounded-[14px] bg-ink-50 px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-500">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.k}
            </div>
            <div className={cx('num mt-1 text-[20px] font-bold', p.v < 0 ? 'text-amber-700' : 'text-ink-900')}>{rmb(p.v)}</div>
            <div className="mt-0.5 text-2xs leading-relaxed text-ink-500">{p.note}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-600">
        勾稽：{rmb(line.merchantNet)} + {rmb(line.rider.total)} + {rmb(line.channelFee)} + {rmb(line.platformNet)} = <b>{rmb(line.payable)}</b>（用户实付）
        {balanced(line) ? <Icon name="checkCircle" size={13} className="ml-1 inline align-[-2px] text-pine-500" /> : null}
      </p>
    </div>
  );
}
