/**
 * 数据流转（lineage）：跟踪“一笔数据”在流程中每一阶段的结构，并标注字段的变化方式。
 * 全部基于真实执行结果计算（标准化、规则判定、导出版式），不是静态示意。
 */
import { codeLabel } from '@/domain/codes';
import { countryLabel } from '@/domain/countries';
import { BIZ_SHEET, HEADERS, columnOf, emptyFields, fmtDate8, inferValueDate, isRelatedParty, type FieldKey } from '@/domain/docs';
import { cleanName, cleanNameSteps } from '@/domain/names';
import { preprocessRemark } from '@/agent/semantic';
import { countsOf, inconsistentGroups, normName } from '@/agent/batchCountry';
import { isCacheHit, semanticKey, suspicionDetail, suspicionLabel, traceRule, type CheckRun } from '@/rules/engine';
import { LEVEL_LABEL, MAJOR_LABEL, type CheckContext, type RecordResult, type RuleDef, type StepKind } from '@/rules/types';
import type { CaseEntry } from '@/state/casebook';
import type { ActorKey } from './actors';

export type Change = 'keep' | 'map' | 'derive' | 'new' | 'mask' | 'drop';

export const CHANGE_LABEL: Record<Change, string> = {
  keep: '原样',
  map: '映射改名',
  derive: '派生计算',
  new: '新增',
  mask: '脱敏',
  drop: '不再携带',
};

export interface LField {
  k: string;
  v: string;
  change: Change;
  note?: string;
}

export interface LStage {
  key: string;
  title: string;
  type: string;
  actor: ActorKey;
  /** 这一步对结构做了什么 */
  summary: string;
  fields: LField[];
  more?: string;
}

const KIND_LABEL: Record<StepKind, string> = { perceive: '感知', tool: '工具', retrieve: '检索', reason: '推理', reflect: '自检', verdict: '结论', cache: '缓存' };

const SHOW: FieldKey[] = ['docNo', 'domesticName', 'counterparty', 'country', 'currency', 'amount', 'code1', 'remark1', 'txAmt1', 'nature', 'bankRef', 'docDate'];

const LOGICAL_COUNT = Object.keys(emptyFields()).length;

function cut(s: string, n = 46) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const fmtDist = (counts: [string, number][]) => counts.map(([c, n]) => `${c} ${n}`).join(' · ');

