/**
 * 组织与人员（全部为虚构演示数据）。
 * 层级：集团财务共享中心 → 区域财务中心 → 子公司。
 * 组织编码采用 6 位数字（与 ERP 导出文件“组织编码”列一致，编码为虚构）。
 * 枚举键沿用 tier1 / tier2 / sub 三级。
 */
export type OrgLevel = 'tier1' | 'tier2' | 'sub';

export interface Org {
  code: string;
  name: string;
  short: string;
  level: OrgLevel;
  parent?: string;
}

export const ORGS: Org[] = [
  { code: '100000', name: '集团财务共享中心', short: '集团', level: 'tier1' },
  { code: '110000', name: '华东区域财务中心', short: '华东', level: 'tier2', parent: '100000' },
  { code: '120000', name: '华南区域财务中心', short: '华南', level: 'tier2', parent: '100000' },
  { code: '130000', name: '华北区域财务中心', short: '华北', level: 'tier2', parent: '100000' },
  { code: '140000', name: '华中区域财务中心', short: '华中', level: 'tier2', parent: '100000' },
  { code: '150000', name: '西南区域财务中心', short: '西南', level: 'tier2', parent: '100000' },
  { code: '160000', name: '西北区域财务中心', short: '西北', level: 'tier2', parent: '100000' },

  // 演示角色所在的区域（华东）及其子公司
  { code: '110101', name: '上海子公司', short: '上海', level: 'sub', parent: '110000' },
  { code: '110102', name: '杭州子公司', short: '杭州', level: 'sub', parent: '110000' },
  { code: '110103', name: '宁波子公司', short: '宁波', level: 'sub', parent: '110000' },
  { code: '110104', name: '合肥子公司', short: '合肥', level: 'sub', parent: '110000' },
  { code: '110105', name: '温州子公司', short: '温州', level: 'sub', parent: '110000' },
  { code: '120101', name: '广州子公司', short: '广州', level: 'sub', parent: '120000' },
  { code: '120102', name: '深圳子公司', short: '深圳', level: 'sub', parent: '120000' },
  { code: '130101', name: '天津子公司', short: '天津', level: 'sub', parent: '130000' },
  { code: '140101', name: '武汉子公司', short: '武汉', level: 'sub', parent: '140000' },
  { code: '150101', name: '成都子公司', short: '成都', level: 'sub', parent: '150000' },
  { code: '160101', name: '西安子公司', short: '西安', level: 'sub', parent: '160000' },
];

const byCode = new Map(ORGS.map((o) => [o.code, o]));

export function orgByCode(code: string): Org | undefined {
  return byCode.get(code);
}

/** 根据组织编码找到所属区域财务中心（找不到时返回 undefined） */
export function tier2Of(code: string): Org | undefined {
  let o = byCode.get(code);
  while (o && o.level === 'sub') o = o.parent ? byCode.get(o.parent) : undefined;
  return o && o.level === 'tier2' ? o : undefined;
}

export const TIER2 = ORGS.filter((o) => o.level === 'tier2');

/**
 * 岗位（由集团统一身份认证集成，原型用顶栏“演示角色”模拟登录用户）：
 * - 集团财务管理员、区域财务管理员：维护本级规则库（含自然语言维护）+ 一键核查；
 * - 子公司财务核查岗、子公司财务复核岗：一键核查（不涉及规则库维护等 AI 功能）。
 */
export type RoleKey = 'checker' | 'reviewer' | 'tier2' | 'tier1';

export const ROLE_ORDER: RoleKey[] = ['checker', 'reviewer', 'tier2', 'tier1'];

export interface DemoUser {
  role: RoleKey;
  roleName: string;
  name: string;
  /** 工号（统一身份认证中的用户 id） */
  empNo: string;
  orgCode: string;
  duty: string;
}

