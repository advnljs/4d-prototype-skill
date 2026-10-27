/**
 * 智能体语义判断（模拟）。
 * 每个 judge 返回结论；trace=true 时同时返回“期望大模型产生的”推理轨迹：
 * 感知（读取要素）→ 工具调用（编码字典、主题抽取、批次索引）→ 检索（制度条款、历史判例）→ 推理 → 结论 → 自检。
 * 结论由确定性启发式给出，推理文本按真实业务口径撰写，便于和业务讨论“智能体应该怎么想”。
 */
import { codeFamily, codeGroup, codeInfo, codeLabel } from '@/domain/codes';
import { COUNTRIES, ISO2, LEGAL_FORM_HINTS, PLACE_HINTS, countryLabel } from '@/domain/countries';
import { NATURE_LABEL, type DocRecord, type FieldKey } from '@/domain/docs';
import { cleanName } from '@/domain/names';
import { countable, countsOf, majorityOf, normName, type BatchIndex } from '@/agent/batchCountry';
import { hash } from '@/lib/format';
import {
  REFUND_RE,
  extractTopics,
  isGenericRemark,
  preprocessRemark,
  primaryTopic,
  timingOnly,
  type Direction,
} from '@/agent/semantic';
import type { Judgement, StepKind, TraceStep } from './types';

/* ---------------- 轨迹构造 ---------------- */

function cost(seed: string, kind: StepKind): { ms: number; tokens?: number } {
  const r = (hash(seed + kind) % 1000) / 1000;
  switch (kind) {
    case 'perceive':
      return { ms: 2 + Math.round(r * 4) };
    case 'tool':
      return { ms: 18 + Math.round(r * 40) };
    case 'retrieve':
      return { ms: 60 + Math.round(r * 80), tokens: 0 };
    case 'reason':
      return { ms: 900 + Math.round(r * 900), tokens: 320 + Math.round(r * 380) };
    case 'reflect':
      return { ms: 380 + Math.round(r * 300), tokens: 120 + Math.round(r * 120) };
    case 'cache':
      return { ms: 3 };
    default:
      return { ms: 1 };
  }
}

export class Tracer {
  steps: TraceStep[] = [];
  constructor(
    private on: boolean,
    private seed: string,
  ) {}
  add(kind: StepKind, title: string, text?: string, io?: Record<string, string>) {
    if (!this.on) return this;
    const c = cost(this.seed + title, kind);
    this.steps.push({
      kind,
      title,
      text,
      io: io ? Object.entries(io).map(([label, value]) => ({ label, value })) : undefined,
      ms: c.ms,
      tokens: c.tokens,
    });
    return this;
  }
  done(j: Omit<Judgement, 'steps'>): Judgement {
    if (this.on) {
      const tone = j.verdict === 'fail' ? '疑点' : j.verdict === 'warn' ? '需人工确认' : j.verdict === 'skip' ? '不适用' : '通过';
      this.add(
        'verdict',
        `结论：${tone}`,
        j.message,
        j.verdict === 'skip'
          ? undefined
          : {
              verdict: j.verdict,
              ...(j.confidence !== undefined ? { confidence: j.confidence.toFixed(2) } : {}),
              ...(j.suggestion ? { suggestion: j.suggestion } : {}),
            },
      );
      return { ...j, steps: this.steps };
    }
    return j;
  }
}

function dirOf(rec: DocRecord): Direction {
  return rec.biz === 'receipt' ? 'in' : 'out';
}

function txLines(rec: DocRecord) {
  const lines: { idx: 1 | 2; code: string; remark: string }[] = [];
  if (rec.f.code1 || rec.f.remark1) lines.push({ idx: 1, code: rec.f.code1, remark: rec.f.remark1 });
  if (rec.f.code2 || rec.f.remark2) lines.push({ idx: 2, code: rec.f.code2, remark: rec.f.remark2 });
  return lines;
}

/* ---------------- R101 类别编码与用途说明匹配 ---------------- */