/** 一笔核查记录从上传到导出、留存的全过程 */
export function recordLineage(res: RecordResult, rules: RuleDef[], ctx: CheckContext, opts: { cases?: CaseEntry[]; source?: 'ui' | 'api'; libLabel?: string; empNo?: string } = {}): LStage[] {
  const rec = res.rec;
  const biz = rec.biz;
  const api = opts.source === 'api';
  const header = HEADERS[biz];
  const stages: LStage[] = [];
  const shown = SHOW.map((k) => ({ k, col: columnOf(biz, k) })).filter((x): x is { k: FieldKey; col: string } => !!x.col);
  const empties = header.filter((h) => !(rec.raw[h] ?? '').trim()).length;

  stages.push({
    key: 'raw',
    title: `上传 Excel：${BIZ_SHEET[biz]}工作表的一行`,
    type: 'Record<中文列名, string>',
    actor: api ? 'rpa' : 'checker',
    summary: api
      ? `RPA 读取供应商协同平台中待审批的线上付款申请，按付款单表头整理成 Excel 后调用上传接口；这是第 ${rec.row} 行。`
      : `核查岗从 ERP 导出三类单据并上传，${BIZ_SHEET[biz]}工作表共 ${header.length} 列，这是第 ${rec.row} 行。`,
    fields: shown.map(({ k, col }) => ({ k: col, v: rec.raw[col] || '—', change: 'keep' as const, note: k === 'bankRef' ? '内含到账日期' : undefined })),
    more: `其余 ${header.length - shown.length} 列未展示（整行空值 ${empties} 列）`,
  });

  const vd = inferValueDate(rec.f.bankRef);
  const related = isRelatedParty(rec.f.counterparty);
  stages.push({
    key: 'std',
    title: '标准化单据记录',
    type: 'DocRecord',
    actor: 'batch',
    summary: `${header.length} 个中文列映射为 ${LOGICAL_COUNT} 个统一逻辑字段（三类表共用），规则只面向逻辑字段编写；同时派生规则需要的字段。`,
    fields: [
      { k: 'key', v: rec.key, change: 'derive', note: '取单据编号，重复时追加行号' },
      { k: 'biz', v: `${biz}（${BIZ_SHEET[biz]}）`, change: 'new', note: '按工作表表头自动识别；三类合并为一个批次' },
      { k: 'row', v: String(rec.row), change: 'new', note: '原文件行号，导出与定位用' },
      ...shown.slice(0, 8).map(({ k, col }) => ({ k: `f.${k}`, v: rec.f[k] || '—', change: 'map' as const, note: `← ${col}` })),
      { k: '到账日期（推断）', v: vd ? fmtDate8(vd) : '无法推断', change: 'derive', note: '由银行流水号 BK+YYMMDD 推断，R601 使用' },
      { k: '是否集团关联方', v: related ? '是（在关联方名单内）' : '否', change: 'derive', note: 'R501 往来类型校验使用' },
      { k: '类别编码含义', v: codeLabel(rec.f.code1), change: 'derive', note: '查类别编码字典' },
    ],
    more: 'raw（原始整行）原样保留，导出时按原表头完整展示',
  });

  const applicable = rules.filter((r) => r.biz.includes(biz));
  stages.push({
    key: 'lib',
    title: '按工号匹配的规则库',
    type: 'RuleLib',
    actor: 'batch',
    summary: '统一认证工号 → doc_user_org → 所属区域 → 该区域规则库；三类单据共用，按适用范围执行。',
    fields: [
      { k: '工号', v: opts.empNo ?? '（统一认证）', change: 'new' },
      { k: '规则库', v: opts.libLabel ?? '所属区域规则库', change: 'new' },
      { k: '启用规则', v: `${rules.length} 条`, change: 'new' },
      { k: `适用${BIZ_SHEET[biz]}`, v: `${applicable.length} 条（批次级 ${applicable.filter((r) => r.batchLevel).length} 条）`, change: 'derive' },
    ],
  });

  const idx = ctx.batch;
  if (idx && rec.f.counterparty) {
    const g = idx.groupOf.get(cleanName(rec.f.counterparty));
    const exact = countsOf(idx.exact.get(normName(rec.f.counterparty)) ?? {});
    stages.push({
      key: 'batch',
      title: '批次级国别统计',
      type: 'BatchIndex',
      actor: 'agent',
      summary: `三类单据合并（${idx.counted} 笔境外往来记录），统计同一交易对方在本批次中的国别分布；写法不同的清洗后按相似度归并，智能体否决子公司误合并。`,
      fields: [
        { k: '交易对方（原始）', v: cut(rec.f.counterparty, 50), change: 'keep' },
        { k: '清洗后', v: cleanName(rec.f.counterparty), change: 'derive' },
        { k: '同名国别分布', v: exact.length ? fmtDist(exact) : '不参与（国别为空 / CHN / ZZZ）', change: 'new' },
        { k: '归并后国别分布', v: g ? `${fmtDist(g.countries)}（${g.variants.length} 种写法）` : '—', change: 'new' },
        { k: '多数国别', v: g ? (g.exclude ? `不适用：${g.exclude.kind === 'platform' ? '平台多国收付' : '名称无识别性'}` : g.majority ?? '平局') : '—', change: 'derive' },
        { k: '本笔国别', v: countryLabel(rec.f.country), change: 'keep' },
      ],
    });
  }

  const pre = preprocessRemark(rec.f.remark1);
  const key = semanticKey(rec.f.code1, rec.f.remark1);
  const hit = isCacheHit(key, 0.72);
  stages.push({
    key: 'sem',
    title: '语义归并键',
    type: '（类别编码, 规范化用途说明）',
    actor: 'batch',
    summary: '语义判断按组合去重：只看编码与规范化后的用途说明，同一组合的结论跨笔、跨天复用。',
    fields: [
      { k: 'code', v: rec.f.code1 || '—', change: 'keep' },
      { k: 'remark（原文）', v: rec.f.remark1 || '—', change: 'keep' },
      { k: 'cleaned', v: pre.cleaned || '（空）', change: 'derive', note: pre.removed.length ? `去除：${pre.removed.join('、')}` : '无需去除内容' },
      { k: 'key', v: key, change: 'new' },
      { k: 'cacheHit', v: hit ? '命中历史判定' : '未命中，进入智能体队列', change: 'new', note: hit ? '直接复用已确认结论，不调用大模型' : '新组合，批量调用后写入缓存' },
      { k: '客商名称、账号', v: '不进入语义判断', change: 'drop', note: '提示词只放必要字段' },
    ],
  });

  const primary = res.findings.find((f) => f.engine !== 'code') ?? res.findings[0];
  const rule = rules.find((r) => r.id === (primary?.ruleId ?? 'R101')) ?? rules.find((r) => r.engine !== 'code');
  if (rule) {
    const j = traceRule(rec, rule, ctx);
    const steps = j.steps ?? [];
    const tokens = steps.reduce((n, s) => n + (s.tokens ?? 0), 0);
    stages.push({
      key: 'judge',
      title: `规则判定：${rule.id}`,
      type: 'Judgement',
      actor: rule.engine === 'code' ? 'batch' : 'agent',
      summary: rule.engine === 'code' ? '确定性规则直接求值，结论直接采纳。' : '智能体读字段、调用工具、检索知识后给出结论、置信度与推理轨迹；低置信度转人工。',
      fields: [
        { k: 'rule', v: `${rule.id} ${rule.name}`, change: 'new' },
        { k: 'engine', v: rule.engine === 'code' ? '确定性规则' : rule.engine === 'agent' ? '智能体判断' : '规则预筛 + 智能体复核', change: 'new' },
        { k: 'verdict', v: { fail: '错误数据', warn: '疑问数据（需人工确认）', pass: '通过', skip: '不适用' }[j.verdict], change: 'new' },
        ...(j.confidence !== undefined ? [{ k: 'confidence', v: j.confidence.toFixed(2), change: 'new' as const, note: '低于 0.7 转人工' }] : []),
        ...(j.message ? [{ k: 'message', v: cut(j.message, 60), change: 'new' as const }] : []),
        ...(j.suggestion ? [{ k: 'suggestion', v: j.suggestion, change: 'new' as const }] : []),
        ...(j.fields?.length ? [{ k: 'fields', v: j.fields.join('、'), change: 'new' as const, note: '单据视图中标红' }] : []),
        { k: 'steps', v: steps.length ? steps.map((s) => KIND_LABEL[s.kind]).join(' → ') : '—', change: 'new', note: steps.length ? `${steps.length} 步${tokens ? `，约 ${tokens} tokens` : ''}` : undefined },
      ],
    });
  }

  stages.push({
    key: 'result',
    title: '单笔核查结果',
    type: 'RecordResult',
    actor: 'batch',
    summary: `合并这笔记录在 ${applicable.length} 条适用规则上的结论，决定整笔状态；每项疑点带大类。`,
    fields: [
      { k: 'status', v: res.status === 'fail' ? '有错误数据' : res.status === 'warn' ? '只有疑问数据' : '通过', change: 'new' },
      { k: 'findings', v: res.findings.length ? res.findings.map((f) => `${f.ruleId} ${f.ruleName}（${MAJOR_LABEL[f.major]}，${LEVEL_LABEL[f.level]}）`).join('；') : '无', change: 'new' },
      { k: 'cleared', v: res.cleared.length ? res.cleared.map((c) => c.ruleId).join('、') : '无', change: 'new', note: '智能体拦截的预筛误报' },
      { k: 'rec', v: '原记录（引用）', change: 'keep' },
    ],
  });

  const nonCountry = res.findings.filter((f) => f.major !== 'country');
  const country = res.findings.filter((f) => f.major === 'country');
  stages.push({
    key: 'export',
    title: '自动导出的结果文件',
    type: 'xlsx（多工作表）',
    actor: 'batch',
    summary: !res.findings.length ? '合规记录不出现在结果文件中（只导出疑点）。' : '非国别疑点写入本类疑点工作表（原导入全部列之前加疑点类型、核查说明，整行标红）；国别疑点三类合并写入“国别疑点”工作表。',
    fields: !res.findings.length
      ? [{ k: '整行', v: '不导出', change: 'drop', note: '需求：只导出核查疑点数据' }]
      : [
          ...(nonCountry.length
            ? [
                { k: `${BIZ_SHEET[biz]}疑点 · 疑点类型`, v: suspicionLabel({ ...res, findings: nonCountry }), change: 'new' as const, note: '第一列' },
                { k: `${BIZ_SHEET[biz]}疑点 · 核查说明`, v: cut(suspicionDetail({ ...res, findings: nonCountry }).replace(/\n/g, ' '), 60), change: 'new' as const },
              ]
            : []),
          ...(country.length
            ? [
                { k: '国别疑点 · 疑点类型', v: country.map((f) => f.ruleName).join('；'), change: 'new' as const, note: '国别单列一个工作表' },
                { k: '国别疑点 · 建议国别', v: (idx && idx.groupOf.get(cleanName(rec.f.counterparty))?.majority) || '—', change: 'derive' as const },
              ]
            : []),
          { k: '整行标红', v: '是', change: 'new' },
        ],
    more: res.findings.length ? `疑点工作表其后为原导入的全部 ${header.length} 列` : undefined,
  });
  if (res.findings.length)
    stages.push({
      key: 'save',
      title: '保存的疑点明细',
      type: 'FindingRow（doc_check_finding）',
      actor: 'batch',
      summary: '随批次保存，本人、辖内区域、集团可查看；不留存原始单据明细。',
      fields: [
        { k: 'docNo / bankRef', v: `${rec.f.docNo} / ${rec.f.bankRef}`, change: 'keep' },
        { k: 'biz', v: BIZ_SHEET[biz], change: 'keep' },
        { k: 'ruleId / major / level', v: res.findings.map((f) => `${f.ruleId} ${MAJOR_LABEL[f.major]} ${LEVEL_LABEL[f.level]}`).join('；'), change: 'new' },
        { k: 'counterparty / country', v: `${cut(rec.f.counterparty, 30)} / ${rec.f.country || '—'}`, change: 'keep', note: '国别大类查看与驾驶舱统计使用' },
        { k: '境内主体名称、账号等', v: '不留存', change: 'drop' },
      ],
    });

  const own = opts.cases?.filter((c) => c.docNo === rec.f.docNo) ?? [];
  if (own.length) {
    stages.push({
      key: 'case',
      title: '判例库条目',
      type: 'CaseEntry',
      actor: 'reviewer',
      summary: '人工结论回流：只保留编码与规范化用途说明（不含客商信息），下次同类用途说明直接复用。',
      fields: own.flatMap((c) => [
        { k: 'key', v: c.key, change: 'derive' as const },
        { k: 'decision', v: `${c.ruleId} ${c.decision === 'confirm' ? '确认疑点' : '判定误报'}`, change: 'new' as const },
        { k: 'who / at', v: `${c.who} ${c.at}`, change: 'new' as const },
      ]),
    });
  }
  return stages;
}

