/**
 * 规则库按组织维护：集团财务共享中心与各区域财务中心各自维护一套规则库，互不影响。
 * - 规则库 = 从规则实现池（rules/catalog.ts + 自然语言新增的模板）选用的规则 + 本组织的启停、参数、类别（错误 / 疑问数据）；
 * - 核查时按当前用户工号 → doc_user_org → 所属组织，装载该组织的规则库；
 * - 每次更新（自然语言维护经逐条确认 / 手工调整）生成新版本，记录变更清单（diff），可随时回看。
 * 数据保存在本机浏览器（演示）；正式环境建议落在业务库 doc_rule_lib / doc_rule_lib_version。
 */
import { DEMO_DATA_VERSION, createStore, useStore } from '@/lib/store';
import { ORGS, USERS, orgByCode } from '@/domain/orgs';
import { OWNER_LOCAL, RULES } from '@/rules/catalog';
import { TEMPLATE_RULES } from '@/rules/templates';
import { LEVEL_LABEL, type Level, type RuleDef } from '@/rules/types';

/** 规则实现池：初始规则 + 自然语言新增时引用的预置实现 */
export const RULE_POOL: RuleDef[] = [...RULES, ...TEMPLATE_RULES];
export const POOL_MAP = new Map(RULE_POOL.map((r) => [r.id, r]));

export interface LibItem {
  enabled: boolean;
  params: Record<string, number | string>;
  /** 本区域对规则类别的调整（错误数据 / 疑问数据）；未设置则用规则默认 */
  level?: Level;
}

export type ChangeKind = 'add' | 'remove' | 'enable' | 'disable' | 'param' | 'level';

export const CHANGE_LABEL: Record<ChangeKind, string> = {
  add: '新增规则',
  remove: '移除规则',
  enable: '启用',
  disable: '停用',
  param: '参数调整',
  level: '类别调整',
};

/** 一条变更（diff 的一行）：智能体提出，人逐条确认 */
export interface RuleChange {
  id: string;
  kind: ChangeKind;
  ruleId: string;
  ruleName: string;
  field: string;
  before: string;
  after: string;
  reason: string;
  /** 应用到规则库的内容 */
  patch: { enabled?: boolean; params?: Record<string, number | string>; level?: Level; add?: boolean; remove?: boolean };
  /** 智能体判断无法执行（如停用集团制度刚性规则），只展示不可确认 */
  blocked?: string;
}

export interface LibVersion {
  version: string;
  at: string;
  who: string;
  via: 'init' | 'nl' | 'manual';
  /** 自然语言维护的原话 */
  instruction?: string;
  changes: RuleChange[];
  /** 智能体提出但未被确认的变更（留痕） */
  rejected: RuleChange[];
}

export interface RuleLib {
  orgCode: string;
  version: string;
  items: Record<string, LibItem>;
  /** 最新在前 */
  versions: LibVersion[];
}

interface LibsState {
  libs: Record<string, RuleLib>;
}

/* ---------------- 初始数据 ---------------- */

const BASE_IDS = RULES.filter((r) => r.owner !== OWNER_LOCAL).map((r) => r.id);
/** 初始化之后由集团按《资金收付管理制度（2026 版）》补充、统一下发的规则 */
const LATER_IDS = ['R105', 'R405', 'R406', 'R407'];
const LOCAL_IDS = RULES.filter((r) => r.owner === OWNER_LOCAL).map((r) => r.id);

function itemOf(id: string): LibItem {
  const r = POOL_MAP.get(id)!;
  return { enabled: true, params: Object.fromEntries((r.params ?? []).map((p) => [p.key, p.value])) };
}

let seq = 0;
const ch = (c: Omit<RuleChange, 'id' | 'ruleName' | 'patch'> & { patch?: RuleChange['patch'] }): RuleChange => ({
  id: `s${++seq}`,
  ruleName: POOL_MAP.get(c.ruleId)?.name ?? c.ruleId,
  patch: c.patch ?? {},
  ...c,
});

const T1 = `${USERS.tier1.name}（${USERS.tier1.empNo}）`;
const T2 = `${USERS.tier2.name}（${USERS.tier2.empNo}）`;

function initVersion(at: string, who: string, from: string): LibVersion {
  return {
    version: 'v2026.09.1',
    at,
    who,
    via: 'init',
    instruction: from,
    changes: [ch({ kind: 'add', ruleId: '*', field: '规则库', before: '—', after: `${BASE_IDS.length - LATER_IDS.length} 条规则`, reason: '规则库初始化' })],
    rejected: [],
  };
}