export function judgeCodeRemark(rec: DocRecord, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R101');
  const lines = txLines(rec).filter((l) => l.code && l.remark);
  t.add('perceive', '读取单据要素', '提取类别编码、用途说明、收付方向与往来类型。', {
    收付方向: rec.biz === 'receipt' ? '收款（对方 → 本方）' : '付款（本方 → 对方）',
    往来类型: rec.f.tradeType,
    ...Object.fromEntries(lines.flatMap((l) => [[`类别编码${l.idx}`, codeLabel(l.code)], [`用途说明${l.idx}`, l.remark]])),
  });
  if (!lines.length) return t.done({ verdict: 'skip', message: '类别编码或用途说明为空，由“必填完整性”规则处理。' });

  let judged = 0;
  for (const l of lines) {
    const info = codeInfo(l.code);
    t.add('tool', `调用工具 lookup_category_code("${l.code}")`, undefined, {
      编码名称: info?.name ?? '未收录（按编码首位推断大类）',
      所属大类: codeGroup(l.code),
    });
    const pre = preprocessRemark(l.remark);
    t.add(
      'reason',
      `用途说明预处理（第 ${l.idx} 行）`,
      pre.removed.length
        ? `去除不影响交易性质判断的标注：${pre.removed.map((r) => `“${r}”`).join('、')}，得到核心表述“${pre.cleaned}”。`
        : `用途说明无额外标注，核心表述即“${pre.cleaned}”。`,
    );
    const hits = extractTopics(pre.cleaned);
    let head = primaryTopic(hits);
    // 只有“预收/预付/货到”等时点词时，中心语让位给其他主题
    if (timingOnly(head) && hits.length > 1) head = hits.find((h) => h !== head);
    t.add(
      'tool',
      `调用工具 extract_topics("${pre.cleaned}")`,
      undefined,
      hits.length
        ? Object.fromEntries(hits.map((h, i) => [`主题${i + 1}`, `${h.topic.label}（命中“${h.match}”）`]))
        : { 结果: '未识别到明确的交易主题' },
    );
    if (!head) {
      t.add('reason', '判断交易性质', '用途说明中没有可识别的交易标的或服务类型，无法据此判断编码是否匹配；交由“用途说明表述笼统”规则进一步判断。');
      continue;
    }
    if (timingOnly(head)) {
      t.add('reason', '判断交易性质', `用途说明只有“${head.match}”等收付时点词，缺少商品或服务内容，不足以判断编码 ${l.code} 是否匹配，不作结论。`);
      continue;
    }
    const expected = head.topic.codes(pre.cleaned, dirOf(rec));
    if (!expected.length) {
      t.add('reason', '判断交易性质', `用途说明描述的是“${head.topic.label}”，编码字典中没有可直接对应的建议编码，不作结论。`);
      continue;
    }
    judged++;
    const hitDesc =
      hits.length > 1
        ? `用途说明同时出现${hits.map((h) => `“${h.match}”`).join('、')}，中文表述的中心语在末尾，交易性质以“${head.match}”为准。`
        : `用途说明描述的交易性质为“${head.topic.label}”。`;
    t.add('retrieve', '检索规则库与历史判例', `召回 R101《类别编码与用途说明对应匹配》及 ${2 + (hash(pre.cleaned) % 5)} 条相似用途说明的已确认判例。`, {
      规则要点: '类别编码应与用途说明描述的交易性质一致；货物用 1 字头，服务用 2 字头，运输方式与进出口方向需对应',
      相似判例: `“${pre.cleaned.slice(0, 14)}…” → ${expected.slice(0, 2).join(' / ')}`,
    });
    const ok = expected.includes(l.code) || (head.topic.goods && l.code.startsWith('1') && head.topic.id === 'goods');
    if (ok) {
      t.add('reason', '比对编码与交易性质', `${hitDesc}填报编码 ${codeLabel(l.code)} 与该性质一致。`);
      continue;
    }
    // 服务类用途说明常同时描述多项服务（如“认证费及代理费”），服务编码与其中任一服务主题相符即可接受
    const alt = !l.code.startsWith('1') ? hits.find((h) => h !== head && !h.topic.goods && h.topic.codes(pre.cleaned, dirOf(rec)).includes(l.code)) : undefined;
    if (alt) {
      t.add('reason', '比对编码与交易性质', `${hitDesc}用途说明同时描述了“${alt.topic.label}”（命中“${alt.match}”），填报编码 ${codeLabel(l.code)} 与该项服务相符，属于多项服务合并填报的可接受口径。`);
      continue;
    }
    const sameGroup = expected.some((c) => codeFamily(c) === codeFamily(l.code));
    const suggestion = expected[0];
    const reasonText = `${hitDesc}该性质对应编码 ${expected.map(codeLabel).join(' 或 ')}；填报编码 ${codeLabel(l.code)} 属于“${codeGroup(
      l.code,
    )}”${sameGroup ? '，属同一中类但细分项不符' : `，与“${codeGroup(suggestion)}”性质不符`}。`;
    t.add('reason', '比对编码与交易性质', reasonText);
    t.add(
      'reflect',
      '自检：排除常见误报',
      head.topic.goods
        ? '检查是否属于“编码细分口径差异”（如一般贸易与加工贸易、转口贸易之间）——用途说明含明确的加工 / 转口表述，维持判断。'
        : '检查是否属于“货款中含少量运费 / 服务费合并填报”的情形——用途说明中心语是服务而非货物，且无“含…”补充说明，维持判断。',
    );
    // 细分口径（如 27 中类内的各类专业服务）差异较难仅凭用途说明确定，降为提示；运输、保险方向错误仍为疑点
    const soft = sameGroup && !['21', '22'].includes(codeFamily(l.code));
    return t.done({
      verdict: soft ? 'warn' : 'fail',
      confidence: soft ? 0.66 : sameGroup ? 0.86 : 0.93,
      message: `类别编码${l.idx}（${l.code}）与用途说明“${l.remark}”不匹配：用途说明反映的是${head.topic.label}。`,
      suggestion: `建议将类别编码${l.idx}修改为 ${codeLabel(suggestion)}`,
      fields: [l.idx === 1 ? 'code1' : 'code2', l.idx === 1 ? 'remark1' : 'remark2'],
    });
  }
  if (!judged) return t.done({ verdict: 'skip', message: '用途说明未体现可识别的交易性质，编码匹配无法判断。' });
  const hadContains = lines.some((l) => /[（(]\s*含[^）)]*(运费|保险|服务|佣金)/.test(l.remark));
  if (hadContains)
    t.add('reflect', '自检：误报拦截', '用途说明括号内“含…运费”属于货款中合并的少量费用，按主交易（货物）填报是可接受口径，不作为疑点。');
  return t.done({
    verdict: 'pass',
    confidence: 0.95,
    message: '类别编码与用途说明描述的交易性质一致。',
    cleared: hadContains ? '用途说明含“运费 / 服务费”等关键词，关键词预筛会误报；智能体识别为货款中合并的少量费用，排除。' : undefined,
  });
}

