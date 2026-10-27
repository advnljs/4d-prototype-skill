/**
 * 自然语言维护规则库（模拟智能体）：
 * 输入区域财务管理员的一段口语化要求，按当前用户所属组织的规则库，输出“变更清单”（diff）供逐条确认：
 * - 新增规则（引用规则实现池中的实现，金额门槛等参数从原话中抽取）；
 * - 参数调整（时限、门槛、相似度阈值…）；类别调整（错误数据 ⇄ 疑问数据）；启用 / 停用；
 * - 查重：要求已被现有规则覆盖时不重复新增；
 * - 口径校验：集团刚性规则不能停用（列出但不可确认）；
 * - 数据源不支持的要求（如需要物流签收数据）给出不可实现说明；信息不全时反问。
 * 真实方案中由大模型完成理解与拆解，原型用关键词规则模拟期望的结论与推理过程。
 */
import { LEVEL_LABEL, type Level, type TraceStep } from '@/rules/types';
import { POOL_MAP, libName, type RuleChange, type RuleLib } from '@/state/ruleLibs';

export interface NlProposal {
  steps: TraceStep[];
  changes: RuleChange[];
  /** 不产生变更的说明：重复、不可实现等 */
  notes: { kind: 'duplicate' | 'infeasible'; text: string }[];
  questions?: string[];
  summary: string;
}

export const EXAMPLES = [
  '单笔 5 万美元以上的服务收入，用途说明要写合同号；同一批次同一交易对方国别不唯一的，改为错误数据；收款录入时限按 4 个工作日掌握',
  '服务费对外付款超过 5 万美元的，要填合同号',
  '用途说明笼统那条先停用；类别编码与用途说明不匹配的也停掉',
  '跨境电商收入的用途说明里必须写清楚是哪个平台',
  '预收款超过 90 天还没有对应发货签收的，要提示',
  '用途写得不规范的要拦住',
];

function s(kind: TraceStep['kind'], title: string, text?: string, io?: Record<string, string>, ms = 600, tokens?: number): TraceStep {
  return { kind, title, text, io: io ? Object.entries(io).map(([label, value]) => ({ label, value })) : undefined, ms, tokens };
}

/** 口语 → 规则：先匹配具体说法，再匹配宽泛说法 */
const TARGETS: [RegExp, string][] = [
  [/R\d{3}/, ''],
  [/国别不唯一|国别唯一|同一.{0,6}交易对[手方].{0,6}国别/, 'R405'],
  [/名称相近|写法不同|相似度/, 'R406'],
  [/ZZZ/i, 'R407'],
  [/编码.{0,3}用途说明.{0,3}不(匹配|一致|符)/, 'R101'],
  [/笼统/, 'R102'],
  [/方向/, 'R105'],
  [/币种.{0,4}不一致/, 'R304'],
  [/录入时限|时限|迟录/, 'R601'],
  [/地址/, 'R403'],
  [/到货付款.{0,6}发票/, 'R204'],
  [/审批单/, 'R505'],
  [/原单据编号/, 'R504'],
  [/退回/, 'R705'],
  [/战略项目/, 'R702'],
];

function targetOf(clause: string): string | undefined {
  for (const [re, id] of TARGETS) {
    const m = clause.match(re);
    if (m) return id || m[0];
  }
  return undefined;
}

function wan(clause: string): number | undefined {
  const m = clause.match(/(\d+(?:\.\d+)?)\s*万/);
  return m ? Math.round(Number(m[1]) * 10000) : undefined;
}

let seq = 0;

