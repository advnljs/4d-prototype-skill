/**
 * 制度文件解读演示数据（集团制度、填写规范手册、区域通知，全部为虚构）。
 * 条款内容为原型编写的概括摘要；正式实施时上传原文由 AI 解读。
 */
export type ClauseMap = { kind: 'covered'; rules: string[] } | { kind: 'new'; draft: string; engine: 'code' | 'agent' } | { kind: 'manual'; reason: string };

export interface Clause {
  no: string;
  summary: string;
  checkable: 'code' | 'agent' | 'none';
  map: ClauseMap;
}

export interface PolicyDoc {
  id: string;
  title: string;
  kind: string;
  pages: number;
  clauses: Clause[];
}

export const POLICIES: PolicyDoc[] = [
  {
    id: 'p1',
    title: '《远帆集团资金收付管理制度（2026 版）》',
    kind: '集团制度',
    pages: 42,
    clauses: [
      { no: '4.10.1 等', summary: '按类别编码逐项核查用途说明是否与编码描述的交易性质相符（货物、运输、软件服务等）。', checkable: 'agent', map: { kind: 'covered', rules: ['R101', 'R102'] } },
      { no: '4.1.1 / 4.1.2', summary: '收款单的用途说明出现付出类用语、付款单的用途说明出现收入类用语，视为收付方向与用途说明不符。', checkable: 'code', map: { kind: 'covered', rules: ['R105'] } },
      { no: '4.2.1', summary: '境外交易对方的国家/地区填为中国的，属填写错误。', checkable: 'code', map: { kind: 'covered', rules: ['R401'] } },
      { no: '4.2.3.1', summary: '交易对方名称相同但国家/地区不同（三类单据合并核查）。', checkable: 'code', map: { kind: 'covered', rules: ['R405', 'R406'] } },
      { no: '4.2.5', summary: '交易对方国家/地区为未分类代码 ZZZ 的，列为疑问数据。', checkable: 'code', map: { kind: 'covered', rules: ['R407'] } },
      { no: '4.4.2 / 4.4.3', summary: '明细金额、本币 / 外币 / 其他金额之和与单据金额不平衡。', checkable: 'code', map: { kind: 'covered', rules: ['R301', 'R302', 'R303'] } },
      { no: '4.7.1.2', summary: '退款未在用途说明中注明原单据编号。', checkable: 'code', map: { kind: 'covered', rules: ['R504'] } },
      { no: '5.2', summary: '单笔折美元 10 万及以上的付款须经 OA 授权审批。', checkable: 'code', map: { kind: 'covered', rules: ['R505'] } },
      { no: '4.3.1', summary: '交易对方名称含“BANK / 银行”，但类别编码不是金融服务类。', checkable: 'code', map: { kind: 'new', draft: '交易对方名称含 BANK / 银行（剔除 LIMITED、CO 等公司后缀与“代付”等用途说明）而类别编码不在金融服务类编码清单内的，列为疑问数据', engine: 'code' } },
      { no: '1.2', summary: '客商主数据的准入、变更与年审要求。', checkable: 'none', map: { kind: 'manual', reason: '需要客商主数据变更记录，上传的三类单据中没有，事前核查无法覆盖，建议由主数据流程管控。' } },
      { no: '3.4', summary: '作废单据须说明作废理由。', checkable: 'none', map: { kind: 'manual', reason: '需要单据作废记录，三类单据导出中没有，建议由 ERP 流程管控。' } },
    ],
  },
  {
    id: 'p2',
    title: '《单据填写规范与常见问题手册（2025 版）》',
    kind: '集团手册',
    pages: 118,
    clauses: [
      { no: '2 / 2.1', summary: '货物类单据基本原则：按贸易方式选择编码，用途说明写明贸易方式与商品。', checkable: 'agent', map: { kind: 'covered', rules: ['R101', 'R102'] } },
      { no: '3.1 / 3.2', summary: '海运、空运运费按出口货物、进口货物、第三国货物区分编码。', checkable: 'agent', map: { kind: 'covered', rules: ['R101'] } },
      { no: '2.6', summary: '跨境电商单据填写示例。', checkable: 'code', map: { kind: 'covered', rules: ['R701'] } },
      { no: '7', summary: '退款和错付款：注明原单据编号与退款 / 退回字样。', checkable: 'code', map: { kind: 'covered', rules: ['R504', 'R705'] } },
      { no: '9.3', summary: '国家/地区填写原则：按交易对方实际所在国家/地区填写。', checkable: 'agent', map: { kind: 'covered', rules: ['R401', 'R403', 'R405'] } },
      { no: '9.4', summary: '一笔款项涉及多种交易性质时，按性质分别填写类别编码与金额。', checkable: 'agent', map: { kind: 'new', draft: '用途说明同时描述货物与运费等多项性质、却只填一个类别编码且无“含…”说明时提示拆分明细', engine: 'agent' } },
    ],
  },
  {
    id: 'p3',
    title: '华东区域财务中心：关于规范跨境电商与战略项目单据的通知（示意）',
    kind: '区域通知',
    pages: 3,
    clauses: [
      { no: '第一条', summary: '跨境电商收款用途说明应注明销售平台。', checkable: 'code', map: { kind: 'covered', rules: ['R701'] } },
      { no: '第二条', summary: '战略项目子公司的货物类单据应在用途说明中标注“战略项目”。', checkable: 'code', map: { kind: 'covered', rules: ['R702'] } },
      { no: '第三条', summary: '付款单项下的退款统一使用“退回”字样。', checkable: 'code', map: { kind: 'covered', rules: ['R705'] } },
    ],
  },
];