/* ---------------- R102 用途说明表述笼统 ---------------- */

export function judgeGenericRemark(rec: DocRecord, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R102');
  const lines = txLines(rec).filter((l) => l.remark);
  t.add('perceive', '读取用途说明', undefined, Object.fromEntries(lines.map((l) => [`用途说明${l.idx}`, l.remark])));
  for (const l of lines) {
    const pre = preprocessRemark(l.remark);
    const hits = extractTopics(pre.cleaned);
    const generic = isGenericRemark(pre.cleaned) || (!hits.length && pre.cleaned.length <= 4);
    if (!generic) continue;
    t.add('retrieve', '检索单据填写规范', '召回填写规范要点：用途说明应准确、完整说明交易性质；货物写明贸易方式与商品，服务写明服务类型。');
    t.add(
      'reason',
      '判断用途说明是否足以说明交易性质',
      `用途说明核心表述“${pre.cleaned}”只说明了资金名义，未体现${
        rec.f.code1?.startsWith('1') ? '贸易方式与商品名称（如“一般贸易项下出口轴承货款”）' : '具体服务内容（如“产品检测服务费”）'
      }，在集团单据抽查中属于典型的“用途说明不规范”。`,
    );
    return t.done({
      verdict: 'fail',
      confidence: 0.9,
      message: `用途说明${l.idx}“${l.remark}”过于笼统，未说明交易性质与标的。`,
      suggestion: rec.f.code1?.startsWith('1')
        ? '建议补充为“一般贸易项下出口XX（商品名称）货款”的完整表述'
        : `建议按编码 ${codeLabel(l.code)} 写明具体服务内容`,
      fields: [l.idx === 1 ? 'remark1' : 'remark2'],
    });
  }
  t.add('reason', '判断用途说明是否足以说明交易性质', '用途说明包含交易方式 / 标的或服务内容，满足填写规范。');
  return t.done({ verdict: 'pass', confidence: 0.92 });
}

