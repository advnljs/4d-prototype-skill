/**
 * 历史核查批次（演示种子）：近 30 天各子公司 / 区域的上传核查记录，用于“核查结果”与“驾驶舱”。
 * 每个批次 = 从虚构单据中按批次号确定性抽取的一部分记录（界面上传三类都有；RPA 接口上传只有付款单——供应商协同平台的线上付款申请），
 * 用该组织所属区域的初始规则库重新核查得到明细与统计，因此列表数字与明细永远一致、可复现。
 * 各组织的“单据质量系数”不同（疑点记录被抽中的概率不同），驾驶舱里能看出组织间差异。
 */
import { USER_ORG, ORGS, type RoleKey } from '@/domain/orgs';
import type { BizType, DocRecord } from '@/domain/docs';
import { hash, pad } from '@/lib/format';
import { mockLedger, SCENARIOS } from './ledger';

export type UploadSource = 'ui' | 'api';

export const SOURCE_LABEL: Record<UploadSource, string> = { ui: '界面上传', api: '接口上传（RPA）' };

export interface SeedSpec {
  id: string;
  time: string;
  empNo: string;
  userName: string;
  orgCode: string;
  source: UploadSource;
  fileName: string;
  bizs: BizType[];
  /** 合规记录抽样率、疑点记录抽样率 */
  clean: number;
  issue: number;
}

/** 组织单据质量系数：越大疑点越多（虚构） */
const QUALITY: Record<string, number> = {
  '110101': 0.8,
  '110102': 1.0,
  '110103': 1.35,
  '110104': 1.7,
  '110105': 0.65,
  '110000': 1.0,
  '120101': 1.25,
  '120102': 0.9,
  '120000': 1.1,
  '130101': 0.75,
  '130000': 0.8,
  '140101': 1.15,
  '140000': 1.0,
  '150101': 1.5,
  '150000': 1.3,
  '160101': 0.85,
  '160000': 0.9,
};

/** 国庆假期（10 月 1–7 日）不上班；其余工作日 */
function workdays(): Date[] {
  const out: Date[] = [];
  for (let d = new Date(2026, 8, 14); d <= new Date(2026, 9, 13); d.setDate(d.getDate() + 1)) {
    const wd = d.getDay();
    const holiday = d.getMonth() === 9 && d.getDate() <= 7;
    if (wd !== 0 && wd !== 6 && !holiday) out.push(new Date(d));
  }
  return out;
}

const d8 = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

let specs: SeedSpec[] | null = null;

export function seedSpecs(): SeedSpec[] {
  if (specs) return specs;
  const out: SeedSpec[] = [];
  const users = USER_ORG.filter((u) => QUALITY[u.orgCode] !== undefined && (['checker', 'reviewer', 'tier2'] as RoleKey[]).includes(u.post));
  for (const day of workdays()) {
    const ds = d8(day);
    let n = 0;
    for (const u of users) {
      const org = ORGS.find((o) => o.code === u.orgCode)!;
      const isEast = u.orgCode.startsWith('11');
      const q = QUALITY[u.orgCode];
      const roll = (k: string) => (hash(`${ds}${u.empNo}${k}`) % 1000) / 1000;
      // 子公司岗位：界面上传（每天大概率一次）；华东区域的子公司另有 RPA 从供应商协同平台接口上传待付款申请
      // 区域财务管理员：每周一次全辖抽查
      const uiProb = org.level === 'sub' ? (isEast ? 0.72 : 0.5) : day.getDay() === 1 ? 0.9 : 0;
      if (roll('ui') < uiProb) {
        const hh = 9 + Math.floor(roll('h') * 8);
        out.push({
          id: `B${ds}-${pad(++n, 4)}`,
          time: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6)} ${pad(hh)}:${pad(Math.floor(roll('m') * 60))}:${pad(Math.floor(roll('s') * 60))}`,
          empNo: u.empNo,
          userName: u.name,
          orgCode: u.orgCode,
          source: 'ui',
          fileName: `ERP收付款单据导出_${ds}.xlsx`,
          bizs: roll('b') < 0.2 ? ['receipt', 'payment'] : ['receipt', 'payment', 'settlement'],
          clean: org.level === 'sub' ? 0.18 + roll('c') * 0.14 : 0.55,
          issue: Math.min(0.9, (org.level === 'sub' ? 0.11 : 0.24) * q),
        });
      }
      if (org.level === 'sub' && u.post === 'checker' && roll('api') < (isEast ? 0.6 : 0.25)) {
        out.push({
          id: `B${ds}-${pad(++n, 4)}`,
          time: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6)} 10:${pad(30 + Math.floor(roll('am') * 20))}:${pad(Math.floor(roll('as') * 60))}`,
          empNo: u.empNo,
          userName: `RPA（代 ${u.name}）`,
          orgCode: u.orgCode,
          source: 'api',
          fileName: `供应商协同平台待付款申请_${ds}.xlsx`,
          bizs: ['payment'],
          clean: 0.06 + roll('ac') * 0.06,
          issue: Math.min(0.9, 0.05 * q),
        });
      }
    }
  }
  specs = out.sort((a, b) => b.time.localeCompare(a.time));
  return specs;
}

/** 按批次号确定性抽取记录：三类单据合并成一批 */
export function seedRecords(s: SeedSpec): DocRecord[] {
  return s.bizs.flatMap((b) =>
    mockLedger(b).filter((r) => {
      const p = SCENARIOS[r.key] ? s.issue : s.clean;
      return (hash(`${s.id}|${r.key}`) % 1000) / 1000 < p;
    }),
  );
}
