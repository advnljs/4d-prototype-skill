import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Callout, Field, Modal, Panel, Segmented, Tabs, cx } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { toast } from '@/components/ui/Toast';
import { AgentConsole, PipelineView, PlayerControls, useRunPlayer } from '@/components/check/RunViews';
import { CostCompare, MajorDistribution, ResultSummary, ResultTable } from '@/components/check/ResultViews';
import { RecordDrawer } from '@/components/check/RecordDrawer';
import { SecrecyModal } from '@/components/check/SecrecyModal';
import { BIZ_SHEET, BIZ_TITLE, HEADERS, type BizType, type DocRecord } from '@/domain/docs';
import { orgByCode } from '@/domain/orgs';
import { mockLedger, SCENARIOS, WRONG_FORMAT } from '@/mock/ledger';
import { SOURCE_LABEL, type UploadSource } from '@/mock/batches';
import { checkStages, parseStage, tickerItems, type RunMode, type Stage } from '@/agent/pipeline';
import { runChecks, traceRule, type CheckRun } from '@/rules/engine';
import type { RecordResult } from '@/rules/types';
import { batchResultSheets, batchResultXlsx, downloadBytes } from '@/lib/exporters';
import { MAX_FILE_BYTES, parseWorkbook, type SheetCheck } from '@/lib/docFile';
import { buildXlsx } from '@/lib/xlsx/writer';
import { readXlsx, type SheetData } from '@/lib/xlsx/reader';
import { dateTime, fmtInt, hash, ymd } from '@/lib/format';
import { href, setQuery, useRoute } from '@/lib/router';
import { TODAY } from '@/state/context';
import { nextBatchId, nextFileName, saveBatch, summarize, useAllBatches, visibleBatches } from '@/state/results';
import { portalCookie } from '@/state/session';
import { useCheckSetup } from '@/state/useCheckSetup';
import { FormatLink } from '@/components/flow/DataObject';
import { flowActive, useFlowStep, type FlowCtl } from '@/flow/director';
import { vClearTimeout, vSetTimeout } from '@/flow/clock';
import { WRITEBACK_LABEL, writebackOf } from '@/state/closure';

interface Loaded {
  source: 'mock' | 'upload';
  fileName: string;
  sheets: SheetCheck[];
  records: DocRecord[];
}

interface RunState {
  id: number;
  batchId: string;
  channel: UploadSource;
  mode: RunMode;
  run: CheckRun;
  loaded: Loaded;
  reportName: string;
  time: string;
}

type Channel = 'ui' | 'api';

/* ---------------- 演示文件 ---------------- */

const DEMO_FILE = 'ERP收付款单据导出_20261008-20261013.xlsx';
const API_FILE = '供应商协同平台待付款申请_20261014.xlsx';

function sheetOf(b: BizType, recs: DocRecord[]): SheetData {
  return { name: BIZ_SHEET[b], rows: [[BIZ_TITLE[b]], HEADERS[b], ...recs.map((r) => HEADERS[b].map((h) => r.raw[h] ?? ''))] };
}

/** 演示文件：一个文件三个工作表（收款 / 付款 / 进口结算） */
function demoSheets(kind: 'all' | 'receipt'): SheetData[] {
  const bizs: BizType[] = kind === 'all' ? ['receipt', 'payment', 'settlement'] : ['receipt'];
  return bizs.map((b) => sheetOf(b, mockLedger(b)));
}

function demoLoaded(): Loaded {
  const r = parseWorkbook(demoSheets('all'));
  return { source: 'mock', fileName: DEMO_FILE, sheets: r.sheets, records: r.records };
}

/** RPA 从供应商协同平台读取的待付款申请：整理成付款工作表（演示：抽取部分付款单记录） */
function apiLoaded(): Loaded {
  const recs = mockLedger('payment').filter((r) => (SCENARIOS[r.key] ? hash(r.key) % 2 === 0 : hash(r.key) % 3 === 0));
  const r = parseWorkbook([sheetOf('payment', recs)]);
  return { source: 'mock', fileName: API_FILE, sheets: r.sheets, records: r.records };
}

const rpaStage = (n: number): Stage => ({
  key: 'rpa',
  title: 'RPA 读取供应商协同平台的待付款申请并调用接口',
  engine: 'rpa',
  actor: 'rpa',
  summary: `${n} 笔待付款申请`,
  lines: ['登录供应商协同平台，进入“待付款申请”列表，读取待付款申请（凭据随任务清除）', `按付款单表头整理成 Excel：${n} 笔`, 'POST /doc-audit/api/v1/batches（operator = 触发人工号，source = rpa-supplier-portal）'],
  ms: 900,
  real: `约 ${n * 4 + 25} 秒`,
});