/** 国别大类：一个境外交易对方在一个批次里（三类单据合并）从写法差异到国别疑点 */
export function counterpartyLineage(run: CheckRun): { stages: LStage[]; subject: string } | null {
  const idx = run.ctx.batch;
  if (!idx) return null;
  const bad = inconsistentGroups(idx);
  const g = bad.find((x) => x.variants.length > 1) ?? bad[0];
  if (!g) return null;
  const keys = new Set(g.variants.flatMap((v) => Object.values(v.countries).flat()));
  const recs = run.results.filter((r) => keys.has(r.rec.key));
  const messy = [...g.variants].sort((a, b) => b.raw.length - a.raw.length)[0].raw;
  const steps = cleanNameSteps(messy);
  const merges = idx.merges.filter((m) => m.a === g.name || m.b === g.name || g.variants.some((v) => v.cleaned === m.a || v.cleaned === m.b));
  const flagged = recs.filter((r) => r.findings.some((f) => f.ruleId === 'R405' || f.ruleId === 'R406'));
  const stages: LStage[] = [
    {
      key: 'rows',
      title: '三类单据中的这个交易对方',
      type: 'DocRecord[]',
      actor: 'checker',
      summary: `同一批次（收款 / 付款 / 进口结算单合并）中有 ${recs.length} 笔涉及该对手，${g.variants.length} 种写法。`,
      fields: recs.slice(0, 7).map((r) => ({ k: `${BIZ_SHEET[r.rec.biz]} ${r.rec.f.docNo.slice(-10)}`, v: `${cut(r.rec.f.counterparty, 44)} → ${r.rec.f.country}`, change: 'keep' as const })),
      more: recs.length > 7 ? `另 ${recs.length - 7} 笔未展示` : undefined,
    },
    {
      key: 'clean',
      title: '名称清洗',
      type: 'CleanStep[]',
      actor: 'batch',
      summary: '确定性清洗：去前缀、截地址、统一大写、去标点、压缩空格、剔除行业后缀。',
      fields: [{ k: '原始名称', v: messy, change: 'keep' }, ...steps.steps.map((x) => ({ k: x.op, v: x.after, change: 'derive' as const })), { k: '清洗结果', v: steps.result, change: 'new' }],
    },
    {
      key: 'group',
      title: '相似度归并与智能体否决',
      type: 'CpGroup',
      actor: 'agent',
      summary: '相似度 ≥ 阈值视为同一主体；含地区限定词（子公司）由智能体否决合并；平台类多国收付排除。',
      fields: [
        { k: 'name', v: g.name, change: 'derive' },
        { k: 'variants', v: `${g.variants.length} 种写法 → 1 个主体`, change: 'derive' },
        ...merges.slice(0, 3).map((m, i) => ({ k: `merge[${i}]`, v: `${m.decision === 'merge' ? '合并' : '不合并'}（${m.sim.toFixed(2)}）：${cut(m.reason, 50)}`, change: 'new' as const })),
      ],
    },
    {
      key: 'dist',
      title: '本批次国别分布',
      type: '国别 → 笔数',
      actor: 'batch',
      summary: '同一交易对方国别应唯一（资金收付管理制度 4.2.3.1）；多数国别作为建议，少数国别的记录为疑点，平局全部提示。',
      fields: [
        { k: 'countries', v: fmtDist(g.countries), change: 'new' },
        { k: 'majority', v: g.majority ? countryLabel(g.majority) : '平局，需人工确认', change: 'derive' },
      ],
    },
    {
      key: 'finding',
      title: '国别疑点',
      type: 'Finding（大类：国家/地区）',
      actor: 'agent',
      summary: `${flagged.length} 笔被标为国别疑点（R405 同名 / R406 相近写法）。`,
      fields: flagged.slice(0, 5).map((r) => {
        const f = r.findings.find((x) => x.ruleId === 'R405' || x.ruleId === 'R406')!;
        return { k: `${f.ruleId} ${r.rec.f.docNo.slice(-10)}`, v: cut(f.message, 70), change: 'new' as const };
      }),
    },
    {
      key: 'sheet',
      title: '“国别疑点”工作表',
      type: 'xlsx 行',
      actor: 'batch',
      summary: '国别疑点三类合并，单独一张工作表，按交易对方归组；在线查看时国别为一个大类。',
      fields: [
        { k: '交易对方（清洗后）', v: g.name, change: 'keep' },
        { k: '本批次国别分布', v: g.countries.map(([c, n]) => `${c}×${n}`).join('、'), change: 'new' },
        { k: '建议国别', v: g.majority ?? '', change: 'new' },
        { k: '单据类别 / 单据编号', v: flagged[0] ? `${BIZ_SHEET[flagged[0].rec.biz]} / ${flagged[0].rec.f.docNo}` : '—', change: 'keep' },
      ],
    },
  ];
  return { stages, subject: g.name };
}
