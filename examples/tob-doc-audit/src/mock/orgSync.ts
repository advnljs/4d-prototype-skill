import { ORGS, USER_ORG, type RoleKey } from '@/domain/orgs';

/**
 * 每日 07:00 主数据同步的演示记录（虚构）：统一认证 / 人力系统 → doc_user_org。
 * 今天的三条变更都已反映在 USER_ORG 里（入职、调岗后的组织；离职者已不在表中）。
 */
export interface OrgChange {
  kind: '入职' | '调岗' | '离职';
  empNo: string;
  name: string;
  post: RoleKey;
  from?: string;
  to?: string;
  note: string;
}

export const ORG_SYNC = {
  at: '2026-10-14 07:00',
  source: '统一认证 / 人力系统（模拟）',
  people: USER_ORG.length,
  orgs: ORGS.length,
  changes: [
    { kind: '入职', empNo: 'F0021738', name: '许航', post: 'checker', to: '110105', note: '新建账号；核查时使用华东区域规则库，结果只看本公司' },
    { kind: '调岗', empNo: 'F0021690', name: '王凯', post: 'checker', from: '110102', to: '110103', note: '同属华东，规则库不变；历史批次仍属原公司' },
    { kind: '离职', empNo: 'F0021599', name: '周强', post: 'checker', from: '110104', note: '账号停用，不能再登录与上传' },
  ] as OrgChange[],
};