/* ---------------- R502 / R503 款项性质与用途说明一致 ---------------- */

export function judgeNature(rec: DocRecord, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R50x');
  const remark = `${rec.f.remark1}${rec.f.remark2}`;
  const nature = rec.f.nature;
  const label = NATURE_LABEL[rec.biz][nature] ?? '（空）';
  const isIncome = rec.biz === 'receipt';
  const pre = isIncome ? /预收/.test(remark) : /预付/.test(remark);
  const arrival = /到货/.test(remark);
  const refund = REFUND_RE.test(rec.f.remark1) || /退款|退回|退还/.test(rec.f.remark2);
  t.add('perceive', '读取性质与用途说明', undefined, {
    款项性质: `${nature || '（空）'} ${label}`,
    用途说明: remark || '（空）',
  });
  t.add('tool', '关键词预筛（确定性规则）', undefined, {
    [isIncome ? '含“预收”' : '含“预付”']: pre ? '是' : '否',
    '含“到货”': arrival ? '是' : '否',
    '含“退款 / 退回”': refund ? '是' : '否',
  });
  let problem: string | null = null;
  let suggestion = '';
  if (nature === 'R' && !refund) {
    problem = `性质为“退款”，但用途说明未体现退款。`;
    suggestion = '核实是否为退款；如是，用途说明注明“退款”及原单据编号；如否，修改性质';
  } else if (refund && nature !== 'R') {
    problem = `用途说明表明为退款，但性质选择为“${label}”。`;
    suggestion = '将性质修改为 R-退款';
  } else if (nature === 'A' && !pre) {
    problem = `性质为“${label}”，但用途说明${arrival ? '写明“到货”' : '未体现预收 / 预付'}。`;
    suggestion = arrival ? `将性质修改为 ${isIncome ? 'O-其他' : 'P-到货付款'}` : `用途说明补充“${isIncome ? '预收' : '预付'}”或修改性质`;
  } else if (pre && nature !== 'A') {
    problem = `用途说明写明“${isIncome ? '预收' : '预付'}”，但性质选择为“${label}”。`;
    suggestion = `将性质修改为 A-${isIncome ? '预收款' : '预付款'}`;
  } else if (!isIncome && nature === 'P' && pre) {
    problem = '款项性质为“到货付款”，但用途说明写明“预付”。';
    suggestion = '将款项性质修改为 A-预付款';
  }
  if (!problem) {
    t.add('reason', '语义复核', '用途说明与所选性质一致，预筛未命中，无需进一步判断。');
    return t.done({ verdict: 'pass', confidence: 0.97 });
  }
  t.add(
    'reason',
    '智能体语义复核',
    `预筛命中：${problem}进一步阅读全句：用途说明“${remark}”${
      /非|不是|并非/.test(remark) ? '存在否定表述，需要人工确认。' : '不存在否定、转述等改变语义的表述，预筛结论成立。'
    }`,
  );
  t.add('reflect', '自检', '核对：预收 / 预付影响往来账龄与资金计划，性质错报会导致应收应付余额与资金预测偏差，按疑点处理。');
  return t.done({
    verdict: 'fail',
    confidence: 0.91,
    message: problem,
    suggestion,
    fields: ['nature', 'remark1'],
  });
}

/* ---------------- R403 国家/地区与对方地址一致 ---------------- */

/** 美国州名缩写：与国别二位码冲突时（CA 加州/加拿大、DE 特拉华/德国、IN 印第安纳/印度…）需结合上下文判断 */
const US_STATES = new Set(['AL', 'AR', 'CA', 'CO', 'DE', 'GA', 'ID', 'IN', 'MA', 'MD', 'ME', 'MN', 'MT', 'NE', 'NC', 'PA', 'SC', 'VA', 'WA', 'TX', 'NY', 'NJ', 'FL', 'IL', 'OH', 'MI', 'AZ', 'NV', 'OR', 'UT', 'WI', 'KY', 'TN', 'LA', 'MO', 'IA', 'KS', 'OK', 'CT', 'HI', 'AK', 'NH', 'VT', 'RI', 'WV', 'SD', 'ND', 'WY', 'NM', 'MS']);
/** 离岸注册地：注册地与经营地址不一致很常见，口径需确认 */
const OFFSHORE = new Set(['WSM', 'VGB', 'CYM', 'MHL', 'BMU', 'SYC', 'PAN', 'LBR', 'BHS']);

