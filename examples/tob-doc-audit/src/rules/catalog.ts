/**
 * 核查规则实现池（原型初始规则集）。
 * 各组织规则库从这里选用规则并独立维护启停、参数与类别（见 state/ruleLibs.ts）。
 * 规则来源分三层：集团制度（刚性，不可停用）→ 集团财务共享中心补充 → 区域自定。
 * 每条规则标注大类与依据：（虚构的）《资金收付管理制度（2026 版）》条款号、《单据填写规范手册（2025 版）》章节或区域要求；
 * “逻辑”为 AI 生成、供管理员审核的 DSL 伪代码。
 */
import { countryLabel } from '@/domain/countries';
import { DOC_NO_RE, date8ToDate, fmtDate8, inferValueDate, isRelatedParty, n0, num, workdaysBetween, type DocRecord, type FieldKey } from '@/domain/docs';
import { fmtAmt } from '@/lib/format';
import { PLATFORM_RE } from '@/agent/semantic';
import { Tracer, judgeBatchExact, judgeBatchSimilar, judgeCodeRemark, judgeCountryAddress, judgeGenericRemark, judgeNature } from './judges';
import type { CheckContext, Judgement, RuleDef } from './types';

/* ---------------- 确定性规则的统一轨迹 ---------------- */

interface CodeOutcome {
  fail: boolean;
  message?: string;
  suggestion?: string;
  fields?: FieldKey[];
  warn?: boolean;
  calc?: string;
}

function codeRule(
  rec: DocRecord,
  trace: boolean,
  id: string,
  inputs: Record<string, string>,
  expr: string,
  evaluate: () => CodeOutcome | null,
): Judgement {
  const t = new Tracer(trace, rec.key + id);
  t.add('perceive', '读取字段', undefined, inputs);
  const out = evaluate();
  if (!out) return t.done({ verdict: 'skip', message: '前置条件不满足，本规则不适用。' });
  t.add('tool', '执行规则表达式', out.calc, { 表达式: expr, 结果: out.fail ? '命中' : '未命中' });
  if (!out.fail) return t.done({ verdict: 'pass' });
  return t.done({
    verdict: out.warn ? 'warn' : 'fail',
    confidence: 1,
    message: out.message,
    suggestion: out.suggestion,
    fields: out.fields,
  });
}

const BIZ_ALL = ['receipt', 'payment', 'settlement'] as const;
const INIT = { version: 'v1.0', updatedAt: '2026-09-28 10:12', updatedBy: '规则库初始化（AI 解读制度，集团财务共享中心审核）' };
export const OWNER_HQ = '集团制度（刚性）';
export const OWNER_T1 = '集团财务共享中心补充';
export const OWNER_LOCAL = '区域自定';

/** 境外往来：境外客商（1）或集团内关联方（3） */
const OVERSEAS = ['1', '3'];

function p(ctx: CheckContext, id: string, key: string, def: number): number {
  const v = ctx.params[id]?.[key];
  return typeof v === 'number' ? v : def;
}

const dirName = (rec: DocRecord) => (rec.biz === 'receipt' ? '收款单' : rec.biz === 'payment' ? '付款单' : '进口结算单');