export function proposeChanges(input: string, lib: RuleLib, who: { name: string; empNo: string }): NlProposal {
  const text = input.trim();
  const steps: TraceStep[] = [s('perceive', '理解需求', `收到 ${who.name}（${who.empNo}）的规则库维护要求：“${text}”。`, undefined, 5)];
  steps.push(
    s('tool', '调用工具 load_rule_lib(工号)', '按工号查 doc_user_org，装载本组织规则库（只修改本组织，不影响其他区域）。', {
      规则库: `${libName(lib.orgCode)} ${lib.version}`,
      已选用规则: `${Object.keys(lib.items).length} 条（启用 ${Object.values(lib.items).filter((x) => x.enabled).length} 条）`,
    }, 40),
  );
  const clauses = text
    .split(/[；;。\n]|，?另外|，?并且/)
    .map((c) => c.trim())
    .filter(Boolean);
  const changes: RuleChange[] = [];
  const notes: NlProposal['notes'] = [];
  const mk = (c: Omit<RuleChange, 'id' | 'ruleName'>): RuleChange => ({ id: `c${++seq}`, ruleName: POOL_MAP.get(c.ruleId)?.name ?? c.ruleId, ...c });
  const has = (id: string) => !!lib.items[id];
  const levelOf = (id: string): Level => lib.items[id]?.level ?? POOL_MAP.get(id)!.level;

  for (const clause of clauses) {
    // 1. 新增：大额服务类收款用途说明写合同号（R706）
    if (/服务/.test(clause) && /合同/.test(clause) && /(收入|收款|收到)/.test(clause)) {
      const th = wan(clause) ?? 50000;
      if (has('R706')) {
        const cur = Number(lib.items.R706.params.threshold ?? 50000);
        if (cur !== th) changes.push(mk({ kind: 'param', ruleId: 'R706', field: '金额门槛', before: `${cur.toLocaleString()} 美元`, after: `${th.toLocaleString()} 美元`, reason: `原话：“${clause}”`, patch: { params: { threshold: th } } }));
        else notes.push({ kind: 'duplicate', text: `“${clause}”已由 R706 覆盖（门槛 ${cur.toLocaleString()} 美元），无需变更。` });
      } else
        changes.push(mk({ kind: 'add', ruleId: 'R706', field: '规则', before: '—', after: `新增（疑问数据，金额门槛 ${th.toLocaleString()} 美元）`, reason: `原话：“${clause}”；适用收款单、服务类（2 字头编码）；未说明是否算错误，按疑问数据处理避免一刀切`, patch: { add: true, params: { threshold: th } } }));
      continue;
    }
    // 2. 新增：服务类大额付款未填合同号（R707）
    if (/服务/.test(clause) && /(支付|付款)/.test(clause) && /万/.test(clause)) {
      const th = wan(clause) ?? 50000;
      if (has('R707')) notes.push({ kind: 'duplicate', text: `“${clause}”已由 R707 覆盖，无需新增。` });
      else changes.push(mk({ kind: 'add', ruleId: 'R707', field: '规则', before: '—', after: `新增（错误数据，金额门槛 ${th.toLocaleString()} 美元）`, reason: `原话：“${clause}”；映射到付款单“合同号”栏；“要填”为明确要求，按错误数据处理`, patch: { add: true, params: { threshold: th } } }));
      continue;
    }
    // 3. 不可实现：需要物流签收数据
    if (/预收/.test(clause) && /(90|九十|天)/.test(clause) && /(签收|发货|出库)/.test(clause)) {
      notes.push({ kind: 'infeasible', text: `“${clause}”需要把预收款与后续发货签收关联，上传的三类单据中没有物流信息，事前核查无法实现；建议纳入驾驶舱的事后监测，或接入物流数据后再评估。` });
      continue;
    }
    const target = targetOf(clause);
    // 4. 平台销售：已有 R701 视为重复
    if (!target && /(跨境电商|平台)/.test(clause)) {
      if (has('R701')) notes.push({ kind: 'duplicate', text: `“${clause}”与已启用的 R701 平台销售收款未注明平台重复，建议直接调整 R701 的平台名称词表，而不是新增规则。` });
      else changes.push(mk({ kind: 'add', ruleId: 'R701', field: '规则', before: '—', after: '新增（错误数据）', reason: `原话：“${clause}”`, patch: { add: true } }));
      continue;
    }
    if (!target || !POOL_MAP.get(target)) continue;
    const def = POOL_MAP.get(target)!;
    // 5. 类别调整
    const toError = /(改为|改成|调整为|升级为|作为|算)\s*(错误数据|错误|疑点)/.test(clause);
    const toWarn = /(改为|改成|调整为|降为|作为|算)\s*(疑问数据|疑问|提示|人工确认)/.test(clause);
    if (toError || toWarn) {
      const to: Level = toError ? 'error' : 'warn';
      if (!has(target)) changes.push(mk({ kind: 'add', ruleId: target, field: '规则', before: '—', after: `新增（${LEVEL_LABEL[to]}）`, reason: `本组织规则库尚未选用 ${target}，先新增；原话：“${clause}”`, patch: { add: true, level: to } }));
      else if (levelOf(target) === to) notes.push({ kind: 'duplicate', text: `${target} ${def.name}当前已是${LEVEL_LABEL[to]}，无需变更。` });
      else changes.push(mk({ kind: 'level', ruleId: target, field: '规则类别', before: LEVEL_LABEL[levelOf(target)], after: LEVEL_LABEL[to], reason: `原话：“${clause}”${target === 'R405' ? '；集团制度将 4.2.3 列为疑问数据，本区域从严掌握' : ''}`, patch: { level: to } }));
      continue;
    }
    // 6. 参数调整
    const days = clause.match(/(\d+)\s*个?工作日/);
    const sim = clause.match(/0\.\d+/);
    if (target === 'R601' && days) {
      const cur = Number(lib.items.R601?.params.days ?? 5);
      const nv = Number(days[1]);
      if (cur === nv) notes.push({ kind: 'duplicate', text: `R601 录入时限当前已是 ${cur} 个工作日。` });
      else changes.push(mk({ kind: 'param', ruleId: 'R601', field: '录入时限', before: `${cur} 个工作日`, after: `${nv} 个工作日`, reason: `原话：“${clause}”`, patch: { params: { days: nv } } }));
      continue;
    }
    if (target === 'R406' && sim) {
      const cur = Number(lib.items.R406?.params.sim ?? 0.85);
      changes.push(mk({ kind: 'param', ruleId: 'R406', field: '相似度阈值', before: String(cur), after: sim[0], reason: `原话：“${clause}”；阈值越低合并越多，误合并由智能体否决`, patch: { params: { sim: Number(sim[0]) } } }));
      continue;
    }
    // 7. 启用 / 停用
    if (/(停用|停掉|暂停|关闭|不要了)/.test(clause)) {
      if (!has(target) || !lib.items[target].enabled) notes.push({ kind: 'duplicate', text: `${target} ${def.name}在本组织规则库中未启用，无需停用。` });
      else
        changes.push(
          mk({
            kind: 'disable',
            ruleId: target,
            field: '启用状态',
            before: '启用',
            after: '停用',
            reason: `原话：“${clause}”`,
            patch: { enabled: false },
            blocked: def.rigid ? '集团刚性规则，区域规则库不能停用；如认为误报多，可反馈集团财务共享中心评估口径' : undefined,
          }),
        );
      continue;
    }
    if (/(启用|恢复)/.test(clause)) {
      if (has(target) && lib.items[target].enabled) notes.push({ kind: 'duplicate', text: `${target} ${def.name}已启用。` });
      else changes.push(mk({ kind: has(target) ? 'enable' : 'add', ruleId: target, field: has(target) ? '启用状态' : '规则', before: has(target) ? '停用' : '—', after: has(target) ? '启用' : '新增', reason: `原话：“${clause}”`, patch: has(target) ? { enabled: true } : { add: true } }));
    }
  }

  steps.push(
    s('tool', '调用工具 search_rules(语义相似)', `把要求拆成 ${clauses.length} 句，逐句在本组织规则库与规则实现池中检索。`, Object.fromEntries(clauses.map((c, i) => [`第 ${i + 1} 句`, c.length > 26 ? `${c.slice(0, 26)}…` : c])), 80),
  );
  if (!changes.length && !notes.length) {
    steps.push(s('reason', '抽取规则要素', '描述中缺少可执行的判定要素：没有说明适用哪类单据、检查哪个字段、什么情况算疑点。直接生成会变成泛化规则，误报不可控。', undefined, 1100, 380));
    const questions = ['适用于哪类单据：收款单、付款单、进口结算单，还是三类都适用？', '检查哪个字段：用途说明、类别编码，还是金额、国家/地区？', '什么情况算疑点：请给 1–2 个应当拦截的用途说明例子，以及 1 个不应拦截的例子。', '命中后算“错误数据”还是“疑问数据（需人工确认）”？'];
    steps.push(s('verdict', '结论：需要补充信息', '向提出人反问以下问题。', undefined, 1));
    return { steps, changes, notes, questions, summary: '信息不全，智能体反问 4 个问题。' };
  }
  steps.push(
    s(
      'reason',
      '拆解为结构化变更',
      [
        changes.length ? `生成 ${changes.length} 条变更：${changes.map((c) => `${c.ruleId} ${c.field}`).join('、')}。` : '',
        changes.some((c) => c.blocked) ? '其中停用集团刚性规则的变更不可执行，只列出供知悉。' : '',
        notes.length ? `另有 ${notes.length} 项不产生变更（重复或不可实现）。` : '',
        '金额门槛、时限等做成参数，便于以后再调。',
      ]
        .filter(Boolean)
        .join(''),
      undefined,
      1500,
      560,
    ),
  );
  steps.push(s('verdict', `结论：${changes.length} 条变更待确认`, '请逐条确认或全部确认；确认后发布新版本并记录 diff，只影响本组织用户。', undefined, 1));
  return { steps, changes, notes, summary: `生成 ${changes.length} 条变更${notes.length ? `，${notes.length} 项不变更` : ''}。` };
}