export function countryHints(counterparty: string) {
  const body = counterparty.toUpperCase();
  const parts = body.split(/[;；]/).map((p) => p.trim());
  const strong: { code: string; why: string }[] = [];
  const codes2: string[] = [];
  for (const p of parts.slice(1)) {
    // 只认独立地址段、逗号后或邮编后的二位码，避免把“BO DE”之类地名误认为国别
    const m = /^([A-Z]{2})$/.exec(p) ?? /,\s*([A-Z]{2})$/.exec(p) ?? /\d\s+([A-Z]{2})$/.exec(p);
    if (m && ISO2[m[1]]) codes2.push(m[1]);
  }
  const usContext = codes2.includes('US') || /\bUSA\b|UNITED STATES|\b\d{5}(-\d{4})?\b/.test(body);
  for (const c of codes2) {
    if (US_STATES.has(c) && usContext && c !== 'US') strong.push({ code: 'USA', why: `美国州名缩写“${c}”` });
    else strong.push({ code: ISO2[c], why: `地址段国别代码“${c}”` });
  }
  for (const [re, code] of PLACE_HINTS) {
    const m = re.exec(body);
    if (m) strong.push({ code, why: `地址/名称中的地名“${m[0]}”` });
  }
  const weak: { codes: string[]; why: string }[] = [];
  for (const [re, codes, why] of LEGAL_FORM_HINTS) if (re.test(body)) weak.push({ codes, why });
  return { strong, weak, parts };
}

export function judgeCountryAddress(rec: DocRecord, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R403');
  const cp = rec.f.counterparty;
  const declared = rec.f.country;
  t.add('perceive', '读取交易对方与填报国家/地区', undefined, { 交易对方: cp || '（空）', 填报国家地区: countryLabel(declared) });
  if (!cp || !declared || rec.f.tradeType === '4')
    return t.done({ verdict: 'skip', message: '境内往来或要素缺失，不适用本规则。' });
  const { strong, weak, parts } = countryHints(cp);
  t.add('tool', '调用工具 parse_counterparty()', '拆分名称与地址段，抽取地名、国别代码与法律形式后缀。', {
    名称段: parts[0] ?? '',
    地址段: parts.slice(1).join(' / ') || '（无）',
    强线索: strong.map((s) => `${s.code}（${s.why}）`).join('；') || '无',
    弱线索: weak.map((w) => `${w.codes.join('/')}（${w.why}）`).join('；') || '无',
  });
  const strongCodes = [...new Set(strong.map((s) => s.code))];
  if (strongCodes.length && !strongCodes.includes(declared) && OFFSHORE.has(declared)) {
    t.add(
      'reason',
      '比对填报国家/地区与地址线索',
      `填报的 ${countryLabel(declared)} 为常见离岸注册地，对方地址指向 ${strongCodes.map(countryLabel).join('、')}。注册地与经营地不一致在离岸主体中很常见，按注册地还是经营地填报需要结合合同或客商主数据确认。`,
    );
    return t.done({
      verdict: 'warn',
      confidence: 0.55,
      message: `填报国家/地区为离岸注册地 ${countryLabel(declared)}，对方地址显示 ${strongCodes.map(countryLabel).join('、')}，建议人工确认填报口径。`,
      suggestion: '核实交易对方注册地与实际经营地',
      fields: ['country', 'counterparty'],
    });
  }
  if (strongCodes.length && !strongCodes.includes(declared)) {
    const s = strong.find((x) => x.code === strongCodes[0])!;
    t.add(
      'reason',
      '比对填报国家/地区与地址线索',
      `对方地址给出明确国别线索：${s.why}，指向 ${countryLabel(s.code)}；填报为 ${countryLabel(
        declared,
      )}。对方国家/地区应填写交易对方实际所在地，而非资金汇出地或开户行所在地。`,
    );
    t.add(
      'reflect',
      '自检：考虑合理解释',
      '可能的合理解释：对方为跨国集团，由其他国家的关联方代付（此时交易对方应为实际付款方）。现有要素无法支持该解释，按疑点提示整改或说明。',
    );
    return t.done({
      verdict: 'fail',
      confidence: 0.88,
      message: `填报国家/地区 ${countryLabel(declared)} 与交易对方地址显示的 ${countryLabel(s.code)} 不一致。`,
      suggestion: `核实交易对方所在国家/地区，必要时修改为 ${countryLabel(s.code)}`,
      fields: ['country', 'counterparty'],
    });
  }
  if (!strongCodes.length && weak.length && !weak.some((w) => w.codes.includes(declared))) {
    t.add(
      'reason',
      '比对填报国家/地区与法律形式',
      `对方名称无地址信息，只有法律形式线索：${weak[0].why}，常见于 ${weak[0].codes
        .map((c) => COUNTRIES[c] ?? c)
        .join('、')}；填报为 ${countryLabel(declared)}。线索较弱，不足以直接判定错误。`,
    );
    return t.done({
      verdict: 'warn',
      confidence: 0.58,
      message: `交易对方法律形式（${weak[0].why}）与填报的 ${countryLabel(declared)} 不常见，建议人工确认。`,
      suggestion: '查询客商主数据，核实交易对方所在国家/地区',
      fields: ['country', 'counterparty'],
    });
  }
  t.add('reason', '比对填报国家/地区与地址线索', strongCodes.length ? '地址线索与填报一致。' : '名称与地址中没有与填报冲突的线索。');
  return t.done({ verdict: 'pass', confidence: strongCodes.length ? 0.96 : 0.8 });
}