export const RULES: RuleDef[] = [
  /* ============ 类别编码与用途说明 / 交易对方 ============ */
  {
    id: 'R101',
    name: '类别编码与用途说明不匹配',
    major: 'codeRemark',
    engine: 'agent',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '类别编码应与用途说明描述的交易性质一致：货物使用 1 字头编码，服务使用 2 字头编码；运输、保险等服务需区分运输方式及出口 / 进口 / 第三国货物。',
    basis: '《资金收付管理制度》类别编码与用途说明填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.10.1–4.10.x', title: '类别编码与用途说明不符（按类别逐项核查）' }, { doc: 'manual', no: '2', title: '货物类单据填写原则' }, { doc: 'manual', no: '3.1', title: '运费单据填写示例' }, { doc: 'manual', no: '5.2', title: '软件与信息技术服务填写示例' }],
    logic: `FOR EACH 明细行 IN [ (类别编码1, 用途说明1), (类别编码2, 用途说明2) ]
  core    := AGENT.preprocess(用途说明)      -- 去除项目标注 / 关联方前缀 / “（含…）”说明
  topics  := AGENT.extract_topics(core)     -- 抽取交易主题
  head    := LAST_BY_POSITION(topics)       -- 中文表述中心语在末尾
  expect  := head.expected_codes(收付方向)
  IF 类别编码 NOT IN expect
     THEN 疑点("类别编码与用途说明不匹配", 建议 = expect[0], 置信度 = AGENT.confidence)`,
    ...INIT,
    check: (rec, _ctx, trace) => judgeCodeRemark(rec, trace),
  },
  {
    id: 'R102',
    name: '用途说明表述笼统',
    major: 'codeRemark',
    engine: 'agent',
    level: 'error',
    rigid: false,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '用途说明应准确、完整说明交易性质：货物写明贸易方式与商品名称，服务写明具体服务内容；仅填写“货款”“服务费”“费用”等不符合要求。',
    basis: '集团单据抽查常见问题“用途说明不规范”（示意）',
    refs: [{ doc: 'policy', no: '4.10.2', title: '用途说明等于类别名称' }, { doc: 'policy', no: '4.10.4', title: '用途说明为空或乱字符' }, { doc: 'manual', no: '6', title: '其他服务填写示例' }],
    logic: `FOR EACH 用途说明
  core := AGENT.preprocess(用途说明)
  IF core IN 笼统词表 OR (AGENT.extract_topics(core) = ∅ AND LEN(core) <= 4)
     THEN 疑点("用途说明表述笼统", 建议 = AGENT.rewrite_hint(类别编码))`,
    ...INIT,
    check: (rec, _ctx, trace) => judgeGenericRemark(rec, trace),
  },
  {
    id: 'R103',
    name: '关联方往来用途说明缺少规定前缀',
    major: 'counterparty',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '与集团内关联方之间的收付（往来类型 3），用途说明须以“收到关联方款项”（收款）或“向关联方支付款项”（付款）开头，便于合并报表抵销。',
    basis: '集团关联交易管理要求（示意）',
    refs: [{ doc: 'policy', no: '4.3.2', title: '关联方往来用途说明格式' }, { doc: 'manual', no: '1.4', title: '关联交易单据填写示例' }],
    logic: `WHEN 往来类型 = 3
  prefix := IF 单据种类 = 收款单 THEN "收到关联方款项" ELSE "向关联方支付款项"
  ASSERT CONTAINS(用途说明1, prefix) ELSE 疑点`,
    ...INIT,
    check: (rec, _ctx, trace) => {
      const prefix = rec.biz === 'receipt' ? '收到关联方款项' : '向关联方支付款项';
      return codeRule(rec, trace, 'R103', { 往来类型: rec.f.tradeType, 用途说明1: rec.f.remark1 }, `往来类型=3 ⇒ 用途说明含“${prefix}”`, () => {
        if (rec.f.tradeType !== '3') return null;
        return {
          fail: !rec.f.remark1.includes(prefix),
          message: `往来类型为 3（集团内关联方往来），用途说明未以“${prefix}”开头。`,
          suggestion: `用途说明修改为“${prefix}+原用途说明”`,
          fields: ['remark1', 'tradeType'],
        };
      });
    },
  },
  {
    id: 'R104',
    name: '专用类别编码用途说明不规范',
    major: 'codeRemark',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '专用编码须使用规定表述：810100 须体现“资金划转”，820100 须体现“保证金”或“押金”，830100 须体现“代收”或“代付”。',
    basis: '资金类往来单据填写口径（示意）',
    refs: [{ doc: 'policy', no: '4.5.1', title: '资金往来类编码的用途说明要求' }, { doc: 'manual', no: '8', title: '资金划转与代收代付填写示例' }],
    logic: `CASE 类别编码1
  WHEN 810100 ASSERT CONTAINS(用途说明, "资金划转")
  WHEN 820100 ASSERT MATCH(用途说明, /保证金|押金/)
  WHEN 830100 ASSERT MATCH(用途说明, /代收|代付/)`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R104', { 类别编码1: rec.f.code1, 用途说明1: rec.f.remark1 }, '专用编码 ⇒ 规定表述', () => {
        const map: Record<string, [RegExp, string]> = {
          '810100': [/资金划转/, '集团内资金划转'],
          '820100': [/保证金|押金/, 'XX 项目投标保证金 / 场地押金'],
          '830100': [/代收|代付/, '代收 / 代付 XX 款项'],
        };
        const m = map[rec.f.code1];
        if (!m) return null;
        return {
          fail: !m[0].test(rec.f.remark1),
          message: `类别编码 ${rec.f.code1} 为专用编码，用途说明应为“${m[1]}”。`,
          suggestion: `用途说明修改为“${m[1]}”`,
          fields: ['remark1'],
        };
      }),
  },
  {
    id: 'R105',
    name: '单据种类与用途说明方向不符',
    major: 'direction',
    engine: 'code',
    level: 'warn',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '收款单的用途说明不应描述付出（支出、付款、付出、预付等），付款单与进口结算单的用途说明不应描述收入（收入、收到、收款、回款、收回等）；货物类编码还要看“进口 / 出口”方向。款项性质为退款的除外。',
    basis: '《资金收付管理制度》4.1.1 收付方向与用途说明不符（疑问数据）',
    refs: [{ doc: 'policy', no: '4.1.1', title: '收款单与用途说明方向不符' }, { doc: 'policy', no: '4.1.2', title: '付款单与用途说明方向不符' }],
    logic: `UNLESS 款项性质 = 退款
  IF 单据种类 = 收款单 AND (用途说明 MATCH /支出|付款|付出|预付/
                          OR 类别编码 STARTS_WITH "1" AND 用途说明 MATCH /进口|到货付款/) THEN 疑问
  IF 单据种类 ∈ {付款单, 进口结算单} AND (用途说明 MATCH /收入|收到|收款|回款|收回/
                          OR 类别编码 STARTS_WITH "1" AND 用途说明 MATCH /出口/) THEN 疑问
  剔除：用途说明含“出口加工区”“接收机”“接收器”“收款机”`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R105', { 单据种类: dirName(rec), 类别编码1: rec.f.code1, 用途说明1: rec.f.remark1, 款项性质: rec.f.nature || '（空）' }, '收付方向 ⇔ 用途说明方向词', () => {
        if (!rec.f.remark1 || rec.f.nature === 'R') return null;
        const m = rec.f.remark1.replace(/出口加工区|接收机|接收器|收款机/g, '');
        const goods = rec.f.code1.startsWith('1');
        const word =
          rec.biz === 'receipt'
            ? m.match(/支出|付款|付出|预付/)?.[0] ?? (goods ? m.match(/进口|到货付款/)?.[0] : undefined)
            : m.match(/收入|收到|收款|回款|收回/)?.[0] ?? (goods ? m.match(/出口/)?.[0] : undefined);
        return {
          fail: !!word,
          warn: true,
          message: `${dirName(rec)}的用途说明含“${word}”，与单据的资金方向不符。`,
          suggestion: rec.biz === 'receipt' ? '核实是否应录为付款单，或修改用途说明' : '核实是否应录为收款单，或修改用途说明',
          fields: ['remark1'],
        };
      }),
  },

  /* ============ 完整性 / 账户 ============ */
  {
    id: 'R201',
    name: '类别编码或用途说明缺失',
    major: 'completeness',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '类别编码1、用途说明1 必须填写；填写了类别编码2 的，用途说明2 与明细金额2 须同时填写。境内往来收款单只登记基础信息的除外。',
    basis: '单据必填项要求（示意）',
    refs: [{ doc: 'policy', no: '3.1', title: '单据必填要素' }, { doc: 'guide', title: 'ERP 收付款单据录入指引' }],
    logic: `UNLESS 单据种类 = 收款单 AND 往来类型 = 4
  ASSERT NOT_EMPTY(类别编码1) AND NOT_EMPTY(用途说明1)
  IF NOT_EMPTY(类别编码2) ASSERT NOT_EMPTY(用途说明2) AND 明细金额2 > 0`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(
        rec,
        trace,
        'R201',
        { 类别编码1: rec.f.code1 || '（空）', 用途说明1: rec.f.remark1 || '（空）', 类别编码2: rec.f.code2 || '（空）' },
        'NOT_EMPTY(类别编码1, 用途说明1)',
        () => {
          if (rec.biz === 'receipt' && rec.f.tradeType === '4') return null;
          const miss: string[] = [];
          if (!rec.f.code1) miss.push('类别编码1');
          if (!rec.f.remark1) miss.push('用途说明1');
          if (rec.f.code2 && !rec.f.remark2) miss.push('用途说明2');
          if (rec.f.code2 && !(n0(rec.f.txAmt2) > 0)) miss.push('明细金额2');
          return {
            fail: miss.length > 0,
            message: `必填项缺失：${miss.join('、')}。`,
            suggestion: '补录缺失的单据要素',
            fields: miss.map((m) => ({ 类别编码1: 'code1', 用途说明1: 'remark1', 用途说明2: 'remark2', 明细金额2: 'txAmt2' })[m] as FieldKey),
          };
        },
      ),
  },
  {
    id: 'R202',
    name: '账号与金额不对应',
    major: 'amount',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '本币金额大于 0 时须填写本币账号；外币金额大于 0 时须填写外币账号；其他金额大于 0 时须填写其他账号。',
    basis: '单据资金来源 / 去向填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.4.4', title: '账号与金额不对应' }, { doc: 'manual', no: '9.2', title: '多账户入账填写示例' }],
    logic: `IF 本币金额 > 0 ASSERT NOT_EMPTY(本币账号)
IF 外币金额 > 0 ASSERT NOT_EMPTY(外币账号)
IF 其他金额 > 0 ASSERT NOT_EMPTY(其他账号)`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(
        rec,
        trace,
        'R202',
        {
          本币金额: rec.f.convAmt || '0',
          本币账号: rec.f.cnyAcct || '（空）',
          外币金额: rec.f.fxAmt || '0',
          外币账号: rec.f.fxAcct || '（空）',
          其他金额: rec.f.otherAmt || '0',
          其他账号: rec.f.otherAcct || '（空）',
        },
        '金额>0 ⇒ 对应账号非空',
        () => {
          const miss: [string, FieldKey][] = [];
          if (n0(rec.f.convAmt) > 0 && !rec.f.cnyAcct) miss.push(['本币账号', 'cnyAcct']);
          if (n0(rec.f.fxAmt) > 0 && !rec.f.fxAcct) miss.push(['外币账号', 'fxAcct']);
          if (n0(rec.f.otherAmt) > 0 && !rec.f.otherAcct) miss.push(['其他账号', 'otherAcct']);
          return {
            fail: miss.length > 0,
            message: `金额已填写但缺少${miss.map((m) => m[0]).join('、')}。`,
            suggestion: '补录对应账号',
            fields: miss.map((m) => m[1]),
          };
        },
      ),
  },
  {
    id: 'R203',
    name: '交易对方或国家/地区缺失',
    major: 'completeness',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '境外往来（往来类型 1、3）须填写交易对方名称及其所在国家/地区代码。',
    basis: '单据交易对方要素要求（示意）',
    refs: [{ doc: 'guide', title: '交易对方名称及国家/地区为必填要素' }],
    logic: `WHEN 往来类型 IN (1, 3)
  ASSERT NOT_EMPTY(交易对方) AND NOT_EMPTY(对方国家/地区)`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R203', { 交易对方: rec.f.counterparty || '（空）', 国家地区: rec.f.country || '（空）' }, '交易对方与国家/地区非空', () => {
        if (!OVERSEAS.includes(rec.f.tradeType)) return null;
        const miss = [!rec.f.counterparty && '交易对方', !rec.f.country && '对方国家/地区'].filter(Boolean) as string[];
        return { fail: miss.length > 0, message: `缺少${miss.join('、')}。`, suggestion: '补录交易对方信息', fields: ['counterparty', 'country'] };
      }),
  },
  {
    id: 'R204',
    name: '到货付款未填写发票号',
    major: 'completeness',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: ['payment', 'settlement'],
    owner: OWNER_T1,
    desc: '货物类到货付款，应填写发票号，便于三单匹配（合同、发票、入库单）与事后追溯。',
    basis: '集团财务共享中心单据质量管理要求（示意）',
    refs: [{ doc: 'local', title: '集团财务共享中心单据质量管理要求（示意）' }],
    logic: `WHEN 类别编码1 STARTS_WITH "1" AND 款项性质 = P
  ASSERT NOT_EMPTY(发票号) ELSE 提示`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R204', { 类别编码1: rec.f.code1, 款项性质: rec.f.nature, 发票号: rec.f.invoiceNo || '（空）' }, '货物类 ∧ 到货付款 ⇒ 发票号非空', () => {
        if (!(rec.f.code1.startsWith('1') && rec.f.nature === 'P')) return null;
        return { fail: !rec.f.invoiceNo, warn: true, message: '到货付款未填写发票号。', suggestion: '补录发票号', fields: ['invoiceNo'] };
      }),
  },

  /* ============ 币种、金额及账户 ============ */
  {
    id: 'R301',
    name: '明细金额合计与单据金额不一致',
    major: 'amount',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '明细金额1 与明细金额2 之和应等于单据金额（收款单允许等于收款金额 + 对方手续费）。差额小于 1 的多为录入时将金额取整。',
    basis: '单据金额勾稽关系（示意）',
    refs: [{ doc: 'policy', no: '4.4.2', title: '明细金额与单据金额不平衡' }, { doc: 'manual', no: '9.1', title: '币种和金额填写原则' }],
    logic: `sum := 明细金额1 + 明细金额2
ASSERT ABS(sum - 单据金额) < 0.01
   OR (单据种类 = 收款单 AND ABS(sum - (收款金额 + 对方手续费)) < 0.01)
ON FAIL => 疑点(IF ABS(差额) < 1 THEN "疑似取整" ELSE "金额不一致")`,
    ...INIT,
    check: (rec, _ctx, trace) => {
      const amt = n0(rec.f.amount);
      const sum = n0(rec.f.txAmt1) + n0(rec.f.txAmt2);
      const ffee = n0(rec.f.feeForAmt);
      return codeRule(
        rec,
        trace,
        'R301',
        { 单据金额: fmtAmt(amt), 明细金额1: rec.f.txAmt1 || '（空）', 明细金额2: rec.f.txAmt2 || '（空）', ...(rec.biz === 'receipt' ? { 对方手续费: fmtAmt(ffee) } : {}) },
        '|明细金额合计 − 单据金额| < 0.01',
        () => {
          if (num(rec.f.txAmt1) === null && num(rec.f.txAmt2) === null) return null;
          if (rec.biz === 'receipt' && rec.f.tradeType === '4' && sum === 0) return null;
          const ok = Math.abs(sum - amt) < 0.01 || (rec.biz === 'receipt' && Math.abs(sum - amt - ffee) < 0.01);
          const diff = Math.round((sum - amt) * 100) / 100;
          const rounding = Math.abs(diff) < 1;
          return {
            fail: !ok,
            calc: `${fmtAmt(sum)} − ${fmtAmt(amt)} = ${fmtAmt(diff)}`,
            message: `明细金额合计 ${fmtAmt(sum)} 与${rec.biz === 'receipt' ? '收款' : rec.biz === 'payment' ? '付款' : '结算'}金额 ${fmtAmt(amt)} 相差 ${fmtAmt(diff)}${rounding ? '（疑似将金额取整录入）' : ''}。`,
            suggestion: rounding ? `明细金额按实际金额 ${fmtAmt(amt)} 填写，不取整` : '核对明细金额拆分',
            fields: ['txAmt1', 'txAmt2', 'amount'],
          };
        },
      );
    },
  },
  {
    id: 'R302',
    name: '资金构成与单据金额不平衡',
    major: 'amount',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '收款单：收款金额 = 本币入账 + 外币入账 + 其他入账 + 我方手续费；付款单与进口结算单：单据金额 = 本币支付 + 外币支付 + 其他支付。',
    basis: '单据金额勾稽关系（示意）',
    refs: [{ doc: 'policy', no: '4.4.3', title: '资金构成不平衡' }, { doc: 'manual', no: '9.1', title: '币种和金额填写原则' }],
    logic: `IF 单据种类 = 收款单
  ASSERT 收款金额 = 本币入账 + 外币入账 + 其他入账 + 我方手续费
ELSE
  ASSERT 单据金额 = 本币支付 + 外币支付 + 其他支付`,
    ...INIT,
    check: (rec, _ctx, trace) => {
      const amt = n0(rec.f.amount);
      const parts = n0(rec.f.convAmt) + n0(rec.f.fxAmt) + n0(rec.f.otherAmt) + (rec.biz === 'receipt' ? n0(rec.f.feeDomAmt) : 0);
      return codeRule(
        rec,
        trace,
        'R302',
        {
          单据金额: fmtAmt(amt),
          本币金额: rec.f.convAmt || '0',
          外币金额: rec.f.fxAmt || '0',
          其他金额: rec.f.otherAmt || '0',
          ...(rec.biz === 'receipt' ? { 我方手续费: rec.f.feeDomAmt || '0' } : {}),
        },
        rec.biz === 'receipt' ? '收款金额 = 本币 + 外币 + 其他 + 我方手续费' : '单据金额 = 本币 + 外币 + 其他',
        () => {
          if (num(rec.f.amount) === null) return null;
          const diff = Math.round((amt - parts) * 100) / 100;
          return {
            fail: Math.abs(diff) >= 0.01,
            calc: `${fmtAmt(amt)} − ${fmtAmt(parts)} = ${fmtAmt(diff)}`,
            message: `资金构成合计 ${fmtAmt(parts)} 与金额 ${fmtAmt(amt)} 相差 ${fmtAmt(diff)}${rec.biz === 'receipt' && diff > 0 ? '（可能漏填我方手续费）' : ''}。`,
            suggestion: rec.biz === 'receipt' && diff > 0 ? '核对是否存在未录入的手续费' : '核对资金构成',
            fields: ['amount', 'convAmt', 'fxAmt', 'otherAmt', 'feeDomAmt'],
          };
        },
      );
    },
  },
  {
    id: 'R303',
    name: '实付金额与扣费不符',
    major: 'amount',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: ['settlement'],
    owner: OWNER_T1,
    desc: '进口结算单：同币种时，实付金额应等于结算金额 − 扣费金额（扣费从款项中扣收），或等于结算金额（扣费另收）；两者都不符时为疑点。',
    basis: '进口结算单金额勾稽（示意）',
    refs: [{ doc: 'policy', no: '4.4.5', title: '实付金额与扣费不平衡' }, { doc: 'manual', no: '9.1', title: '币种和金额填写原则' }],
    logic: `WHEN 实付币种 = 结算币种 AND 扣费币种 = 结算币种
  ASSERT 实付金额 = 结算金额 - 扣费金额   -- 扣费从款项中扣收
      OR 实付金额 = 结算金额              -- 扣费另收`,
    ...INIT,
    check: (rec, _ctx, trace) => {
      const amt = n0(rec.f.amount);
      const fee = n0(rec.f.feeDomAmt);
      const act = num(rec.f.actualAmt);
      return codeRule(rec, trace, 'R303', { 结算金额: fmtAmt(amt), 扣费金额: fmtAmt(fee), 实付金额: fmtAmt(act) }, '实付 = 结算 − 扣费', () => {
        if (act === null || rec.f.actualCur !== rec.f.currency || (rec.f.feeDomCur && rec.f.feeDomCur !== rec.f.currency)) return null;
        const diff = Math.round((amt - fee - act) * 100) / 100;
        // “扣费另收、实付金额 = 结算金额”也是常见口径，两种都视为合理
        const sameAsAmount = Math.abs(act - amt) < 0.01;
        return {
          fail: Math.abs(diff) >= 0.01 && !sameAsAmount,
          calc: `${fmtAmt(amt)} − ${fmtAmt(fee)} − ${fmtAmt(act)} = ${fmtAmt(diff)}`,
          message: `实付金额 ${fmtAmt(act)} ≠ 结算金额 ${fmtAmt(amt)} − 扣费 ${fmtAmt(fee)}。`,
          suggestion: '核对扣费金额或实付金额',
          fields: ['actualAmt', 'feeDomAmt', 'amount'],
        };
      });
    },
  },
  {
    id: 'R304',
    name: '明细币种与单据币种不一致',
    major: 'amount',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: [...BIZ_ALL],
    owner: OWNER_T1,
    desc: '明细币种通常应与单据币种一致，不一致时提示人工确认。',
    basis: '单据币种填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.4.6', title: '币种填写疑问' }, { doc: 'manual', no: '9.1', title: '币种和金额填写原则' }],
    logic: `IF NOT_EMPTY(明细币种1) ASSERT 明细币种1 = 单据币种 ELSE 提示`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R304', { 单据币种: rec.f.currency, 明细币种1: rec.f.txCur1 || '（空）' }, '明细币种1 = 单据币种', () => {
        if (!rec.f.txCur1 || !rec.f.currency) return null;
        return {
          fail: rec.f.txCur1 !== rec.f.currency,
          warn: true,
          message: `明细币种 ${rec.f.txCur1} 与单据币种 ${rec.f.currency} 不一致。`,
          suggestion: '核实明细币种',
          fields: ['txCur1', 'currency'],
        };
      }),
  },

  /* ============ 国家/地区（含同一批次同一交易对方国家/地区唯一） ============ */
  {
    id: 'R401',
    name: '境外往来国家/地区不应为中国',
    major: 'country',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '与境外客商或境外关联方的往来（往来类型 1、3），对方国家/地区不应填写为中国（CHN）。',
    basis: '对方国家/地区填写口径（示意）',
    refs: [{ doc: 'policy', no: '4.2.1', title: '境外往来国家/地区填为中国' }, { doc: 'manual', no: '9.3', title: '国家/地区填写原则' }],
    logic: `WHEN 往来类型 IN (1, 3) ASSERT 对方国家/地区 <> "CHN"`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R401', { 往来类型: rec.f.tradeType, 国家地区: rec.f.country || '（空）', 交易对方: rec.f.counterparty }, '往来类型∈{1,3} ⇒ 国家/地区≠CHN', () => {
        if (!OVERSEAS.includes(rec.f.tradeType)) return null;
        return {
          fail: rec.f.country === 'CHN',
          message: '境外交易对方的国家/地区填写为中国（CHN）。',
          suggestion: '按交易对方实际所在国家/地区填写',
          fields: ['country'],
        };
      }),
  },
  {
    id: 'R402',
    name: '境内往来国家/地区应为中国',
    major: 'country',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: [...BIZ_ALL],
    owner: OWNER_T1,
    desc: '境内往来（往来类型 4）的交易对方为境内单位，国家/地区如填写应为中国（CHN）。',
    basis: '境内往来单据填写口径（示意）',
    refs: [{ doc: 'manual', no: '9.3', title: '国家/地区填写原则' }],
    logic: `WHEN 往来类型 = 4 AND NOT_EMPTY(对方国家/地区) ASSERT 对方国家/地区 = "CHN"`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R402', { 往来类型: rec.f.tradeType, 国家地区: rec.f.country || '（空）' }, '往来类型=4 ⇒ 国家/地区=CHN', () => {
        if (rec.f.tradeType !== '4' || !rec.f.country) return null;
        return { fail: rec.f.country !== 'CHN', warn: true, message: `境内往来的国家/地区填写为 ${countryLabel(rec.f.country)}。`, suggestion: '核实是否应为境外往来', fields: ['country', 'tradeType'] };
      }),
  },
  {
    id: 'R403',
    name: '国家/地区与交易对方地址不一致',
    major: 'country',
    engine: 'agent',
    level: 'error',
    rigid: false,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '从交易对方名称及地址中识别国别线索（地名、国别代码、法律形式后缀），与填报的国家/地区比对。地址给出明确国别且不一致的为疑点；仅有法律形式等弱线索的提示人工确认。',
    basis: '对方国家/地区应为交易对方实际所在地（示意）',
    refs: [{ doc: 'policy', no: '4.2.3.3', title: '国家/地区与交易对方名称所含信息不符' }, { doc: 'policy', no: '4.2.3.4', title: '国家/地区与交易对方国家缩写不符' }, { doc: 'manual', no: '9.3', title: '国家/地区填写原则' }],
    logic: `hints := AGENT.parse_counterparty(交易对方)
IF hints.strong ≠ ∅ AND 填报国家/地区 NOT IN hints.strong THEN 疑点
ELSE IF hints.strong = ∅ AND hints.weak ≠ ∅ AND 填报国家/地区 NOT IN hints.weak THEN 提示(需人工确认)`,
    ...INIT,
    check: (rec, _ctx, trace) => judgeCountryAddress(rec, trace),
  },

  {
    id: 'R405',
    name: '同一批次同一交易对方国家/地区不唯一',
    major: 'country',
    engine: 'hybrid',
    level: 'warn',
    rigid: true,
    batchLevel: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '同一批次内（收款单、付款单、进口结算单三类合并），名称完全相同的境外交易对方对应的国家/地区应唯一。多数国别以外的记录标为疑问数据，笔数相同时全部提示；跨境电商、支付平台按站点在多国收付，由智能体复核后排除。',
    basis: '《资金收付管理制度》4.2.3.1 交易对方相同但国家/地区不同（三类单据合并核查）',
    refs: [{ doc: 'policy', no: '4.2.3.1', title: '交易对方相同但国家/地区不同（三类单据合并核查）' }, { doc: 'manual', no: '9.3', title: '国家/地区填写原则' }],
    logic: `batch := 本次上传的三类单据合并（往来类型 1/3，国家/地区非空且不为 CHN / ZZZ）
dist  := COUNT_BY(batch WHERE 交易对方 = 本笔交易对方, 国家/地区)
IF |dist| > 1
   IF AGENT.is_platform(交易对方)   THEN 排除（平台按站点多国收付）
   ELSE IF 本笔国别 ≠ MAJORITY(dist) THEN 疑问(建议 = MAJORITY(dist))
   ELSE IF MAJORITY 平局          THEN 疑问(需人工确认)`,
    ...INIT,
    check: (rec, ctx, trace) => judgeBatchExact(rec, ctx.batch, trace),
  },
  {
    id: 'R406',
    name: '名称相近的交易对方国家/地区不一致',
    major: 'country',
    engine: 'agent',
    level: 'warn',
    rigid: false,
    batchLevel: true,
    biz: [...BIZ_ALL],
    owner: OWNER_T1,
    desc: '同一批次内交易对方名称写法不同（大小写、标点、地址、单复数差异），清洗后为同一主体但国家/地区不一致。智能体负责否决误合并：含地区限定词（如 VIETNAM、MALAYSIA）的通常是集团在当地的子公司，属于不同主体。',
    basis: '《资金收付管理制度》4.2.3.1 的延伸：同一交易对方不同写法同样应国家/地区唯一',
    refs: [{ doc: 'policy', no: '4.2.3.1', title: '交易对方相同但国家/地区不同（延伸至写法差异）' }, { doc: 'manual', no: '9.3', title: '国家/地区填写原则' }],
    params: [{ key: 'sim', label: '相似度阈值', value: 0.85 }],
    logic: `cleaned := CLEAN_NAME(交易对方)       -- 截地址、大写、去标点与法律形式后缀
group   := CLUSTER(batch.cleaned, SIMILARITY >= {sim})
           WITH AGENT.veto(含地区限定词 → 子公司，不合并)
IF |COUNTRIES(group)| > 1 AND 本笔国别 ≠ MAJORITY(group) THEN 疑问(建议 = MAJORITY(group))`,
    ...INIT,
    check: (rec, ctx, trace) => judgeBatchSimilar(rec, ctx.batch, trace),
  },
  {
    id: 'R407',
    name: '交易对方国家/地区为“ZZZ”',
    major: 'country',
    engine: 'code',
    level: 'warn',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '交易对方国家/地区填写为未分类代码 ZZZ 的，提示核实交易对方实际所在国家/地区。',
    basis: '《资金收付管理制度》4.2.5 国家/地区为“ZZZ”（疑问数据）',
    refs: [{ doc: 'policy', no: '4.2.5', title: '交易对方国家/地区为“ZZZ”' }],
    logic: `ASSERT 对方国家/地区 <> "ZZZ" ELSE 疑问`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R407', { 交易对方: rec.f.counterparty || '（空）', 国家地区: rec.f.country || '（空）' }, '国家/地区 ≠ ZZZ', () => {
        if (!rec.f.country) return null;
        return { fail: rec.f.country === 'ZZZ', warn: true, message: '交易对方国家/地区填写为未分类代码 ZZZ。', suggestion: '查询客商主数据，核实交易对方实际所在国家/地区后填写', fields: ['country'] };
      }),
  },

  /* ============ 往来类型 / 款项性质 / 审批与合同 ============ */
  {
    id: 'R501',
    name: '往来类型与交易对方不符',
    major: 'subject',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '交易对方在集团关联方名单内的，往来类型应为 3（集团内关联方往来）；往来类型为 3 的，交易对方应在关联方名单内。',
    basis: '集团关联方名单与往来类型口径（示意）',
    refs: [{ doc: 'policy', no: '4.5.6', title: '往来类型与交易对方不符' }, { doc: 'manual', no: '1.4', title: '关联交易单据填写示例' }],
    logic: `related := IN_LIST(交易对方, 集团关联方名单)
CASE 往来类型
  WHEN 1 ASSERT NOT related
  WHEN 3 ASSERT related`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R501', { 往来类型: rec.f.tradeType, 交易对方: rec.f.counterparty || '（空）', 是否关联方: isRelatedParty(rec.f.counterparty) ? '是' : '否' }, '往来类型 ↔ 关联方名单', () => {
        const t = rec.f.tradeType;
        if (!OVERSEAS.includes(t) || !rec.f.counterparty) return null;
        const related = isRelatedParty(rec.f.counterparty);
        return {
          fail: (t === '3') !== related,
          message: related ? `交易对方在集团关联方名单内，但往来类型为 ${t}，应为 3。` : '往来类型为 3（集团内关联方往来），但交易对方不在关联方名单内。',
          suggestion: related ? '将往来类型改为 3，并按关联方往来格式填写用途说明' : '核实交易对方是否为集团关联方；如否，将往来类型改为 1',
          fields: ['tradeType', 'counterparty'],
        };
      }),
  },
  {
    id: 'R502',
    name: '收款性质与用途说明不一致',
    major: 'payType',
    engine: 'hybrid',
    level: 'error',
    rigid: true,
    biz: ['receipt'],
    owner: OWNER_HQ,
    desc: '款项性质选择“预收款”的，用途说明须体现预收；用途说明写明预收的，性质应选“预收款”；退款须选择“退款”。',
    basis: '收款单款项性质填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.7.1.4', title: '预收 / 预付款用途说明不含预收 / 预付字样' }, { doc: 'policy', no: '4.7.1.5', title: '用途说明含预收 / 预付字样但性质不为预收 / 预付' }],
    logic: `pre := KEYWORD(用途说明, "预收")      -- 规则预筛
IF (款项性质 = A) XOR pre  OR  (款项性质 = R) XOR KEYWORD(用途说明, "退款")
   THEN AGENT.confirm_semantics(用途说明)  -- 排除否定、转述等误报
        => 疑点`,
    ...INIT,
    check: (rec, _ctx, trace) => judgeNature(rec, trace),
  },
  {
    id: 'R503',
    name: '付款性质与用途说明不一致',
    major: 'payType',
    engine: 'hybrid',
    level: 'error',
    rigid: true,
    biz: ['payment', 'settlement'],
    owner: OWNER_HQ,
    desc: '款项性质（预付款 / 到货付款 / 退款 / 其他）应与用途说明一致：预付须体现“预付”，用途说明写“到货”的不应选预付，退款须选“退款”。',
    basis: '付款单 / 进口结算单款项性质填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.7.1.4', title: '预收 / 预付款用途说明不含预收 / 预付字样' }, { doc: 'policy', no: '4.7.2.1', title: '到货付款但类别编码不为货物类' }],
    logic: `pre := KEYWORD(用途说明, "预付"); arr := KEYWORD(用途说明, "到货")
IF (款项性质 = A) XOR pre OR (款项性质 = A AND arr) OR (款项性质 = R) XOR KEYWORD(用途说明, "退款|退回")
   THEN AGENT.confirm_semantics(用途说明) => 疑点`,
    ...INIT,
    check: (rec, _ctx, trace) => judgeNature(rec, trace),
  },
  {
    id: 'R504',
    name: '退款未注明原单据编号',
    major: 'payType',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: [...BIZ_ALL],
    owner: OWNER_HQ,
    desc: '退款业务须在用途说明中注明原单据编号（20 位，如 SK110102202609180002），便于与原业务勾稽冲销。',
    basis: '退款单据填写要求（示意）',
    refs: [{ doc: 'policy', no: '4.7.1.2', title: '退款未填写原单据编号' }, { doc: 'manual', no: '7', title: '退款和错付款填写示例' }],
    logic: `WHEN 款项性质 = R ASSERT MATCH(用途说明, /(SK|FK|JS)\\d{18}/)`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R504', { 款项性质: rec.f.nature, 用途说明1: rec.f.remark1 }, '性质=R ⇒ 用途说明含 20 位原单据编号', () => {
        if (rec.f.nature !== 'R') return null;
        return {
          fail: !DOC_NO_RE.test(`${rec.f.remark1}${rec.f.remark2}`),
          message: '退款业务用途说明未注明原单据编号。',
          suggestion: '用途说明补充“原单据编号XXXXXXXXXXXXXXXXXXXX”',
          fields: ['remark1', 'nature'],
        };
      }),
  },
  {
    id: 'R505',
    name: '大额付款缺少审批单号',
    major: 'approval',
    engine: 'code',
    level: 'error',
    rigid: true,
    biz: ['payment', 'settlement'],
    owner: OWNER_HQ,
    desc: '单笔折美元金额达到授权门槛（默认 10 万美元）的付款，须填写 OA 审批单号，证明已按授权审批。',
    basis: '《资金收付管理制度》第五章 授权审批（示意）',
    refs: [{ doc: 'policy', no: '5.2', title: '大额付款授权审批' }],
    params: [{ key: 'threshold', label: '授权门槛', value: 100000, unit: '美元' }],
    logic: `WHEN 折美元金额 >= {threshold}
  ASSERT MATCH(审批单号, /^OA-\\d{4}-\\d{5}$/) ELSE 疑点`,
    ...INIT,
    check: (rec, ctx, trace) => {
      const th = p(ctx, 'R505', 'threshold', 100000);
      const usd = n0(rec.f.usdAmt) || n0(rec.f.amount);
      return codeRule(rec, trace, 'R505', { 折美元金额: fmtAmt(usd), 审批单号: rec.f.approvalNo || '（空）' }, `折美元 ≥ ${fmtAmt(th)} ⇒ 审批单号有效`, () => {
        if (usd < th) return null;
        return {
          fail: !/^OA-\d{4}-\d{5}$/.test(rec.f.approvalNo),
          calc: `折美元 ${fmtAmt(usd)} ≥ ${fmtAmt(th)}`,
          message: `付款折美元 ${fmtAmt(usd)}，达到授权门槛，但${rec.f.approvalNo ? `审批单号“${rec.f.approvalNo}”格式无效` : '未填写审批单号'}。`,
          suggestion: '补录 OA 审批单号；未审批的应先走审批流程',
          fields: ['approvalNo', 'amount'],
        };
      });
    },
  },
  {
    id: 'R506',
    name: '到货付款但尚未交货',
    major: 'payType',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: ['payment', 'settlement'],
    owner: OWNER_T1,
    desc: '款项性质为“到货付款”，但最迟交货日期晚于单据日期，说明货物尚未交付，实质为预付。',
    basis: '应付账款与预付账款口径（示意）',
    refs: [{ doc: 'policy', no: '4.7.2.1', title: '款项性质与交货日期不符' }, { doc: 'manual', no: '4', title: '预付与到货付款填写示例' }],
    logic: `WHEN 款项性质 = P AND NOT_EMPTY(最迟交货日期)
  ASSERT 最迟交货日期 <= 单据日期 ELSE 疑点("疑似应为预付款")`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R506', { 款项性质: rec.f.nature, 最迟交货日期: fmtDate8(rec.f.latestShipDate) || '（空）', 单据日期: fmtDate8(rec.f.docDate) }, '款项性质=P ⇒ 最迟交货日期 ≤ 单据日期', () => {
        if (rec.f.nature !== 'P' || !rec.f.latestShipDate) return null;
        return {
          fail: rec.f.latestShipDate > rec.f.docDate,
          message: `到货付款，但最迟交货日期 ${fmtDate8(rec.f.latestShipDate)} 晚于单据日期 ${fmtDate8(rec.f.docDate)}。`,
          suggestion: '核实货物是否已交付；未交付的应按预付款处理',
          fields: ['nature', 'latestShipDate'],
        };
      }),
  },
  {
    id: 'R507',
    name: '信用证项下款项性质为预付',
    major: 'payType',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: ['settlement'],
    owner: OWNER_T1,
    desc: '信用证项下付款一般凭单付款，款项性质为“预付款”的提示人工确认（如预付款信用证等特殊情形）。',
    basis: '进口结算单填写口径（示意）',
    refs: [{ doc: 'manual', no: '4.3', title: '信用证结算填写示例' }],
    logic: `IF 结算方式 = L AND 款项性质 = A THEN 提示`,
    ...INIT,
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R507', { 结算方式: rec.f.settle, 款项性质: rec.f.nature }, '结算方式=L ∧ 款项性质=A', () => ({
        fail: rec.f.settle === 'L' && rec.f.nature === 'A',
        warn: true,
        message: '信用证项下款项性质为预付款。',
        suggestion: '核实是否为预付款信用证',
        fields: ['settle', 'nature'],
      })),
  },

  /* ============ 及时性 ============ */
  {
    id: 'R601',
    name: '收款单录入超过规定时限',
    major: 'timeliness',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: ['receipt'],
    owner: OWNER_HQ,
    desc: '收款应在到账后规定工作日内完成收款单录入与认领。原型从银行流水号推断到账日期（BK+YYMMDD 格式）。',
    basis: '收款认领时限要求（示意）',
    refs: [{ doc: 'policy', no: '2.1', title: '收款逾期未认领' }],
    params: [{ key: 'days', label: '录入时限', value: 5, unit: '个工作日' }],
    logic: `到账日期 := PARSE_DATE(银行流水号[3..8])   -- BK + YYMMDD
ASSERT WORKDAYS(到账日期, 单据日期) <= {days}`,
    ...INIT,
    check: (rec, ctx, trace) => {
      const days = p(ctx, 'R601', 'days', 5);
      const vd = inferValueDate(rec.f.bankRef);
      return codeRule(rec, trace, 'R601', { 银行流水号: rec.f.bankRef, 推断到账日期: vd ? fmtDate8(vd) : '无法推断', 单据日期: fmtDate8(rec.f.docDate) }, `工作日(到账日期 → 单据日期) ≤ ${days}`, () => {
        const a = vd ? date8ToDate(vd) : null;
        const b = date8ToDate(rec.f.docDate);
        if (!a || !b) return null;
        const w = workdaysBetween(a, b);
        return {
          fail: w > days,
          calc: `到账 ${fmtDate8(vd!)} → 录入 ${fmtDate8(rec.f.docDate)}，间隔 ${w} 个工作日`,
          message: `到账日期 ${fmtDate8(vd!)}，单据日期 ${fmtDate8(rec.f.docDate)}，间隔 ${w} 个工作日，超过 ${days} 个工作日时限。`,
          suggestion: '核实迟录原因并留存说明',
          fields: ['docDate', 'bankRef'],
        };
      });
    },
  },

  /* ============ 区域自定（华东区域规则库示例） ============ */
  {
    id: 'R701',
    name: '跨境电商收款未注明平台',
    major: 'codeRemark',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: ['receipt'],
    owner: OWNER_LOCAL,
    desc: '华东区域要求：跨境电商货物（120200）收款的用途说明须注明销售平台名称（如亚马逊、速卖通、独立站等），便于按平台对账。',
    basis: '华东区域财务中心管理要求（示意）',
    refs: [{ doc: 'policy', no: '4.10.14', title: '类别编码与用途说明不符（120200 跨境电商）' }, { doc: 'manual', no: '2.6', title: '跨境电商单据填写示例' }, { doc: 'local', title: '华东区域财务中心要求（示意）' }],
    logic: `WHEN 类别编码1 = 120200
  ASSERT MATCH(用途说明, 平台名称词表) ELSE 疑点`,
    version: 'v1.1',
    updatedAt: '2026-10-09 15:40',
    updatedBy: '陈立衡（F0010912）',
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R701', { 类别编码1: rec.f.code1, 用途说明1: rec.f.remark1 }, '120200 ⇒ 用途说明含平台名称', () => {
        if (rec.f.code1 !== '120200') return null;
        return { fail: !PLATFORM_RE.test(rec.f.remark1), message: '跨境电商收款用途说明未注明销售平台。', suggestion: '用途说明补充平台名称，如“跨境电商平台亚马逊服装货款”', fields: ['remark1'] };
      }),
  },
  {
    id: 'R702',
    name: '战略项目单据用途说明未标注',
    major: 'codeRemark',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: [...BIZ_ALL],
    owner: OWNER_LOCAL,
    desc: '华东区域要求：列入战略项目名单的子公司办理的货物类收付，用途说明须以“战略项目：”开头，便于项目成本归集。名单由区域维护。',
    basis: '华东区域财务中心管理要求（示意）',
    refs: [{ doc: 'local', title: '华东区域财务中心要求（示意）' }],
    params: [{ key: 'list', label: '战略项目名单', value: '6 家（区域维护）' }],
    logic: `WHEN 本方主体代码 IN 战略项目名单 AND 类别编码1 STARTS_WITH "1"
  ASSERT CONTAINS(用途说明1, "战略项目") ELSE 疑点`,
    version: 'v1.0',
    updatedAt: '2026-09-30 09:05',
    updatedBy: '陈立衡（F0010912）',
    check: (rec, ctx, trace) =>
      codeRule(rec, trace, 'R702', { 本方主体代码: rec.f.entityCode, 是否战略项目: ctx.projectEntities.has(rec.f.entityCode) ? '是' : '否', 用途说明1: rec.f.remark1 }, '战略项目主体 ∧ 货物类 ⇒ 用途说明含“战略项目”', () => {
        if (!ctx.projectEntities.has(rec.f.entityCode) || !rec.f.code1.startsWith('1')) return null;
        return { fail: !rec.f.remark1.includes('战略项目'), message: '战略项目主体的货物类单据，用途说明未标注“战略项目”。', suggestion: '用途说明前补充“战略项目：”', fields: ['remark1'] };
      }),
  },
  {
    id: 'R705',
    name: '付款退回用途说明未注明“退回”',
    major: 'payType',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: ['payment'],
    owner: OWNER_LOCAL,
    desc: '华东区域要求：付款单项下的退款（款项性质 R），用途说明统一使用“退回”字样，便于与收款类退款区分。',
    basis: '华东区域财务中心管理要求（示意）',
    refs: [{ doc: 'policy', no: '4.7.1.1', title: '款项性质为退款但用途说明不含“退”字样' }, { doc: 'local', title: '华东区域财务中心要求（示意）' }],
    logic: `WHEN 款项性质 = R ASSERT CONTAINS(用途说明, "退回") ELSE 提示`,
    version: 'v1.0',
    updatedAt: '2026-10-11 11:31',
    updatedBy: '陈立衡（F0010912）',
    check: (rec, _ctx, trace) =>
      codeRule(rec, trace, 'R705', { 款项性质: rec.f.nature, 用途说明1: rec.f.remark1 }, '款项性质=R ⇒ 用途说明含“退回”', () => {
        if (rec.f.nature !== 'R') return null;
        return { fail: !rec.f.remark1.includes('退回'), warn: true, message: '付款退款业务用途说明未使用“退回”字样。', suggestion: '用途说明以“退回”开头并注明原单据编号', fields: ['remark1'] };
      }),
  },
];

export const RULE_MAP = new Map(RULES.map((r) => [r.id, r]));