function seedLibs(): Record<string, RuleLib> {
  seq = 0;
  const libs: Record<string, RuleLib> = {};
  const base = () => Object.fromEntries(BASE_IDS.map((id) => [id, itemOf(id)]));
  // 集团规则库
  libs['100000'] = {
    orgCode: '100000',
    version: 'v2026.10.2',
    items: base(),
    versions: [
      {
        version: 'v2026.10.2',
        at: '2026-10-10 16:05',
        who: T1,
        via: 'nl',
        instruction: '同一批次里同一个境外交易对方的国别要唯一，名称写法不一样的也要算；国别填 ZZZ 的提示一下',
        changes: [
          ch({ kind: 'add', ruleId: 'R405', field: '规则', before: '—', after: '新增（疑问数据）', reason: '对应《资金收付管理制度》4.2.3.1，三类单据合并核查', patch: { add: true } }),
          ch({ kind: 'add', ruleId: 'R406', field: '规则', before: '—', after: '新增（相似度阈值 0.85）', reason: '“写法不一样的也要算”：清洗后相似度聚类，智能体否决子公司误合并', patch: { add: true } }),
          ch({ kind: 'add', ruleId: 'R407', field: '规则', before: '—', after: '新增（疑问数据）', reason: '对应《资金收付管理制度》4.2.5', patch: { add: true } }),
        ],
        rejected: [],
      },
      {
        version: 'v2026.10.1',
        at: '2026-10-08 10:22',
        who: T1,
        via: 'nl',
        instruction: '收付方向和用途说明对不上的，比如收款单的用途说明写了“付款”，按制度加一条',
        changes: [ch({ kind: 'add', ruleId: 'R105', field: '规则', before: '—', after: '新增（疑问数据）', reason: '对应《资金收付管理制度》4.1.1、4.1.2', patch: { add: true } })],
        rejected: [],
      },
      initVersion('2026-09-11 10:12', T1, 'AI 解读《资金收付管理制度（2026 版）》《单据填写规范手册（2025 版）》生成初始规则集，集团审核发布'),
    ],
  };
  for (const o of ORGS.filter((x) => x.level === 'tier2')) {
    libs[o.code] = {
      orgCode: o.code,
      version: 'v2026.10.1',
      items: base(),
      versions: [
        {
          version: 'v2026.10.1',
          at: '2026-10-10 16:30',
          who: '集团财务共享中心（统一下发）',
          via: 'manual',
          instruction: '集团按《资金收付管理制度（2026 版）》补充的规则统一下发各区域规则库',
          changes: LATER_IDS.map((id) => ch({ kind: 'add', ruleId: id, field: '规则', before: '—', after: '新增', reason: '集团统一下发', patch: { add: true } })),
          rejected: [],
        },
        initVersion('2026-09-12 09:00', '系统', '继承集团规则库 v2026.09.1；之后由本区域独立维护'),
      ],
    };
  }
  // 华东区域：区域规则（自然语言新增）
  const nj = libs['110000'];
  LOCAL_IDS.forEach((id) => (nj.items[id] = itemOf(id)));
  nj.version = 'v2026.10.3';
  nj.versions.unshift(
    {
      version: 'v2026.10.3',
      at: '2026-10-11 11:31',
      who: T2,
      via: 'nl',
      instruction: '付款单项下的退款，用途说明统一用“退回”字样，和收款类退款区分开',
      changes: [ch({ kind: 'add', ruleId: 'R705', field: '规则', before: '—', after: '新增（疑问数据）', reason: '区域要求：付款退款须注明“退回”', patch: { add: true } })],
      rejected: [],
    },
    {
      version: 'v2026.10.2',
      at: '2026-10-09 15:40',
      who: T2,
      via: 'nl',
      instruction: '跨境电商收款的用途说明要写平台，平台词表加上 TEMU、TIKTOK、SHEIN；战略项目子公司的货物类单据，用途说明要标注“战略项目”',
      changes: [
        ch({ kind: 'add', ruleId: 'R701', field: '规则', before: '—', after: '新增（平台词表 v1.1，含 TEMU、TIKTOK、SHEIN）', reason: '区域要求：跨境电商收款用途说明注明平台', patch: { add: true } }),
        ch({ kind: 'add', ruleId: 'R702', field: '规则', before: '—', after: '新增（战略项目主体 6 家）', reason: '区域要求：战略项目单据标注，便于项目成本归集', patch: { add: true } }),
      ],
      rejected: [],
    },
  );
  // 华南区域：只采用跨境电商平台规则；收款录入时限按 4 个工作日从严
  const sz = libs['120000'];
  sz.items.R701 = itemOf('R701');
  sz.items.R601 = { ...itemOf('R601'), params: { days: 4 } };
  sz.version = 'v2026.10.2';
  sz.versions.unshift({
    version: 'v2026.10.2',
    at: '2026-10-12 14:18',
    who: '李晨（F0011023）',
    via: 'nl',
    instruction: '收款单录入时限本区域按 4 个工作日从严掌握；跨境电商收款用途说明要注明平台',
    changes: [
      ch({ kind: 'param', ruleId: 'R601', field: '录入时限', before: '5 个工作日', after: '4 个工作日', reason: '本区域从严掌握', patch: { params: { days: 4 } } }),
      ch({ kind: 'add', ruleId: 'R701', field: '规则', before: '—', after: '新增', reason: '区域要求', patch: { add: true } }),
    ],
    rejected: [],
  });
  // 华北区域：用途说明笼统先停用（与业务确认词表中）
  const wx = libs['130000'];
  wx.items.R102 = { ...wx.items.R102, enabled: false };
  wx.version = 'v2026.10.2';
  wx.versions.unshift({
    version: 'v2026.10.2',
    at: '2026-10-09 09:47',
    who: '赵磊（F0012311）',
    via: 'manual',
    changes: [ch({ kind: 'disable', ruleId: 'R102', field: '启用状态', before: '启用', after: '停用', reason: '笼统词表与业务确认中，暂停两周', patch: { enabled: false } })],
    rejected: [],
  });
  return libs;
}

