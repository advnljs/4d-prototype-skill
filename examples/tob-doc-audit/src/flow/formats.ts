/**
 * 文件 / 数据格式样例：每种数据对象“实际长什么样”。
 * - 文件类（Excel）直接复用导出模块的工作表模型（与下载文件一致）；
 * - 库表给出建议表名、列定义与样例行；内存 / 接口类给出 JSON 或请求样例；规则给出 DSL。
 * 全部由演示数据与真实执行结果生成（演示角色：杭州子公司核查岗 → 华东区域规则库）。
 */
import { BIZ_SHEET, BIZ_TITLE, HEADERS, type BizType } from '@/domain/docs';
import { USERS, USER_ORG, orgByCode, ruleLibOrgOf, tier2Of } from '@/domain/orgs';
import { preprocessRemark } from '@/agent/semantic';
import { inconsistentGroups } from '@/agent/batchCountry';
import { batchResultSheets, ledgerSheet } from '@/lib/exporters';
import type { XSheet } from '@/lib/xlsx/writer';
import { hash } from '@/lib/format';
import { mockLedger, SCENARIOS } from '@/mock/ledger';
import { POLICIES } from '@/mock/policies';
import { isCacheHit, runChecks, semanticKey, traceRule, type CheckRun } from '@/rules/engine';
import { LEVEL_LABEL, MAJOR_LABEL, type TraceStep } from '@/rules/types';
import { casebookStore } from '@/state/casebook';
import { WRITEBACK_LABEL, rectifyStore, writebackOf } from '@/state/closure';
import { POOL_MAP, libName, libOf, ruleLibStore } from '@/state/ruleLibs';
import { batchFindings, seedBatches, resultsStore, type CheckBatch } from '@/state/results';
import { checkSetupFor } from '@/state/useCheckSetup';
import type { DataKey } from './dataObjects';

export type FormatSample =
  | { kind: 'sheet'; title: string; fileName: string; sheet: XSheet; naming?: string; note: string }
  | { kind: 'json'; title: string; value: unknown; note: string }
  | { kind: 'form'; title: string; fields: ([string, string] | [string, string, 'wide'])[]; note: string }
  /** 文书原样：标题、发文信息、条款正文 */
  | { kind: 'doc'; title: string; docTitle: string; meta: string[]; clauses: { no: string; text: string }[]; note: string }
  /** 智能体推理轨迹（与页面上的推理轨迹同一种展示） */
  | { kind: 'trace'; title: string; steps: TraceStep[]; verdict: string; note: string }
  | { kind: 'code'; title: string; code: string; note: string }
  /** 数据库表：表名、所在库、列定义（名称 / 类型 / 说明）与样例行 */
  | { kind: 'table'; title: string; table: string; store: string; columns: DbColumn[]; rows: (string | number | null)[][]; total?: number; note: string };

export interface DbColumn {
  name: string;
  type: string;
  comment: string;
}

const col = (name: string, type: string, comment: string): DbColumn => ({ name, type, comment });
const SERVER = '服务端业务库（建议；原型存于浏览器本地）';

const TIME = '2026-10-14 14:01:26';
const BATCH = 'B20261014-0101';
const EMP = USERS.checker.empNo;