export const USERS: Record<RoleKey, DemoUser> = {
  checker: {
    role: 'checker',
    roleName: '子公司财务核查岗',
    name: '周敏',
    empNo: 'F0021578',
    orgCode: '110102',
    duty: '上传单据、一键核查、导出问题清单整改',
  },
  reviewer: {
    role: 'reviewer',
    roleName: '子公司财务复核岗',
    name: '刘洋',
    empNo: 'F0021602',
    orgCode: '110102',
    duty: '一键核查、复核疑点（确认 / 判定误报）',
  },
  tier2: {
    role: 'tier2',
    roleName: '区域财务管理员',
    name: '陈立衡',
    empNo: 'F0010912',
    orgCode: '110000',
    duty: '维护本区域规则库、一键核查、查看辖内核查结果与驾驶舱',
  },
  tier1: {
    role: 'tier1',
    roleName: '集团财务管理员',
    name: '吴佳',
    empNo: 'F0000466',
    orgCode: '100000',
    duty: '维护集团规则库、一键核查、查看各区域结果与驾驶舱',
  },
};

/** 用户与所属组织对应表（业务库 doc_user_org，由统一身份认证 / 人力系统每日同步；虚构） */
export interface UserOrg {
  empNo: string;
  name: string;
  orgCode: string;
  post: RoleKey;
}

export const USER_ORG: UserOrg[] = [
  ...Object.values(USERS).map((u) => ({ empNo: u.empNo, name: u.name, orgCode: u.orgCode, post: u.role })),
  { empNo: 'F0021655', name: '孙婷', orgCode: '110104', post: 'checker' },
  { empNo: 'F0021690', name: '王凯', orgCode: '110103', post: 'checker' },
  { empNo: 'F0021712', name: '何静', orgCode: '110101', post: 'reviewer' },
  { empNo: 'F0021738', name: '许航', orgCode: '110105', post: 'checker' },
  { empNo: 'F0011023', name: '李晨', orgCode: '120000', post: 'tier2' },
  { empNo: 'F0030456', name: '张琪', orgCode: '120101', post: 'checker' },
  { empNo: 'F0030478', name: '高远', orgCode: '120102', post: 'checker' },
  { empNo: 'F0012311', name: '赵磊', orgCode: '130000', post: 'tier2' },
  { empNo: 'F0040777', name: '钱悦', orgCode: '130101', post: 'checker' },
  { empNo: 'F0013155', name: '冯涛', orgCode: '140000', post: 'tier2' },
  { empNo: 'F0050612', name: '陆雯', orgCode: '140101', post: 'checker' },
  { empNo: 'F0014208', name: '蒋鹏', orgCode: '150000', post: 'tier2' },
  { empNo: 'F0060733', name: '韩雪', orgCode: '150101', post: 'checker' },
  { empNo: 'F0015119', name: '沈立', orgCode: '160000', post: 'tier2' },
  { empNo: 'F0070456', name: '曹敏', orgCode: '160101', post: 'checker' },
];

export function userByEmpNo(empNo: string): UserOrg | undefined {
  return USER_ORG.find((u) => u.empNo === empNo);
}

/**
 * 按工号匹配规则库：工号 → 所属组织（doc_user_org）→ 规则库所属组织。
 * 子公司用户使用所属区域的规则库；区域用户使用本区域规则库；集团用户使用集团规则库。
 */
export function ruleLibOrgOf(empNo: string): string | undefined {
  const u = userByEmpNo(empNo);
  if (!u) return undefined;
  const o = byCode.get(u.orgCode);
  if (o?.level === 'tier1') return o.code;
  return tier2Of(u.orgCode)?.code;
}

/** 可查看核查结果的组织范围：子公司岗位看本公司；区域看本区域及辖内子公司；集团看全部 */
export function scopeOrgs(user: { role: RoleKey; orgCode: string }): string[] {
  if (user.role === 'tier1') return ORGS.map((o) => o.code);
  if (user.role === 'tier2') return ORGS.filter((o) => o.code === user.orgCode || o.parent === user.orgCode).map((o) => o.code);
  return [user.orgCode];
}

/** 权限矩阵（需求：集团与区域财务管理员维护规则库 + 一键核查；子公司核查岗、复核岗一键核查） */
export const PERMS = {
  check: { checker: true, reviewer: true, tier2: true, tier1: true },
  ruleView: { checker: true, reviewer: true, tier2: true, tier1: true },
  ruleMaintain: { checker: false, reviewer: false, tier2: true, tier1: true },
  resultsView: { checker: true, reviewer: true, tier2: true, tier1: true },
  review: { checker: false, reviewer: true, tier2: true, tier1: true },
  cockpit: { checker: false, reviewer: false, tier2: true, tier1: true },
} as const satisfies Record<string, Record<RoleKey, boolean>>;

export type PermKey = keyof typeof PERMS;