/* ---------------- R405 / R406 同一批次同一交易对方国家/地区唯一 ---------------- */

const fmtDist = (counts: [string, number][]) => counts.map(([c, n]) => `${countryLabel(c)} ${n} 笔`).join('、');

/** R405：名称完全相同的交易对方，本批次（三类单据合并）中国家/地区不唯一；多数国别以外的记录为疑点，平局时全部提示 */
export function judgeBatchExact(rec: DocRecord, idx: BatchIndex | undefined, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R405');
  if (!idx) return t.done({ verdict: 'skip', message: '单笔核查没有批次信息，本规则只在整批核查时执行。' });
  if (!countable(rec)) return t.done({ verdict: 'skip', message: '非境外往来或国家/地区为空 / CHN / ZZZ，由其他规则处理。' });
  const key = normName(rec.f.counterparty);
  const dist = idx.exact.get(key) ?? {};
  const counts = countsOf(dist);
  t.add('perceive', '读取交易对方与国家/地区', undefined, { 交易对方: rec.f.counterparty, 填报国家地区: countryLabel(rec.f.country) });
  t.add('tool', '统计本批次同名交易对方的国家/地区', `本批次三类单据合并 ${idx.counted} 笔境外往来记录中，名称完全相同的有 ${counts.reduce((s, [, n]) => s + n, 0)} 笔。`, { 国别分布: fmtDist(counts) });
  if (counts.length <= 1) return t.done({ verdict: 'pass', message: '本批次中该交易对方国家/地区唯一。' });
  const g = idx.groupOf.get(cleanName(rec.f.counterparty));
  if (g?.exclude?.kind === 'platform') {
    t.add('reason', '智能体复核：是否属于多国收付的平台', g.exclude.reason);
    return t.done({ verdict: 'pass', confidence: 0.9, cleared: `预筛命中（同名不同国别：${fmtDist(counts)}），${g.exclude.reason}` });
  }
  const maj = majorityOf(counts);
  if (maj === rec.f.country) {
    t.add('reason', '判断本笔是否为少数国别', `本笔 ${countryLabel(rec.f.country)} 是本批次中该交易对方的多数国别，少数国别的记录会被标出。`);
    return t.done({ verdict: 'pass' });
  }
  if (!maj) {
    return t.done({
      verdict: 'warn',
      confidence: 1,
      message: `同一交易对方在本批次中国家/地区不唯一且笔数相同（${fmtDist(counts)}），无法判断以哪个为准。`,
      suggestion: '核实交易对方实际所在国家/地区，统一修改',
      fields: ['country', 'counterparty'],
    });
  }
  return t.done({
    verdict: 'fail',
    confidence: 1,
    message: `同一交易对方在本批次中国家/地区不唯一：${fmtDist(counts)}；本笔填报为 ${countryLabel(rec.f.country)}。`,
    suggestion: `核实后修改为 ${countryLabel(maj)}（本批次多数填报）`,
    fields: ['country', 'counterparty'],
  });
}