export const ruleLibStore = createStore<LibsState>('rule-libs', () => ({ libs: seedLibs() }), { version: DEMO_DATA_VERSION });

let initial: Record<string, RuleLib> | null = null;
/** 各区域规则库的初始状态（历史种子批次按它核查，不受演示中后来的修改影响） */
export function initialLibs(): Record<string, RuleLib> {
  return (initial ??= seedLibs());
}

/** 某时刻生效的版本号 */
export function versionAt(lib: RuleLib, time: string): string {
  return lib.versions.find((v) => v.at <= time)?.version ?? lib.versions[lib.versions.length - 1]?.version ?? lib.version;
}

/* ---------------- 读取 ---------------- */

export function libOf(orgCode: string): RuleLib {
  const s = ruleLibStore.get().libs;
  return s[orgCode] ?? s['100000'];
}

export function useRuleLib(orgCode: string): RuleLib {
  return useStore(ruleLibStore, (s) => s.libs[orgCode] ?? s.libs['100000']);
}

export function libName(orgCode: string) {
  return `${orgByCode(orgCode)?.name ?? orgCode}规则库`;
}

/** 规则库中已启用的规则（应用本区域的类别调整） */
export function libRules(lib: RuleLib, opts: { includeDisabled?: boolean } = {}): RuleDef[] {
  const out: RuleDef[] = [];
  for (const [id, it] of Object.entries(lib.items)) {
    const def = POOL_MAP.get(id);
    if (!def || (!it.enabled && !opts.includeDisabled)) continue;
    out.push(it.level && it.level !== def.level ? { ...def, level: it.level } : def);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function libParams(lib: RuleLib): Record<string, Record<string, number | string>> {
  return Object.fromEntries(Object.entries(lib.items).map(([id, it]) => [id, it.params]));
}

export function levelText(l: Level) {
  return LEVEL_LABEL[l];
}

/* ---------------- 写入 ---------------- */

export function bumpVersion(v: string) {
  const m = /^(v\d{4}\.\d{2})\.(\d+)$/.exec(v);
  return m ? `${m[1]}.${Number(m[2]) + 1}` : v;
}

/** 演示中的“现在”：日期固定为原型的今天（2026-10-14），时分取本机时间 */
export function nowText() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `2026-10-14 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 把一条变更应用到规则库条目 */
function applyChange(items: Record<string, LibItem>, c: RuleChange) {
  if (c.patch.add) items[c.ruleId] = items[c.ruleId] ?? itemOf(c.ruleId);
  if (c.patch.remove) delete items[c.ruleId];
  const it = items[c.ruleId];
  if (!it) return;
  if (c.patch.enabled !== undefined) it.enabled = c.patch.enabled;
  if (c.patch.params) it.params = { ...it.params, ...c.patch.params };
  if (c.patch.level) it.level = c.patch.level;
}

/** 发布一个新版本：只应用已确认的变更，未确认的留痕；返回新版本号 */
export function publishVersion(orgCode: string, input: { who: string; via: LibVersion['via']; instruction?: string; confirmed: RuleChange[]; rejected?: RuleChange[] }): string {
  const lib = libOf(orgCode);
  const items: Record<string, LibItem> = JSON.parse(JSON.stringify(lib.items));
  input.confirmed.forEach((c) => applyChange(items, c));
  const version = bumpVersion(lib.version);
  const v: LibVersion = { version, at: nowText(), who: input.who, via: input.via, instruction: input.instruction, changes: input.confirmed, rejected: input.rejected ?? [] };
  ruleLibStore.set((s) => ({ libs: { ...s.libs, [orgCode]: { ...lib, version, items, versions: [v, ...lib.versions] } } }));
  return version;
}

/** 某版本发布后、下一版本之前的规则库状态（用于“查看该版本”时的规则清单）——原型按变更逆推近似，只用于展示 */
export function changeCount(lib: RuleLib) {
  return lib.versions.reduce((n, v) => n + v.changes.length, 0);
}