/* ---------------- 页面 ---------------- */

export function CheckPage() {
  const { user, libOrg, rules, ctx, version, libLabel } = useCheckSetup();
  const { query } = useRoute();
  const channel: Channel = query.get('tab') === 'api' ? 'api' : 'ui';
  const [mode, setMode] = useState<RunMode>('batch');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [state, setState] = useState<RunState | null>(null);
  const [drawer, setDrawer] = useState<RecordResult | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [autoExported, setAutoExported] = useState(-1);
  const [showProcess, setShowProcess] = useState(true);
  const [autoUpload, setAutoUpload] = useState<FlowCtl | null>(null);
  const setChannel = (c: Channel) => setQuery({ tab: c === 'api' ? 'api' : null });

  const stages = useMemo(() => {
    if (!state) return [];
    const s = state.loaded.sheets.filter((x) => x.ok);
    return [
      ...(state.channel === 'api' ? [rpaStage(state.run.stats.total)] : []),
      parseStage({
        fileName: state.loaded.fileName,
        source: state.channel,
        sheets: s.map((x) => ({ name: x.name, biz: x.biz!, matched: x.matched!, totalCols: x.total!, rows: x.rows! })),
        skipped: state.loaded.sheets.filter((x) => !x.ok).map((x) => `工作表“${x.name}”：${x.reason}`),
      }),
      ...checkStages(state.run, { empNo: user.empNo, userOrg: orgByCode(user.orgCode)?.name ?? user.orgCode, libLabel, mode: state.mode, reportName: state.reportName, batchId: state.batchId }),
    ];
  }, [state, user.empNo, user.orgCode, libLabel]);
  const player = useRunPlayer(stages, state?.id ?? 0);
  const playerRef = useRef(player);
  playerRef.current = player;
  // 演示直接切到“自动导出”：核查过程不再逐段回放，直接显示结果（须在播放器按新任务重置之后执行）
  const skipRun = useRef(0);
  useEffect(() => {
    if (state && skipRun.current === state.id) {
      skipRun.current = 0;
      player.skip();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = useMemo(() => {
    if (!state) return undefined;
    const run = state.run;
    const pick =
      run.results.find((r) => r.findings.some((f) => f.ruleId === 'R406')) ??
      run.results.find((r) => r.findings.some((f) => f.ruleId === 'R101' && f.level === 'error')) ??
      run.results.find((r) => r.findings.some((f) => f.engine !== 'code'));
    if (!pick) return undefined;
    const f = pick.findings.find((x) => x.ruleId === 'R406') ?? pick.findings.find((x) => x.ruleId === 'R101') ?? pick.findings.find((x) => x.engine !== 'code')!;
    const rule = run.rules.find((r) => r.id === f.ruleId)!;
    return { docNo: pick.rec.f.docNo, rule: rule.name, steps: traceRule(pick.rec, rule, run.ctx).steps ?? [] };
  }, [state]);
  const ticker = useMemo(() => (state ? tickerItems(state.run.results) : []), [state]);

  // 每次核查自动导出结果文件（需求：自动导出 Excel，导出时弹窗保密提示）；接口上传由调用方取回结果
  useEffect(() => {
    if (state && player.done && autoExported !== state.id) {
      setAutoExported(state.id);
      if (state.channel === 'api') toast('info', `接口返回：批次 ${state.batchId} 已完成`, '结果文件与疑点明细已保存，可在“核查结果”中查看');
      else if (flowActive()) toast('info', '核查完成，结果文件已自动生成', '正式使用时会自动下载；演示中可点“下载结果文件”查看保密提示');
      else setExportOpen(true);
    }
  }, [state, player.done, autoExported]);

  /** 发起一次核查：按当前用户的规则库核查，保存批次（不含业务原始数据） */
  function start(input: Loaded, ch: UploadSource): RunState {
    const date = ymd(TODAY);
    const time = dateTime(new Date(TODAY.getTime() + (Date.now() % 3600000)));
    const batchId = nextBatchId(date);
    const reportName = nextFileName(['核查结果'], date, user.empNo);
    const run = runChecks(input.records, rules, ctx);
    saveBatch(
      summarize(
        { id: batchId, time, empNo: user.empNo, userName: ch === 'api' ? `RPA（代 ${user.name}）` : user.name, orgCode: user.orgCode, source: ch, fileName: input.fileName, libOrg, libVersion: version, reportName },
        run,
      ),
      run,
    );
    setShowProcess(true);
    const next: RunState = { id: Date.now(), batchId, channel: ch, mode, run, loaded: input, reportName, time };
    setState(next);
    window.setTimeout(() => document.getElementById('run-process')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    return next;
  }

  function doExport() {
    if (!state) return;
    downloadBytes(batchResultXlsx(state.run.results, state.run.ctx.batch, exportMeta(state)), state.reportName);
    setExportOpen(false);
    toast('download', '核查结果文件已下载', state.reportName);
  }

  const exportMeta = (s: RunState) => ({ batchId: s.batchId, time: s.time, lib: libLabel, empNo: user.empNo, source: SOURCE_LABEL[s.channel] });
  const sheetsInfo = useMemo(() => (state ? batchResultSheets(state.run.results, state.run.ctx.batch, exportMeta(state)).map((sh) => ({ name: sh.name, rows: Math.max(0, sh.rows.length - 2) })) : []), [state]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- 全流程演示 ---------- */
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const stateRef = useRef(state);
  stateRef.current = state;
  const startRef = useRef(start);
  startRef.current = start;

  useFlowStep('upload-ui', (c) => {
    setChannel('ui');
    setLoaded(null);
    setState(null);
    c.sub(0);
    c.hover('[data-demo="doc-format"]');
    c.later(2000, () => {
      c.sub(1);
      c.click('[data-demo="check-upload"]', () => {
        setAutoUpload(c);
        setUploadOpen(true);
      });
    });
    return () => setAutoUpload(null);
  });

  /** 本环节（按 nonce 区分）发起的核查：只跟踪它的进度，重新进入时不会被上一次的结果误判为完成 */
  const flowRun = useRef({ nonce: 0, id: 0 });
  const checkCtl = useFlowStep('check-run', (c) => {
    setChannel('ui');
    let input = loadedRef.current;
    if (!input) {
      input = demoLoaded();
      setLoaded(input);
    }
    const file = input;
    c.click('[data-demo="check-run"]', () => {
      flowRun.current = { nonce: c.nonce, id: startRef.current(file, 'ui').id };
    });
  });
  useEffect(() => {
    if (!checkCtl || !state || flowRun.current.nonce !== checkCtl.nonce || state.id !== flowRun.current.id) return;
    checkCtl.sub(Math.max(0, Math.min(player.active - 1, 6)));
    if (player.done) checkCtl.done();
  }, [checkCtl, state, player.active, player.done]);

  useFlowStep('auto-export', (c) => {
    setChannel('ui');
    let wait = 300;
    if (!stateRef.current || stateRef.current.channel !== 'ui') {
      const input = loadedRef.current ?? demoLoaded();
      setLoaded(input);
      const s = startRef.current(input, 'ui');
      skipRun.current = s.id;
      wait = 900;
    } else if (!playerRef.current.done) playerRef.current.skip();
    c.sub(0);
    c.later(wait, () => c.hover('[data-flow-anchor="export-sheets"]'));
    c.later(wait + 2600, () => {
      c.sub(1);
      c.hover('[data-demo="saved-batch"]');
    });
    c.later(wait + 5000, () => {
      c.sub(2);
      c.click('[data-demo="check-export"]', () => setExportOpen(true));
    });
    c.later(wait + 7200, () => c.hover('[data-demo="secrecy-agree"]'));
    c.later(wait + 8800, () =>
      c.click('[data-demo="secrecy-cancel"]', () => {
        setExportOpen(false);
        toast('info', '演示中未实际下载', `正式使用时下载 ${stateRef.current?.reportName ?? ''}`);
        c.done();
      }),
    );
    return () => setExportOpen(false);
  });

  const apiRun = useRef({ nonce: 0, id: 0 });
  const apiCtl = useFlowStep('upload-api', (c) => {
    setChannel('api');
    setState(null);
    c.sub(0);
    c.hover('[data-flow-anchor="api-panel"]');
    c.later(2400, () => {
      c.sub(1);
      c.click('[data-demo="api-run"]', () => {
        apiRun.current = { nonce: c.nonce, id: startRef.current(apiLoaded(), 'api').id };
      });
    });
  });
  useEffect(() => {
    if (!apiCtl || !state || apiRun.current.nonce !== apiCtl.nonce || state.id !== apiRun.current.id) return;
    if (!player.done) {
      if (player.active >= 1) apiCtl.sub(2);
      return;
    }
    apiCtl.sub(3);
    apiCtl.hover('[data-flow-anchor="api-batches"]');
    apiCtl.later(2600, () => apiCtl.done());
  }, [apiCtl, state, player.active, player.done]);

  // RPA 回写协同平台（自动衔接接口上传）：接口批次不在页面上时，先用演示数据自备一批（跳过动画）
  useFlowStep('writeback', (c) => {
    setChannel('api');
    let wait = 400;
    if (!stateRef.current || stateRef.current.channel !== 'api') {
      const s = startRef.current(apiLoaded(), 'api');
      skipRun.current = s.id;
      wait = 1000;
    } else if (!playerRef.current.done) playerRef.current.skip();
    c.sub(0);
    c.later(wait, () => c.hover('[data-flow-anchor="api-batches"]'));
    c.later(wait + 2200, () => {
      c.sub(1);
      c.hover('[data-demo="writeback-hold"]');
    });
    c.later(wait + 4600, () => {
      c.sub(2);
      c.hover('[data-demo="writeback-release"]');
    });
    c.later(wait + 6800, () => c.done());
  });

  const libText = `${libLabel}（工号 ${user.empNo} → ${orgByCode(user.orgCode)?.name}）`;

  return (
    <>
      <PageHeader
        title="一键核查"
        crumbs={['单据智能核查', '一键核查']}
        desc="核查数据全部来自上传：核查岗在界面上传 ERP 导出的三类单据，RPA 通过接口上传供应商协同平台的待付款申请——两条数据线合一，用同一流程、同一规则库处理。规则库按当前用户工号匹配所属区域。"
        actions={
          <Badge tone="rule" icon="book">
            {libLabel}
          </Badge>
        }
      />
      <div className="space-y-6 px-10 py-7">
        <Panel
          title="上传方式"
          actions={
            <Tabs<Channel>
              value={channel}
              onChange={setChannel}
              items={[
                { value: 'ui', label: '界面上传' },
                { value: 'api', label: '接口上传（RPA）' },
              ]}
            />
          }
        >
          {channel === 'ui' ? (
            <div data-flow-anchor="check-upload" className="grid grid-cols-[minmax(0,1fr)_300px_auto] items-end gap-6">
              <Field label="1. 上传三类单据 Excel（收款 / 付款 / 进口结算，一个文件多个工作表或分开上传均可）">
                <div className="flex min-h-9 flex-wrap items-center gap-2">
                  <Button icon="upload" onClick={() => setUploadOpen(true)} data-demo="check-upload">
                    上传文件
                  </Button>
                  {loaded ? (
                    <span className="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-pine-50 px-2.5 py-1.5 text-sm text-pine-700">
                      <Icon name="sheet" size={15} className="shrink-0" />
                      <span className="truncate">{loaded.fileName}</span>
                      {loaded.sheets
                        .filter((x) => x.ok)
                        .map((x) => (
                          <span key={x.name} className="num rounded bg-surface/70 px-1.5 text-xs text-pine-700">
                            {BIZ_SHEET[x.biz!]} {fmtInt(x.rows!)}
                          </span>
                        ))}
                    </span>
                  ) : (
                    <span className="text-sm text-ink-400">尚未上传</span>
                  )}
                  <span data-demo="doc-format">
                    <FormatLink k="docFile" label="三类明细格式" />
                  </span>
                </div>
              </Field>
              <Field label="智能体运行方式（原型讨论）" hint={mode === 'batch' ? '语义归并 + 判定缓存 + 并发批量调用' : '每笔每条语义规则单独调用大模型'}>
                <Segmented<RunMode>
                  value={mode}
                  onChange={setMode}
                  items={[
                    { value: 'batch', label: '批量（推荐）' },
                    { value: 'online', label: '逐笔在线' },
                  ]}
                />
              </Field>
              <div className="pb-[22px]">
                <Button variant="primary" size="lg" icon="zap" disabled={!loaded} onClick={() => loaded && start(loaded, 'ui')} data-demo="check-run">
                  一键核查
                </Button>
              </div>
            </div>
          ) : (
            <ApiPanel onRun={() => start(apiLoaded(), 'api')} empNo={user.empNo} lastBatch={state?.channel === 'api' && player.done ? state : null} />
          )}
          <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
            <Icon name="shield" size={13} />
            当前用户 {user.name}（{user.roleName}）· 统一认证 <span className="code">{portalCookie(user.empNo)}</span> → doc_user_org → 规则库 {libText}：启用 {rules.length} 条，三类单据共用。
          </p>
        </Panel>

        {state ? (
          <Panel
            id="run-process"
            anchor="run-process"
            title={state.channel === 'api' ? `核查过程（接口上传，批次 ${state.batchId}）` : `核查过程（批次 ${state.batchId}）`}
            desc={state.mode === 'batch' ? '三类单据合并为一个批次：先跑确定性规则，再做批次级国别一致性，需要语义判断的用途说明归并去重、复用历史判定后并发调用智能体' : '逐笔在线模式：每笔记录、每条语义规则单独调用大模型（用于对比）'}
            actions={
              <>
                <PlayerControls player={player} />
                <Button size="sm" variant="ghost" icon={showProcess ? 'chevronDown' : 'chevronRight'} onClick={() => setShowProcess((v) => !v)}>
                  {showProcess ? '收起' : '展开'}
                </Button>
              </>
            }
          >
            {showProcess ? (
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-5">
                  <PipelineView stages={stages} player={player} />
                </div>
                <div className="col-span-7">
                  <AgentConsole stages={stages} player={player} focus={focus} ticker={ticker} mode={state.mode} total={state.run.stats.total} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">共 {stages.length} 个阶段，{player.done ? '已完成' : '运行中'}。</p>
            )}
          </Panel>
        ) : (
          <Callout tone="primary" icon="compass" title="演示路径">
            {channel === 'ui'
              ? '上传文件（弹窗内可直接选用演示文件：一个文件含收款、付款、进口结算三个工作表；也可上传格式一致的导出文件，仅在本机浏览器解析）→ 一键核查。结束后自动生成结果文件（国别疑点单独一张工作表）并保存批次。'
              : '点“模拟 RPA 调用上传接口”：RPA 读取供应商协同平台的待付款申请，整理为付款单 Excel 后调用接口，后台用同一流程、同一规则库核查，接口返回批次号与结果。'}
          </Callout>
        )}

        {state && player.done ? (
          <Panel
            id="run-result"
            anchor="run-result"
            title={`核查结果：批次 ${state.batchId}`}
            desc={`${state.loaded.fileName} · ${SOURCE_LABEL[state.channel]} · 核查时间 ${state.time} · ${libLabel}`}
            actions={
              <>
                <FormatLink k="resultXlsx" label="结果文件格式" />
                <Button variant="primary" icon="download" onClick={() => setExportOpen(true)} data-demo="check-export">
                  下载结果文件
                </Button>
              </>
            }
          >
            <ResultSummary run={state.run} />
            <div data-flow-anchor="export-sheets" className="mt-4 flex flex-wrap items-center gap-2 rounded-[12px] bg-ink-50/80 px-4 py-2.5 text-sm">
              <Icon name="sheet" size={15} className="text-pine-600" />
              <span className="font-medium text-ink-900">已自动生成 {state.reportName}</span>
              {sheetsInfo.map((sh) => (
                <span key={sh.name} className={cx('rounded-full px-2 py-0.5 text-xs', sh.name === '国别疑点' ? 'bg-seal-50 text-seal-700 ring-1 ring-seal-100' : 'bg-surface text-ink-700 ring-1 ring-ink-950/[0.06]')}>
                  {sh.name} <span className="num">{sh.rows}</span> 行
                </span>
              ))}
              <a href={href('/results')} data-demo="saved-batch" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
                <Icon name="database" size={12} />
                批次已保存，可在“核查结果”中查看
              </a>
            </div>
            <div className="mt-6 grid grid-cols-12 gap-8 border-t border-ink-950/[0.05] pt-5">
              <div className="col-span-7">
                <h3 className="mb-3 text-sm font-semibold text-ink-900">疑点大类分布（笔，国别为一个大类）</h3>
                <MajorDistribution run={state.run} />
              </div>
              <div className="col-span-5">
                <h3 className="mb-3 text-sm font-semibold text-ink-900">运行方式成本对比（同一批数据）</h3>
                <CostCompare run={state.run} />
                <p className="mt-2 text-2xs leading-relaxed text-ink-400">按单次调用约 820 tokens、1.6 秒、并发 8 估算；缓存命中率为原型假设值 72%。</p>
              </div>
            </div>
            <div className="mt-6 border-t border-ink-950/[0.05] pt-4">
              <ResultTable run={state.run} onOpen={setDrawer} />
            </div>
          </Panel>
        ) : null}
      </div>

      <UploadModal
        open={uploadOpen}
        auto={autoUpload}
        onClose={() => setUploadOpen(false)}
        onLoaded={(l) => {
          setLoaded(l);
          setUploadOpen(false);
        }}
      />
      {state ? <SecrecyModal open={exportOpen} fileName={state.reportName} rows={state.run.stats.suspicious} onCancel={() => setExportOpen(false)} onConfirm={doExport} /> : null}
      <RecordDrawer res={drawer} rules={state?.run.rules ?? rules} ctx={state?.run.ctx ?? ctx} onClose={() => setDrawer(null)} />
    </>
  );
}

/* ---------------- 接口上传（RPA） ---------------- */

function ApiPanel({ onRun, empNo, lastBatch }: { onRun: () => void; empNo: string; lastBatch: RunState | null }) {
  const { user } = useCheckSetup();
  const all = useAllBatches();
  const api = visibleBatches(all, user)
    .filter((b) => b.source === 'api')
    .slice(0, 6);
  const resp = lastBatch
    ? `{ "batchId": "${lastBatch.batchId}", "status": "done", "total": ${lastBatch.run.stats.total}, "suspicious": ${lastBatch.run.stats.suspicious}, "countryRecs": ${lastBatch.run.results.filter((r) => r.findings.some((f) => f.major === 'country')).length}, "resultUrl": "/doc-audit/api/v1/batches/${lastBatch.batchId}/result.xlsx" }`
    : '{ "batchId": "B20261014-0xxx", "status": "queued" }';
  return (
    <div className="grid grid-cols-12 gap-6">
      <div data-flow-anchor="api-panel" className="col-span-7">
        <div className="rounded-[14px] bg-ink-900 px-4 py-3.5 text-[12.5px] leading-relaxed text-surface/90">
          <div className="code">
            <span className="text-emerald-300">POST</span> /doc-audit/api/v1/batches
          </div>
          <div className="code text-white/60">Content-Type: multipart/form-data · Authorization: Bearer …（RPA 服务账号）</div>
          <div className="code mt-1">
            operator=<span className="text-amber-200">{empNo}</span>　source=<span className="text-amber-200">rpa-supplier-portal</span>　file=@<span className="text-amber-200">{API_FILE}</span>（付款工作表）
          </div>
          <div className="code mt-2 text-white/60">→ 202 Accepted；完成后：</div>
          <div className="code break-all text-sky-200">GET /doc-audit/api/v1/batches/{'{batchId}'} → {resp}</div>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-700">
          <li className="flex gap-2">
            <Icon name="robot" size={15} className="mt-0.5 shrink-0 text-[var(--color-act-rpa)]" />
            RPA 只负责“把数据搬上来”：登录供应商协同平台读取待付款申请，按付款单表头整理成 Excel，带触发人工号调用接口。
          </li>
          <li className="flex gap-2">
            <Icon name="merge" size={15} className="mt-0.5 shrink-0 text-primary-500" />
            后台与界面上传同一流程：按 operator 工号匹配规则库、批次级国别一致性、自动生成结果文件、保存批次。
          </li>
          <li className="flex gap-2">
            <Icon name="link" size={15} className="mt-0.5 shrink-0 text-ink-500" />
            核查与抓取彻底解耦：其他系统也可以按同一接口上传三类 Excel。
          </li>
        </ul>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="primary" icon="robot" onClick={onRun} data-demo="api-run">
            模拟 RPA 调用上传接口
          </Button>
          <FormatLink k="apiUpload" label="接口说明" />
        </div>
      </div>
      <div data-flow-anchor="api-batches" className="col-span-5">
        <h3 className="mb-2 text-sm font-semibold text-ink-900">最近的接口上传批次（本人可见范围）</h3>
        <ul className="divide-y divide-ink-950/[0.05] rounded-[14px] border border-ink-950/[0.07]">
          {api.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="code text-xs text-ink-700">{b.id}</span>
              <span className="num text-xs text-ink-500">{b.time.slice(5, 16)}</span>
              <span className="truncate text-xs text-ink-600">{orgByCode(b.orgCode)?.short}</span>
              <span className="num ml-auto text-xs text-ink-700">
                {b.total} 笔 · 疑点 <span className="text-seal-600">{b.suspicious}</span>
              </span>
              <Badge tone="pine">已完成</Badge>
            </li>
          ))}
          {!api.length ? <li className="px-3 py-3 text-sm text-ink-400">暂无</li> : null}
        </ul>
        <a href={href('/results')} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          在“核查结果”中查看全部批次 <Icon name="arrowRight" size={12} />
        </a>
        <Writeback lastBatch={lastBatch} />
      </div>
    </div>
  );
}

/** RPA 取回结果后回写供应商协同平台：有疑点的付款申请挂起，其余放行 */
function Writeback({ lastBatch }: { lastBatch: RunState | null }) {
  const items = useMemo(() => (lastBatch ? writebackOf(lastBatch.run.results) : []), [lastBatch]);
  const sorted = [...items.filter((i) => i.action === 'HOLD'), ...items.filter((i) => i.action === 'RELEASE')];
  const shown = [...sorted.filter((i) => i.action === 'HOLD').slice(0, 4), ...sorted.filter((i) => i.action === 'RELEASE').slice(0, 2)];
  const hold = items.filter((i) => i.action === 'HOLD').length;
  return (
    <div data-flow-anchor="api-writeback" className="mt-5">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-900">
        回写供应商协同平台
        <FormatLink k="writeback" label="回写报文" />
      </h3>
      {lastBatch ? (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="seal">挂起 {hold}</Badge>
            <Badge tone="pine">放行 {items.length - hold}</Badge>
            <span className="code text-ink-500">{lastBatch.batchId}</span>
          </div>
          <ul className="divide-y divide-ink-950/[0.05] rounded-[14px] border border-ink-950/[0.07]">
            {shown.map((i, k) => (
              <li key={i.applyNo} data-demo={k === 0 ? 'writeback-hold' : i.action === 'RELEASE' && shown[k - 1]?.action === 'HOLD' ? 'writeback-release' : undefined} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                <span className={cx('shrink-0 rounded-full px-1.5 py-px text-2xs font-medium', i.action === 'HOLD' ? 'bg-seal-100/70 text-seal-600' : 'bg-pine-50 text-pine-700')}>{WRITEBACK_LABEL[i.action]}</span>
                <span className="code shrink-0 text-ink-700">{i.applyNo}</span>
                <span className="min-w-0 flex-1 truncate text-ink-500" title={i.reason || i.payee}>
                  {i.reason || i.payee}
                </span>
                <span className="num shrink-0 text-ink-700">
                  {i.currency} {i.amount}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-2xs text-ink-400">挂起的申请附疑点说明，待子公司复核后放行或退回；共 {items.length} 笔，只展示部分。</p>
        </>
      ) : (
        <p className="rounded-[14px] border border-dashed border-ink-200 px-3 py-3 text-sm text-ink-400">接口批次核查完成后，RPA 把结果逐笔回写协同平台：有疑点的付款申请挂起，其余放行。</p>
      )}
    </div>
  );
}

/* ---------------- 上传弹窗 ---------------- */

function UploadModal({ open, auto, onClose, onLoaded }: { open: boolean; auto?: FlowCtl | null; onClose: () => void; onLoaded: (l: Loaded) => void }) {
  const [result, setResult] = useState<(Loaded & { ok: boolean; reason?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 全流程演示：光标点“选用”三类演示文件 → 显示识别结果 → 点“完成”
  useEffect(() => {
    if (!open || !auto) return;
    auto.click('[data-demo="demo-file-ok"]', () => {
      pick('all');
      auto.sub(2);
    });
    const t = vSetTimeout(
      () =>
        auto.click('[data-demo="upload-done"]', () => {
          setResult(null);
          onLoaded(demoLoaded());
          auto.done();
        }),
      3000,
    );
    return () => vClearTimeout(t);
  }, [open, auto]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setResult(null);
    onClose();
  }

  function check(sheets: SheetData[], fileName: string, source: Loaded['source']) {
    const r = parseWorkbook(sheets);
    setResult({ ok: r.ok, reason: r.reason, sheets: r.sheets, records: r.records, fileName, source });
  }

  function pick(kind: 'all' | 'receipt' | 'wrong') {
    if (kind === 'wrong') check([{ name: 'Sheet1', rows: [WRONG_FORMAT.header, ...WRONG_FORMAT.rows] }], WRONG_FORMAT.fileName, 'mock');
    else check(demoSheets(kind), kind === 'all' ? DEMO_FILE : 'ERP收付款单据导出_收款_20261013.xlsx', 'mock');
  }

  async function onFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      setResult({ ok: false, reason: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}M，超过 20M 上限。`, sheets: [], records: [], fileName: file.name, source: 'upload' });
      return;
    }
    if (!/\.xlsx$/i.test(file.name)) {
      setResult({ ok: false, reason: '只能上传 Excel（.xlsx）文件；老式 .xls 请在 Excel 中另存为 .xlsx（原型限制）。', sheets: [], records: [], fileName: file.name, source: 'upload' });
      return;
    }
    setBusy(true);
    try {
      check(await readXlsx(await file.arrayBuffer()), file.name, 'upload');
    } catch (e) {
      setResult({ ok: false, reason: `文件无法解析：${e instanceof Error ? e.message : String(e)}`, sheets: [], records: [], fileName: file.name, source: 'upload' });
    } finally {
      setBusy(false);
    }
  }

  function downloadDemo() {
    downloadBytes(buildXlsx(demoSheets('all').map((sh) => ({ name: sh.name, rows: sh.rows.map((cells, i) => ({ cells, style: i === 0 ? ('title' as const) : i === 1 ? ('header' as const) : undefined })) }))), DEMO_FILE);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width={760}
      title="上传三类明细 Excel"
      footer={
        result ? (
          result.ok ? (
            <Button
              variant="primary"
              data-demo="upload-done"
              onClick={() => {
                onLoaded(result);
                setResult(null);
              }}
            >
              完成
            </Button>
          ) : (
            <Button onClick={() => setResult(null)}>重新选择</Button>
          )
        ) : (
          <Button onClick={close}>取消</Button>
        )
      }
    >
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium text-primary-600">
          <Icon name="shield" size={16} />
          严禁在非涉密平台处理、传输国家秘密，请确认所涉密文件资料不涉及国家秘密
        </p>
        {result ? (
          <div className={cx('anim-rise rounded-lg border px-5 py-4', result.ok ? 'border-pine-100 bg-pine-50' : 'border-seal-200 bg-seal-50')}>
            <div className="flex items-center gap-2">
              <Icon name={result.ok ? 'checkCircle' : 'alertCircle'} size={22} className={result.ok ? 'text-pine-500' : 'text-seal-500'} />
              <span className={cx('text-md font-semibold', result.ok ? 'text-pine-700' : 'text-seal-700')}>{result.ok ? '上传成功' : '上传失败'}</span>
              <span className="truncate text-sm text-ink-600">{result.fileName}</span>
            </div>
            {result.reason ? <p className="mt-2 text-sm text-seal-700">{result.reason}</p> : null}
            {result.sheets.length ? (
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-ink-500">
                  <tr>
                    <th className="pb-1 font-normal">工作表</th>
                    <th className="pb-1 font-normal">识别为</th>
                    <th className="pb-1 font-normal">表头</th>
                    <th className="pb-1 text-right font-normal">数据行</th>
                    <th className="pb-1 font-normal">　</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-950/[0.05]">
                  {result.sheets.map((x) => (
                    <tr key={x.name}>
                      <td className="py-1.5 text-ink-800">{x.name}</td>
                      <td className="py-1.5">{x.biz ? BIZ_SHEET[x.biz] : '—'}</td>
                      <td className="num py-1.5 text-ink-600">{x.matched ? `${x.matched}/${x.total} 列` : '—'}</td>
                      <td className="num py-1.5 text-right text-ink-800">{x.rows ? fmtInt(x.rows) : '—'}</td>
                      <td className="py-1.5 pl-3 text-xs">{x.ok ? <span className="text-pine-700">参与核查</span> : <span className="text-seal-700">{x.reason}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {result.ok ? <p className="mt-2 text-xs text-ink-500">三类合并为一个核查批次，使用同一规则库。{result.source === 'upload' ? '文件仅在本机浏览器内解析，未上传任何服务器，刷新页面即清除。' : ''}</p> : null}
          </div>
        ) : (
          <>
            <div className="rounded-[16px] border border-dashed border-ink-950/[0.15] px-5 py-6">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void onFile(f);
                }}
              />
              <Button variant="primary" icon="file" loading={busy} onClick={() => inputRef.current?.click()}>
                浏览文件
              </Button>
              <p className="mt-2 text-xs text-ink-500">只能上传 Excel 文件，且不超过 20M。可直接选择 ERP 导出的原始文件；收款、付款、进口结算三个工作表按表头自动识别。</p>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-ink-700">演示文件（原型）</div>
              <ul className="divide-y divide-ink-950/[0.05] rounded-[14px] border border-ink-950/[0.07]">
                <DemoFile name={DEMO_FILE} desc="三个工作表：收款 128 / 付款 86 / 进口结算 32 笔，含设计好的疑点与国别不唯一情景" tone="pine" onUse={() => pick('all')} onDownload={downloadDemo} demo="demo-file-ok" />
                <DemoFile name="ERP收付款单据导出_收款_20261013.xlsx" desc="只含收款一个工作表：只核查这一类" tone="pine" onUse={() => pick('receipt')} />
                <DemoFile name={WRONG_FORMAT.fileName} desc="非 ERP 格式（网银流水）：演示上传失败" tone="seal" onUse={() => pick('wrong')} />
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function DemoFile({ name, desc, tone, onUse, onDownload, demo }: { name: string; desc: string; tone: 'pine' | 'seal'; onUse: () => void; onDownload?: () => void; demo?: string }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Icon name="sheet" size={18} className={tone === 'pine' ? 'text-pine-500' : 'text-seal-500'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink-900">{name}</div>
        <div className="text-xs text-ink-500">{desc}</div>
      </div>
      {onDownload ? (
        <Button size="sm" variant="ghost" icon="download" onClick={onDownload}>
          下载
        </Button>
      ) : null}
      <Button size="sm" onClick={onUse} data-demo={demo}>
        选用
      </Button>
    </li>
  );
}