/** R406：名称写法不同但清洗后为同一交易对方（大小写、标点、地址、单复数差异），国家/地区不一致；含地区限定词的子公司由智能体否决合并 */
export function judgeBatchSimilar(rec: DocRecord, idx: BatchIndex | undefined, trace: boolean): Judgement {
  const t = new Tracer(trace, rec.key + 'R406');
  if (!idx) return t.done({ verdict: 'skip', message: '单笔核查没有批次信息，本规则只在整批核查时执行。' });
  if (!countable(rec)) return t.done({ verdict: 'skip', message: '非境外往来或国家/地区为空 / CHN / ZZZ，由其他规则处理。' });
  const cleaned = cleanName(rec.f.counterparty);
  const own = normName(rec.f.counterparty);
  const g = idx.groupOf.get(cleaned);
  t.add('perceive', '读取交易对方', undefined, { 原始名称: rec.f.counterparty, 清洗后: cleaned, 填报国家地区: countryLabel(rec.f.country) });
  const veto = idx.merges.find((m) => m.decision === 'keep-apart' && (m.a === cleaned || m.b === cleaned));
  if (!g || g.variants.length < 2) {
    if (veto) {
      const other = veto.a === cleaned ? veto.b : veto.a;
      const og = idx.groupOf.get(other);
      t.add('tool', '相似度检索', undefined, { 最相似: `${other}（${veto.sim.toFixed(2)}）` });
      t.add('reason', '智能体判断是否为同一主体', veto.reason);
      // 只在“若被合并就会成为少数国别”的一方记误报拦截（对方笔数更多且国别不同）
      if (og && og.majority && og.majority !== rec.f.country && og.total > (g?.total ?? 1))
        return t.done({ verdict: 'pass', confidence: 0.86, cleared: `与“${other}”字面相似（${veto.sim.toFixed(2)}）且国别不同，但${veto.reason.replace(/^字面相似度 [0-9.]+ 超过阈值，但/, '')}` });
    }
    return t.done({ verdict: 'pass', message: '本批次中没有写法相近的同一交易对方。' });
  }
  const others = g.variants.filter((v) => v.raw !== own);
  t.add('tool', '名称清洗与相似度聚类', `本批次中与本笔清洗后为同一交易对方的写法有 ${g.variants.length} 种。`, Object.fromEntries(g.variants.map((v, i) => [`写法${i + 1}`, `${v.raw} → ${fmtDist(countsOf(v.countries))}`])));
  if (g.exclude) {
    t.add('reason', '智能体复核', g.exclude.reason);
    return t.done({ verdict: 'pass', confidence: 0.9, ...(g.countries.length > 1 ? { cleared: `写法相近的交易对方国家/地区不唯一，但${g.exclude.reason}` } : {}) });
  }
  if (g.countries.length <= 1) return t.done({ verdict: 'pass', message: '写法不同，但国家/地区一致。' });
  // 同一写法内部国家/地区不唯一的由 R405 处理，这里只看写法之间的差异
  const ownCountries = Object.keys(idx.exact.get(own) ?? {});
  if (ownCountries.length > 1) return t.done({ verdict: 'pass', message: '本写法内部国家/地区不唯一，由 R405 处理。' });
  t.add('reason', '智能体判断是否为同一主体', `差异仅为标点、大小写、地址或单复数，判定为同一境外交易对方；合并后国别分布：${fmtDist(g.countries)}。`);
  if (g.majority === rec.f.country) return t.done({ verdict: 'pass', message: '本笔为该交易对方在本批次中的多数国别。' });
  const sample = others[0];
  return t.done({
    verdict: g.majority ? 'fail' : 'warn',
    confidence: 0.92,
    message: `与本批次中写法相近的“${sample.raw}”为同一交易对方（清洗后均为“${g.name}”），国家/地区不一致：${fmtDist(g.countries)}；本笔填报为 ${countryLabel(rec.f.country)}。`,
    suggestion: g.majority ? `核实后修改为 ${countryLabel(g.majority)}（本批次多数填报）` : '核实交易对方实际所在国家/地区，统一修改',
    fields: ['country', 'counterparty'],
  });
}

export type { FieldKey };