/** 演示批次：三类台账合并，按核查岗工号匹配的华东区域规则库核查 */
function demoRun(): CheckRun & { libLabel: string } {
  const s = checkSetupFor(EMP);
  const recs = (['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b));
  return { ...runChecks(recs, s.rules, s.ctx), libLabel: s.libLabel };
}

/** RPA 接口上传的演示待付款申请（与一键核查页一致） */
function apiRecords() {
  return mockLedger('payment').filter((r) => (SCENARIOS[r.key] ? hash(r.key) % 2 === 0 : hash(r.key) % 3 === 0));
}

const pickCountry = (run: CheckRun) => run.results.find((r) => r.findings.some((f) => f.ruleId === 'R406')) ?? run.results.find((r) => r.findings.some((f) => f.ruleId === 'R405')) ?? run.results.find((r) => r.status === 'fail')!;
const pickR101 = (run: CheckRun) => run.results.find((r) => r.findings.some((f) => f.ruleId === 'R101' && f.level === 'error')) ?? run.results.find((r) => r.status === 'fail')!;

const rate = (b: { total: number; suspicious: number }) => (b.total ? `${((b.suspicious / b.total) * 100).toFixed(1)}%` : '—');

/** 生成某个数据对象的格式样例（可能有多个，如规则 = 结构 + DSL） */
export function formatSamples(key: DataKey): FormatSample[] {
  switch (key) {
    case 'policyDoc': {
      const d = POLICIES[0];
      return [
        {
          kind: 'doc',
          title: '制度文件（原文版式）',
          docTitle: d.title.replace(/[《》]/g, ''),
          meta: [d.kind, `共 ${d.pages} 页`, '概括摘要（非原文）'],
          clauses: d.clauses.map((c) => ({ no: c.no, text: c.summary })),
          note: '集团上传的资金收付管理制度与填写规范手册；智能体按条款切分后逐条判断能否由上传的单据数据校验，生成带大类与依据的规则。',
        },
        { kind: 'json', title: '解读结果（PolicyDoc）', value: { ...d, clauses: d.clauses.slice(0, 3) }, note: '条款切分与比对结论：covered 已覆盖 / new 建议新增 / manual 转人工。' },
      ];
    }
    case 'userOrg': {
      const libs = ruleLibStore.get().libs;
      return [
        {
          kind: 'table',
          title: '用户与组织对应表',
          table: 'doc_user_org',
          store: '业务库（统一认证 / 人力系统每日同步）',
          columns: [
            col('emp_no', 'CHAR(8) PK', '工号（统一认证中的用户 id）'),
            col('emp_name', 'VARCHAR(20)', '姓名'),
            col('org_code', 'CHAR(6)', '所属组织'),
            col('post', 'VARCHAR(10)', 'checker / reviewer / tier2 / tier1'),
            col('rule_lib_org', 'CHAR(6)', '规则库所属组织（派生，可不落库）'),
            col('synced_at', 'DATETIME', '同步时间'),
          ],
          rows: USER_ORG.map((u) => {
            const lo = ruleLibOrgOf(u.empNo)!;
            return [u.empNo, u.name, `${u.orgCode} ${orgByCode(u.orgCode)?.short ?? ''}`, u.post, `${lo}（${libs[lo]?.version}）`, '2026-10-14 06:00:00'];
          }),
          note: '统一认证只带工号；核查时按工号查本表得到组织与岗位，进而确定规则库与结果可见范围。',
        },
      ];
    }
    case 'ruleLib': {
      const lib = libOf('110000');
      const r = POOL_MAP.get('R405')!;
      return [
        {
          kind: 'table',
          title: `规则库表（${libName(lib.orgCode)} ${lib.version}）`,
          table: 'doc_rule_lib',
          store: SERVER,
          columns: [
            col('lib_org', 'CHAR(6)', '规则库所属组织'),
            col('rule_id', 'CHAR(4)', '规则编号（引用规则实现）'),
            col('rule_name', 'VARCHAR(60)', '规则名称（= 导出疑点类型）'),
            col('major', 'VARCHAR(16)', '大类（参照资金收付管理制度结构）'),
            col('level', 'VARCHAR(8)', 'error 错误数据 / warn 疑问数据（本区域可调）'),
            col('engine', 'VARCHAR(8)', 'code / agent / hybrid'),
            col('enabled', 'BOOLEAN', '本区域启用状态'),
            col('refs', 'VARCHAR(200)', '依据：制度条款号 / 手册章节'),
          ],
          rows: Object.entries(lib.items).map(([id, it]) => {
            const d = POOL_MAP.get(id)!;
            return [lib.orgCode, id, d.name, MAJOR_LABEL[d.major], it.level ?? d.level, d.engine, it.enabled ? 'true' : 'false', d.refs.map((x) => x.no ?? x.title).join('；')];
          }),
          note: '集团与各区域各一套；参数存 doc_rule_lib_param，规则实现与 DSL 在规则实现池中按版本存档。',
        },
        {
          kind: 'json',
          title: `规则记录（${r.id}）`,
          value: { id: r.id, name: r.name, major: r.major, majorLabel: MAJOR_LABEL[r.major], engine: r.engine, level: r.level, rigid: r.rigid, batchLevel: r.batchLevel, biz: r.biz, owner: r.owner, refs: r.refs, check: '(rec, ctx) => Judgement' },
          note: '规则记录带“大类”与依据（资金收付管理制度条款号、填写规范手册章节）。',
        },
        { kind: 'code', title: 'AI 生成的规则逻辑（DSL，供审核）', code: r.logic, note: '审核通过后转为可执行代码（原型中为 TypeScript 实现）。' },
      ];
    }
    case 'ruleDiff': {
      const lib = libOf('110000');
      return [
        {
          kind: 'table',
          title: '规则库版本与变更表',
          table: 'doc_rule_lib_version',
          store: SERVER,
          columns: [
            col('lib_org', 'CHAR(6)', '规则库所属组织'),
            col('version', 'VARCHAR(16)', '版本号'),
            col('published_at', 'DATETIME', '发布时间'),
            col('operator', 'VARCHAR(40)', '发布人'),
            col('via', 'VARCHAR(8)', 'nl 自然语言 / manual 手工 / init'),
            col('change_kind', 'VARCHAR(8)', 'add / disable / param / level…'),
            col('rule_id', 'CHAR(4)', '规则'),
            col('before_val / after_val', 'VARCHAR(100)', '变更前后（diff）'),
            col('confirmed', 'BOOLEAN', '是否被确认（未确认也留痕）'),
          ],
          rows: lib.versions.flatMap((v) => [
            ...v.changes.map((c) => [lib.orgCode, v.version, v.at, v.who, v.via, c.kind, c.ruleId, `${c.before} → ${c.after}`, 'true']),
            ...v.rejected.map((c) => [lib.orgCode, v.version, v.at, v.who, v.via, c.kind, c.ruleId, `${c.before} → ${c.after}`, 'false']),
          ]),
          note: '每次更新一个版本、多条变更；自然语言原话存 instruction 列（略）。可按版本回看 diff。',
        },
        { kind: 'json', title: `版本 ${lib.versions[0].version}（LibVersion）`, value: lib.versions[0], note: '自然语言维护的一个版本：原话、确认的变更、未确认的变更。' },
      ];
    }
    case 'docFile':
      return (['receipt', 'payment', 'settlement'] as BizType[]).map((b) => ({
        kind: 'sheet' as const,
        title: `${BIZ_SHEET[b]}工作表`,
        fileName: 'ERP收付款单据导出_20261008-20261013.xlsx',
        sheet: { ...ledgerSheet(BIZ_TITLE[b], HEADERS[b], mockLedger(b)), name: BIZ_SHEET[b] },
        note: `一个文件三个工作表；第 1 行标题、第 2 行 ${HEADERS[b].length} 列中文表头，其后每行一笔单据。按表头自动识别类别，三类合并为一个核查批次。`,
      }));
    case 'platformData': {
      const recs = apiRecords();
      const f = recs[1].f;
      return [
        {
          kind: 'form',
          title: '供应商协同平台 · 付款申请详情（模拟环境）',
          fields: [
            ['申请编号', `PA-${f.docNo.slice(-8)}`],
            ['付款方（本方单位）', f.domesticName],
            ['收款方（供应商）', f.counterparty],
            ['供应商国家/地区', f.country],
            ['申请金额', `${f.currency} ${f.amount}`],
            ['费用类别', f.code1],
            ['用途说明', f.remark1],
            ['合同号', f.contractNo || '—'],
            ['期望付款日', f.docDate],
          ],
          note: 'RPA 读取的数据来源：供应商协同平台的待付款申请详情页（约 30 项）。',
        },
        {
          kind: 'sheet',
          title: 'RPA 整理成的付款单 Excel',
          fileName: '供应商协同平台待付款申请_20261014.xlsx',
          sheet: { ...ledgerSheet(BIZ_TITLE.payment, HEADERS.payment, recs), name: '付款' },
          note: '表头与 ERP 付款单完全一致，所以后台核查逻辑与界面上传相同。',
        },
      ];
    }
    case 'apiUpload':
      return [
        {
          kind: 'code',
          title: '上传接口（RPA 调用）',
          code: `POST /doc-audit/api/v1/batches HTTP/1.1
Content-Type: multipart/form-data; boundary=----docaudit
Authorization: Bearer …（RPA 服务账号）

------docaudit
Content-Disposition: form-data; name="operator"

${EMP}
------docaudit
Content-Disposition: form-data; name="source"

rpa-supplier-portal
------docaudit
Content-Disposition: form-data; name="file"; filename="供应商协同平台待付款申请_20261014.xlsx"
<付款工作表>
------docaudit--

HTTP/1.1 202 Accepted
{ "batchId": "${BATCH}", "status": "queued" }

GET /doc-audit/api/v1/batches/${BATCH}
→ { "status": "done", "total": 31, "suspicious": 9, "resultUrl": "/doc-audit/api/v1/batches/${BATCH}/result.xlsx" }`,
          note: 'operator 决定规则库与结果归属；接口与界面上传走同一核查流程。原型中为模拟。',
        },
      ];
    case 'docRecord': {
      const r = pickR101(demoRun()).rec;
      const keys = ['orgCode', 'docNo', 'tradeType', 'domesticName', 'counterparty', 'country', 'settle', 'currency', 'amount', 'code1', 'remark1', 'txAmt1', 'nature', 'bankRef', 'docDate', 'usdAmt'] as const;
      return [
        {
          kind: 'json',
          title: '标准化单据记录（DocRecord）',
          value: { key: r.key, biz: r.biz, row: r.row, f: Object.fromEntries(keys.map((k) => [k, r.f[k]])), 'f…': `其余 ${Object.keys(r.f).length - keys.length} 个逻辑字段`, raw: `{ …原始 ${Object.keys(r.raw).length} 列（中文列名 → 值） }` },
          note: 'f 为统一逻辑字段（三类表共用），raw 保留原始整行用于导出。',
        },
      ];
    }
    case 'checkCtx': {
      const run = demoRun();
      const idx = run.ctx.batch;
      return [
        {
          kind: 'json',
          title: '核查上下文（CheckContext）',
          value: {
            today: '2026-10-14T09:30:00',
            ruleLib: run.libLabel,
            params: Object.fromEntries(Object.entries(run.ctx.params).filter(([, v]) => Object.keys(v).length).slice(0, 4)),
            projectEntities: [...run.ctx.projectEntities].slice(0, 3),
            batch: idx ? { records: idx.records, counted: idx.counted, groups: idx.groups.length, inconsistent: inconsistentGroups(idx).length } : null,
          },
          note: '一次核查共享：所属组织规则库参数、战略项目名单、批次级国家/地区索引。',
        },
      ];
    }
    case 'batchIndex': {
      const idx = demoRun().ctx.batch!;
      return [
        {
          kind: 'json',
          title: '批次级国家/地区索引（BatchIndex）',
          value: {
            records: idx.records,
            counted: idx.counted,
            groups: idx.groups.length,
            inconsistent: inconsistentGroups(idx).map((g) => ({ name: g.name, variants: g.variants.map((v) => ({ raw: v.raw, countries: Object.fromEntries(Object.entries(v.countries).map(([c, ks]) => [c, ks.length])) })), countries: g.countries, majority: g.majority })),
            excluded: idx.groups.filter((g) => g.exclude && g.countries.length > 1).map((g) => ({ name: g.name, reason: g.exclude!.reason })),
            merges: idx.merges.slice(0, 4),
          },
          note: '三类单据合并统计；inconsistent 即国别不唯一的交易对方（国别大类、“国别疑点”工作表的来源）。',
        },
      ];
    }
    case 'semKey': {
      const run = demoRun();
      const r = pickR101(run).rec;
      const pre = preprocessRemark(r.f.remark1);
      const key = semanticKey(r.f.code1, r.f.remark1);
      const combos = new Map<string, { code: string; cleaned: string; n: number; fail: boolean }>();
      for (const res of run.results) {
        const k = semanticKey(res.rec.f.code1, res.rec.f.remark1);
        const x = combos.get(k) ?? { code: res.rec.f.code1, cleaned: preprocessRemark(res.rec.f.remark1).cleaned, n: 0, fail: false };
        x.n++;
        x.fail = x.fail || res.findings.some((f) => ['R101', 'R102'].includes(f.ruleId));
        combos.set(k, x);
      }
      const ordered = [...combos].sort((a, b) => Number(b[1].fail) - Number(a[1].fail) || b[1].n - a[1].n);
      return [
        {
          kind: 'table',
          title: '判定缓存表',
          table: 'doc_semantic_cache',
          store: SERVER,
          columns: [
            col('cache_key', 'VARCHAR(300) PK', '类别编码|规范化用途说明'),
            col('trade_code', 'CHAR(6)', '类别编码'),
            col('remark_norm', 'VARCHAR(256)', '规范化用途说明（不含客商信息）'),
            col('verdict', 'VARCHAR(8)', '疑点 / 通过（人工结论优先）'),
            col('hit_cnt', 'INT', '本批命中笔数'),
            col('cache_hit', 'BOOLEAN', '是否命中历史判定'),
          ],
          rows: ordered.slice(0, 14).map(([k, x]) => [k, x.code, x.cleaned, x.fail ? '疑点' : '通过', x.n, isCacheHit(k, 0.72) ? 'true' : 'false']),
          total: combos.size,
          note: `本批 ${run.stats.semantic.lines} 行明细只有 ${combos.size} 个组合；命中缓存的直接复用，新组合才调用智能体。`,
        },
        {
          kind: 'json',
          title: '语义组合与判定缓存',
          value: { code: r.f.code1, remark: r.f.remark1, cleaned: pre.cleaned, removed: pre.removed, key, cacheHit: isCacheHit(key, 0.72), stats: { lines: run.stats.semantic.lines, uniqueCombos: run.stats.semantic.uniqueCombos, cacheHits: run.stats.semantic.cacheHits } },
          note: '只看编码与规范化用途说明，不含客商信息；同一组合的判定跨笔、跨天复用。',
        },
      ];
    }
    case 'judgement': {
      const run = demoRun();
      const res = pickCountry(run);
      const f = res.findings.find((x) => x.major === 'country') ?? res.findings[0];
      const rule = run.rules.find((x) => x.id === f.ruleId)!;
      const j = traceRule(res.rec, rule, run.ctx);
      return [
        {
          kind: 'trace',
          title: `推理轨迹：${rule.id} ${rule.name}`,
          steps: j.steps ?? [],
          verdict: `${{ fail: '错误数据', warn: '疑问数据', pass: '通过', skip: '不适用' }[j.verdict]}${j.confidence !== undefined ? ` · 置信度 ${j.confidence.toFixed(2)}` : ''}${j.suggestion ? ` · ${j.suggestion}` : ''}`,
          note: '与详情抽屉中“逐条规则执行明细”同一份轨迹；批次级规则先看整批的国别分布，再判断本笔。',
        },
        {
          kind: 'json',
          title: '规则判定与推理轨迹（Judgement）',
          value: { verdict: j.verdict, confidence: j.confidence, message: j.message, suggestion: j.suggestion, fields: j.fields, steps: (j.steps ?? []).map((st) => ({ kind: st.kind, title: st.title })) },
          note: '智能体规则输出结论、置信度与逐步推理轨迹，随结果留存可审计。',
        },
      ];
    }
    case 'recordResult': {
      const res = pickCountry(demoRun());
      return [
        {
          kind: 'json',
          title: '单笔核查结果（RecordResult）',
          value: { rec: `<DocRecord ${res.rec.key}>`, status: res.status, findings: res.findings.map((f) => ({ ruleId: f.ruleId, ruleName: f.ruleName, major: f.major, majorLabel: MAJOR_LABEL[f.major], level: f.level, levelLabel: LEVEL_LABEL[f.level], engine: f.engine, message: f.message, confidence: f.confidence })), cleared: res.cleared },
          note: '每项疑点带大类；status：有错误数据为 fail，只有疑问数据为 warn。',
        },
      ];
    }
    case 'runStats': {
      const st = demoRun().stats;
      return [
        {
          kind: 'json',
          title: '批次统计（RunStats）',
          value: { total: st.total, suspicious: st.suspicious, failCount: st.failCount, warnCount: st.warnCount, passCount: st.passCount, ruleHits: st.ruleHits, semantic: st.semantic, estMs: st.estMs, estTokens: st.estTokens },
          note: '结果文件首行汇总、核查批次、驾驶舱都来自这里。',
        },
      ];
    }
    case 'resultXlsx': {
      const run = demoRun();
      const sheets = batchResultSheets(run.results, run.ctx.batch, { batchId: BATCH, time: TIME, lib: run.libLabel, empNo: EMP, source: '界面上传' });
      return sheets.map((sh) => ({
        kind: 'sheet' as const,
        title: `结果文件 · ${sh.name}`,
        fileName: `核查结果-20261014-${EMP}-001.xlsx`,
        naming: '核查结果-核查日期-员工编号-流水号.xlsx',
        sheet: sh,
        note:
          sh.name === '国别疑点'
            ? '国别疑点三类合并单列：按交易对方归组，写明本批次国别分布与建议国别（多数国别），便于整组修改。'
            : '首行汇总（总核查笔数、疑点笔数、批次号、规则库版本、来源）；只导出疑点；第一列疑点类型、第二列核查说明，其后为原导入全部列；整行标红。',
      }));
    }
    case 'batchRecord': {
      const local = resultsStore.get().batches;
      const list: CheckBatch[] = [...local, ...seedBatches()].slice(0, 12);
      const b = list.find((x) => x.countryRecs > 0) ?? list[0];
      const rows = batchFindings(b);
      return [
        {
          kind: 'table',
          title: '核查批次表',
          table: 'doc_check_batch',
          store: SERVER,
          columns: [
            col('batch_id', 'VARCHAR(20) PK', '批次号'),
            col('check_time', 'DATETIME', '核查时间'),
            col('org_code', 'CHAR(6)', '操作人所属组织'),
            col('emp_no', 'CHAR(8)', '操作人工号（接口上传为触发人）'),
            col('source', 'VARCHAR(4)', 'ui 界面上传 / api 接口上传'),
            col('lib_version', 'VARCHAR(30)', '规则库与版本'),
            col('total_cnt / suspect_cnt', 'INT', '核查笔数 / 疑点笔数'),
            col('country_cnt', 'INT', '国别疑点笔数'),
            col('result_file', 'VARCHAR(80)', '结果文件（加密留存）'),
          ],
          rows: list.map((x) => [x.id, x.time, `${x.orgCode} ${orgByCode(x.orgCode)?.short ?? ''}`, x.empNo, x.source, `${x.libOrg} ${x.libVersion}`, `${x.total} / ${x.suspicious}`, x.countryRecs, x.reportName]),
          note: '每次核查一行；查看范围按统一认证工号：子公司看本公司、区域看辖内、集团看全部。',
        },
        {
          kind: 'table',
          title: `疑点明细表（批次 ${b.id}）`,
          table: 'doc_check_finding',
          store: SERVER,
          columns: [col('batch_id', 'VARCHAR(20)', '批次号'), col('doc_no', 'CHAR(20)', '单据编号'), col('biz', 'VARCHAR(4)', '单据类别'), col('rule_id', 'CHAR(4)', '规则'), col('major', 'VARCHAR(16)', '大类'), col('level', 'VARCHAR(8)', '错误 / 疑问'), col('message', 'VARCHAR(500)', '说明')],
          rows: rows.slice(0, 20).map((f) => [b.id, f.docNo, BIZ_SHEET[f.biz], f.ruleId, MAJOR_LABEL[f.major], LEVEL_LABEL[f.level], f.message]),
          total: rows.length,
          note: '不留存原始单据明细（客商名称、账号等）；国别疑点另存交易对方与国别，供国家/地区大类查看与驾驶舱统计。',
        },
      ];
    }
    case 'writeback': {
      const setup = checkSetupFor(EMP);
      const items = writebackOf(runChecks(apiRecords(), setup.rules, setup.ctx).results);
      const hold = items.filter((i) => i.action === 'HOLD');
      return [
        {
          kind: 'json',
          title: 'RPA → 供应商协同平台：回写报文（模拟）',
          value: { source: 'doc-audit', operator: EMP, at: '2026-10-14 10:35:12', count: items.length, hold: hold.length, items: [...hold.slice(0, 2), ...items.filter((i) => i.action === 'RELEASE').slice(0, 1)] },
          note: '协同平台若有开放接口则直接调用；没有时由 RPA 在页面上逐笔操作（挂起并填写备注）。',
        },
        {
          kind: 'table',
          title: '回写记录表',
          table: 'doc_api_writeback',
          store: SERVER,
          columns: [col('apply_no', 'CHAR(20)', '付款申请号（= 付款单单据编号）'), col('action', 'VARCHAR(8)', 'HOLD 挂起 / RELEASE 放行'), col('reason', 'VARCHAR(200)', '挂起原因（疑点大类：规则）'), col('amount', 'DECIMAL(18,2)', '金额'), col('written_at', 'DATETIME', '回写时间')],
          rows: [...hold, ...items.filter((i) => i.action === 'RELEASE')].slice(0, 12).map((i) => [i.applyNo, `${i.action} ${WRITEBACK_LABEL[i.action]}`, i.reason || null, `${i.currency} ${i.amount}`, '2026-10-14 10:35']),
          total: items.length,
          note: '回写结果留痕，便于对账“哪些付款因为核查被拦下”；驾驶舱的“付款申请被挂起”即接口批次的疑点笔数。',
        },
      ];
    }
    case 'rectify': {
      const items = rectifyStore.get().items;
      return [
        {
          kind: 'table',
          title: '整改记录表',
          table: 'doc_check_rectify',
          store: SERVER,
          columns: [col('case_id', 'VARCHAR(40)', '对应判例（确认的疑点）'), col('doc_no', 'CHAR(20)', '单据编号'), col('rule_id', 'CHAR(4)', '规则'), col('action', 'VARCHAR(200)', '整改动作'), col('operator', 'VARCHAR(40)', '整改人（核查岗）'), col('rectified_at', 'DATETIME', '整改时间')],
          rows: items.map((x) => [x.caseId, x.docNo, x.ruleId, x.action, x.who, x.at]),
          note: '整改在 ERP 中完成，这里只登记结果；整改率 = 已整改 / 复核确认的疑点。',
        },
      ];
    }
    case 'casebook': {
      const cases = casebookStore.get().cases;
      return [
        {
          kind: 'table',
          title: '判例库表',
          table: 'doc_casebook',
          store: SERVER,
          columns: [
            col('case_key', 'VARCHAR(300)', '语义组合（编码|规范化用途说明）或 规则|单据号'),
            col('rule_id', 'CHAR(4)', '规则编号'),
            col('decision', 'VARCHAR(8)', 'confirm 确认疑点 / reject 判定误报'),
            col('operator', 'VARCHAR(40)', '反馈人（复核岗）'),
            col('created_at', 'DATETIME', '反馈时间'),
          ],
          rows: cases.map((c) => [c.key, c.ruleId, c.decision, c.who, c.at]),
          note: '不含客商名称等敏感信息；夜间跑批时同类用途说明直接复用，并作为提示词中的示例。',
        },
      ];
    }
    case 'cockpitAgg': {
      const agg = new Map<string, { batches: number; total: number; suspicious: number; country: number; api: number }>();
      for (const b of seedBatches()) {
        const k = orgByCode(b.orgCode)?.level === 'tier2' ? b.orgCode : tier2Of(b.orgCode)?.code ?? b.orgCode;
        const x = agg.get(k) ?? { batches: 0, total: 0, suspicious: 0, country: 0, api: 0 };
        x.batches++;
        x.total += b.total;
        x.suspicious += b.suspicious;
        x.country += b.countryRecs;
        if (b.source === 'api') x.api++;
        agg.set(k, x);
      }
      return [
        {
          kind: 'table',
          title: '驾驶舱聚合（集团视角：按区域）',
          table: 'v_doc_cockpit_org（视图）',
          store: '由 doc_check_batch 实时聚合',
          columns: [col('org', 'VARCHAR(40)', '区域'), col('batches', 'INT', '批次数'), col('total_cnt', 'INT', '核查笔数'), col('suspect_cnt', 'INT', '疑点笔数'), col('suspect_rate', 'DECIMAL', '疑点率'), col('country_cnt', 'INT', '国别疑点'), col('api_batches', 'INT', '接口上传批次')],
          rows: [...agg].map(([k, x]) => [orgByCode(k)?.name ?? k, x.batches, x.total, x.suspicious, rate(x), x.country, x.api]),
          note: '区域视角按辖内子公司聚合；另有按大类（byMajor）、按日期的聚合供热力图与趋势图使用。',
        },
      ];
    }
    default:
      return [];
  }
}
