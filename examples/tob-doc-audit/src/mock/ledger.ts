/**
 * 虚构的 ERP 收付款单据导出（三类）。
 * 组成：按子公司业务画像生成的合规记录 + 逐条设计的疑点情景（SCENARIOS）。
 * 每条疑点情景都写明“业务上是怎么发生的”和“期望智能体怎么判断”，用于和业务对齐理解。
 */
import { BIZ_PREFIX, HEADERS, emptyFields, fromRaw, isRelatedParty, toRaw, type BizType, type DocRecord, type Fields } from '@/domain/docs';
import { pad, rng } from '@/lib/format';
import { COMPANY, COMPANIES, CP, FILLERS, USD_RATE, type Company, type Counterparty } from './parties';

export interface Scenario {
  title: string;
  story: string;
  expect: string;
  rules: string[];
}

export const SCENARIOS: Record<string, Scenario> = {};

/** 演示数据所在的子公司（华东区域）：杭州子公司为主 */
const SUBS = ['110102', '110102', '110102', '110101', '110103', '110104', '110105'] as const;

const DATES = ['20261008', '20261009', '20261012', '20261013'];

/** 大额付款授权门槛（与 R505 默认参数一致） */
const APPROVAL_USD = 100000;

interface Base {
  company: Company;
  cp: Counterparty | { name: string; country: string; bank?: string };
  date: string;
  code: string;
  remark: string;
  amount: number;
  currency?: string;
  nature?: string;
  tradeType?: string;
  subIdx?: number;
}

const seqs: Record<string, number> = {};

function docNo(biz: BizType, org: string, date: string) {
  const k = `${biz}${org}${date}`;
  seqs[k] = (seqs[k] ?? 0) + 1;
  return `${BIZ_PREFIX[biz]}${org}${date}${pad(seqs[k], 4)}`;
}

function addDays(d8: string, n: number) {
  const d = new Date(Number(d8.slice(0, 4)), Number(d8.slice(4, 6)) - 1, Number(d8.slice(6)));
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const money = (n: number) => n.toFixed(2);

function build(biz: BizType, b: Base, r: () => number, patch: Partial<Fields> = {}): Fields {
  const org = SUBS[b.subIdx ?? Math.floor(r() * SUBS.length)];
  const tradeType = b.tradeType ?? '1';
  const currency = b.currency ?? 'USD';
  const conv = r() < 0.3;
  const usd = b.amount * (USD_RATE[currency] ?? 1);
  const filler = FILLERS[Math.floor(r() * FILLERS.length)];
  const valueDate = addDays(b.date, -Math.floor(r() * 2));
  const f = emptyFields();
  Object.assign(f, {
    orgCode: org,
    docNo: docNo(biz, org, b.date),
    tradeType,
    partyType: 'C',
    entityCode: b.company.code,
    domesticName: b.company.name,
    counterparty: b.cp.name,
    country: b.cp.country,
    settle: 'T',
    currency,
    amount: money(b.amount),
    docDate: b.date,
    code1: b.code,
    remark1: b.remark,
    txCur1: currency,
    txAmt1: money(b.amount),
    nature: b.nature ?? 'O',
    approvalNo: biz !== 'receipt' && usd >= APPROVAL_USD ? `OA-2026-${pad(Math.floor(r() * 90000) + 10000, 5)}` : '',
    usdAmt: usd.toFixed(2),
    filler,
    fillerPhone: `0571-8000${pad(Math.floor(r() * 10000), 4)}`,
    lastModified: addDays(b.date, 1),
    source: 'ERP 财务模块导出',
  } satisfies Partial<Fields>);
  if (conv && currency !== 'CNY') {
    f.rate = currency === 'USD' ? '7.1268' : currency === 'EUR' ? '7.7015' : '0.0478';
    f.convAmt = money(b.amount);
    f.cnyAcct = b.company.cnyAcct;
  } else {
    f.fxAmt = money(b.amount);
    f.fxAcct = b.company.fxAcct;
  }
  if (biz === 'receipt') {
    f.bankRef = `BK${valueDate.slice(2)}${pad(Math.floor(r() * 1e6), 6)}`;
    f.cpAcct = `${b.cp.country.slice(0, 2)}${pad(Math.floor(r() * 1e9), 9)}${pad(Math.floor(r() * 1e9), 9)}`;
  } else if (biz === 'payment') {
    f.bankRef = `BK${b.date.slice(2)}${pad(Math.floor(r() * 1e6), 6)}`;
    f.bankName = 'bank' in b.cp && b.cp.bank ? b.cp.bank : 'GLOBAL CORRESPONDENT BANK';
    f.cpAcct = `${b.cp.country.slice(0, 2)}${pad(Math.floor(r() * 1e9), 9)}${pad(Math.floor(r() * 1e9), 9)}`;
  } else {
    f.settle = 'L';
    f.bankRef = `LC${pad(Math.floor(r() * 1e9), 9)}`;
    f.bankName = 'bank' in b.cp && b.cp.bank ? b.cp.bank : 'GLOBAL CORRESPONDENT BANK';
    f.feeDomCur = currency;
    f.feeDomAmt = '120.00';
    f.actualCur = currency;
    f.actualAmt = money(b.amount - 120);
    f.source = 'ERP 进口结算模块导出';
  }
  if (biz !== 'receipt' && b.code.startsWith('1')) {
    f.contractNo = `${b.company.code.slice(-4)}-2026-${pad(Math.floor(r() * 900) + 100, 3)}`;
    f.invoiceNo = `INV${b.date.slice(2, 6)}${pad(Math.floor(r() * 10000), 4)}`;
    f.latestShipDate = b.nature === 'A' ? addDays(b.date, 25 + Math.floor(r() * 30)) : addDays(b.date, -(8 + Math.floor(r() * 30)));
    if (biz === 'settlement') f.billNo = `COSU${pad(Math.floor(r() * 1e8), 8)}`;
  }
  return { ...f, ...patch };
}

/* ---------------- 合规记录生成 ---------------- */

function logAmount(r: () => number, lo = 800, hi = 380000) {
  return Math.round(Math.exp(Math.log(lo) + r() * (Math.log(hi) - Math.log(lo))) * 100) / 100;
}

function currencyFor(cp: Counterparty, r: () => number) {
  if (['DEU', 'ESP', 'CHE'].includes(cp.country) && r() < 0.6) return 'EUR';
  if (cp.country === 'JPN' && r() < 0.4) return 'JPY';
  return 'USD';
}

function pick<T>(xs: readonly T[], r: () => number): T {
  return xs[Math.floor(r() * xs.length)];
}

function projectize(c: Company, remark: string) {
  return c.project ? `战略项目：${remark}` : remark;
}

function cleanReceipt(r: () => number): Base {
  const c = pick(
    COMPANIES.filter((x) => x.profile !== 'importer' && x.profile !== 'holding'),
    r,
  );
  const cp = CP[pick(c.cps, r)];
  const date = pick(DATES, r);
  const currency = currencyFor(cp, r);
  const amount = currency === 'JPY' ? Math.round(logAmount(r, 200000, 30000000)) : logAmount(r);
  const base = { company: c, cp, date, currency, amount };
  switch (c.profile) {
    case 'processing':
      return { ...base, code: '110200', remark: `进料加工项下${c.goods}出口收入` };
    case 'software':
      return { ...base, code: '260200', remark: pick(['计算机软件开发服务费', '软件系统定制开发服务费', '计算机技术服务费'], r) };
    case 'testing':
      return { ...base, code: '270600', remark: `${pick(['电子元器件', '汽车零部件', '医疗器械'], r)}检测服务费` };
    case 'forwarder': {
      const related = isRelatedParty(cp.name);
      const sea = r() < 0.65;
      const remark = sea ? '出口货物海运费' : '空运代理费';
      return { ...base, code: sea ? '210101' : '210209', remark: related ? `收到关联方款项${remark}` : remark, tradeType: related ? '3' : '1' };
    }
    case 'ecommerce':
      return { ...base, code: '120200', remark: `跨境电商平台亚马逊${c.goods}货款` };
    case 'consult':
      return { ...base, code: '270300', remark: '企业管理咨询服务费' };
    default: {
      const pre = r() < 0.35;
      return {
        ...base,
        code: '110100',
        nature: pre ? 'A' : 'O',
        remark: projectize(c, pre ? `一般贸易项下出口${c.goods}预收货款` : `一般贸易项下出口${c.goods}货款`),
      };
    }
  }
}

function cleanPayment(r: () => number): Base {
  const c = pick(COMPANIES.filter((x) => x.profile !== 'holding'), r);
  const cp = CP[pick(c.cps, r)];
  const date = pick(DATES, r);
  const currency = currencyFor(cp, r);
  const amount = currency === 'JPY' ? Math.round(logAmount(r, 150000, 20000000)) : logAmount(r, 500, 260000);
  const base = { company: c, cp, date, currency, amount };
  switch (c.profile) {
    case 'importer': {
      const pre = r() < 0.45;
      return { ...base, code: '110100', nature: pre ? 'A' : 'P', remark: pre ? `一般贸易项下进口${c.goods}预付款` : `一般贸易项下进口${c.goods}货款` };
    }
    case 'forwarder': {
      const related = isRelatedParty(cp.name);
      const sea = r() < 0.7;
      const remark = sea ? '为出口货物支付的海运费' : '空运代理费';
      return { ...base, code: sea ? '210101' : '210209', remark: related ? `向关联方支付款项${remark}` : remark, tradeType: related ? '3' : '1' };
    }
    case 'software':
      return { ...base, code: '260200', remark: '云平台软件服务费' };
    case 'testing':
      return { ...base, code: '270600', remark: `${pick(['CE', 'UL', 'FDA'], r)}产品认证检测费` };
    case 'consult':
      return { ...base, code: '270300', remark: '境外法律咨询服务费' };
    case 'processing':
      return { ...base, code: '110200', nature: 'P', remark: `进料加工项下进口${c.goods}原料货款` };
    default:
      return r() < 0.5
        ? { ...base, code: '270800', remark: `${c.goods ?? '产品'}出口销售佣金` }
        : { ...base, code: '270500', remark: '海外展会展位费' };
  }
}

function cleanSettlement(r: () => number): Base {
  const c = pick(COMPANIES.filter((x) => x.profile === 'importer'), r);
  const cp = CP[pick(c.cps, r)];
  const date = pick(DATES, r);
  const currency = currencyFor(cp, r) === 'JPY' ? 'USD' : currencyFor(cp, r);
  return { company: c, cp, date, currency, amount: logAmount(r, 20000, 1800000), code: '110100', remark: `一般贸易项下进口${c.goods}支出款` };
}

/* ---------------- 疑点情景 ---------------- */

type IssueDef = { biz: BizType; base: Omit<Base, 'date'> & { date?: string }; patch?: Partial<Fields>; scenario: Scenario };

const C = COMPANY;

const ISSUES: IssueDef[] = [
  /* ---------- 收款单 ---------- */
  {
    biz: 'receipt',
    base: { company: C['远帆国际物流有限公司'], cp: CP.orient, code: '110100', remark: '出口货物海运费收入', amount: 18650 },
    scenario: { title: '物流公司把海运费录成货款', story: '物流子公司收到境外船公司结算的出口海运费。财务专员沿用了最常用的一般贸易编码 110100。', expect: '智能体识别用途说明中心语为“海运费”、方向为“出口”，建议改为 210101。', rules: ['R101'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆软件技术有限公司'], cp: CP.nova, code: '110100', remark: '软件系统定制开发服务费', amount: 64200 },
    scenario: { title: '服务收入误用货物编码', story: '软件子公司首次收到境外客户的开发服务费，经办人习惯把所有出口收入都按货物填写。', expect: '用途说明为软件与信息技术服务，属于服务类，建议改为 260200。', rules: ['R101'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆国际物流有限公司'], cp: CP.aurora, code: '210101', remark: '进口货物海运费', amount: 9420.5 },
    scenario: { title: '运输方向选反', story: '物流子公司收到境外代理分摊的进口货物海运费，编码选成了“出口货物”。中类正确、细分方向错误，人工最容易漏看。', expect: '同属海运运费，但方向为进口，建议改为 210102（置信度略低于大类错误）。', rules: ['R101'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆服饰有限公司'], cp: CP.cedar, code: '110100', remark: '货款', amount: 27830 },
    scenario: { title: '用途说明只写“货款”', story: '经办人员图省事，用途说明只填“货款”。集团单据抽查把这类列为用途说明不规范。', expect: '用途说明过于笼统，提示补充贸易方式与商品名称。', rules: ['R102'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆检测技术有限公司'], cp: CP.lumen, code: '270600', remark: '服务费', amount: 5600 },
    scenario: { title: '服务用途只写“服务费”', story: '检测子公司收到境外客户付款，用途说明只写“服务费”，看不出是什么服务。', expect: '编码匹配无法判断（交给笼统规则），用途说明笼统判为疑点。', rules: ['R102'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆精密机械有限公司'], cp: CP.northstar, code: '110100', remark: '战略项目：一般贸易项下出口精密轴承到货收款', amount: 152300, currency: 'EUR', nature: 'A' },
    scenario: { title: '到货收款却选了预收', story: '货已交付、款项到账，但经办人录单时勾选了“预收款”。预收 / 到货会影响应收账龄与资金预测。', expect: '规则预筛发现“预收”与用途说明不一致，智能体确认用途说明为“到货收款”，判为疑点。', rules: ['R502'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆丝绸有限公司'], cp: CP.sakura, code: '110100', remark: '一般贸易项下出口丝绸围巾预收货款', amount: 31500 },
    scenario: { title: '写了预收却没选预收', story: '用途说明写明预收货款，但款项性质保持默认“其他”。', expect: '建议将款项性质修改为 A-预收款。', rules: ['R502'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆管理咨询有限公司'], cp: CP.kingsway, code: '270300', remark: '退款 企业管理咨询服务费', amount: 4800, nature: 'R' },
    scenario: { title: '退款没写原单据编号', story: '境外客户退回多付的咨询费。用途说明写了“退款”，但没有注明原单据编号，无法与原业务勾稽冲销。', expect: '确定性规则：退款须附 20 位原单据编号。', rules: ['R504'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆国际物流有限公司'], cp: CP.yfsg, code: '210101', remark: '出口货物海运费', amount: 12800 },
    scenario: { title: '往来类型错误：关联方当成外部客商', story: '付款方是集团在新加坡的物流子公司（在关联方名单内），应选往来类型 3，经办选了 1。合并报表时这笔往来会漏抵销。', expect: '确定性规则：往来类型与关联方名单不符。', rules: ['R501'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆国际物流有限公司'], cp: CP.yfsg, code: '210109', remark: '船舶代理费', amount: 7350, tradeType: '3' },
    scenario: { title: '关联方往来缺用途前缀', story: '往来类型选对了 3，但用途说明没有以“收到关联方款项”开头。', expect: '确定性规则：往来类型 3 的用途说明前缀要求。', rules: ['R103'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆纺织品进出口有限公司'], cp: CP.bombay, code: '110100', remark: '一般贸易项下出口涤纶面料货款', amount: 48260.35 },
    patch: { txAmt1: '48260.00' },
    scenario: { title: '明细金额取整', story: '经办人把明细金额填成整数，与实际收款金额差几毛钱。', expect: '确定性规则：明细金额合计与收款金额不一致，识别为“疑似取整”。', rules: ['R301'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆新能源科技有限公司'], cp: CP.atlas, code: '110100', remark: '战略项目：一般贸易项下出口光伏组件货款', amount: 120000, currency: 'USD' },
    patch: { convAmt: '50000.00', rate: '7.1268', cnyAcct: '95501860100000010109', fxAmt: '69800.00', fxAcct: '95501860100000010018' },
    scenario: { title: '漏填我方手续费', story: '收款 120,000 美元，部分折算、部分入外币账户，银行扣了 200 美元手续费，但手续费栏没有填。', expect: '本币 + 外币 + 手续费 ≠ 收款金额，提示可能漏填手续费。', rules: ['R302'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆医疗器械有限公司'], cp: { ...CP.kingsway }, code: '110100', remark: '一般贸易项下出口医用敷料货款', amount: 22640 },
    patch: { country: 'CHN' },
    scenario: { title: '境外客户国家/地区填成中国', story: '香港客户付款，经办人员看到中文资料把国家/地区填成了 CHN。', expect: '确定性规则：境外往来国家/地区不得为中国。', rules: ['R401'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆化工有限公司'], cp: CP.sakura, code: '110200', remark: '进料加工项下化工助剂出口收入', amount: 86300 },
    patch: { country: 'USA' },
    scenario: { title: '国家/地区按付款银行所在地填写', story: '日本客户通过美国银行付款，经办人员按付款行所在地填了 USA。', expect: '智能体从对方地址“OSAKA;JP”识别出日本；同时本批次中该对方其余单据均为日本，批次级规则也标出国家/地区不唯一。', rules: ['R403', 'R405'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆纺织品进出口有限公司'], cp: CP.bluewave, code: '110100', remark: '一般贸易项下出口涤纶面料货款', amount: 35420 },
    patch: { country: 'SGP' },
    scenario: { title: '同一交易对方国家/地区不唯一', story: 'BLUEWAVE TEXTILE 在本批次其他收款、付款单据中都填香港，这一笔填了新加坡。名称里没有地址，单看这一笔看不出问题。', expect: '批次级规则：三类单据合并统计，同一交易对方国家/地区不唯一，少数国别的这笔为疑点，建议改为香港。', rules: ['R405'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆新能源科技有限公司'], cp: { name: 'GREENFIELD AGRO (VIETNAM) CO., LTD;HO CHI MINH CITY;VN', country: 'VNM' }, code: '110100', remark: '战略项目：一般贸易项下出口光伏组件货款', amount: 58400 },
    scenario: { title: '误报拦截：客户在越南的子公司', story: 'GREENFIELD AGRO 在马来西亚，本笔对方是它在越南的子公司，名称高度相似、国家不同。', expect: '相似度聚类会把两者归并，智能体发现名称含地区限定词 VIETNAM，判定为不同主体，不计为国别疑点（记为误报拦截）。', rules: [] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆跨境电子商务有限公司'], cp: { name: 'AMAZON SELLER SERVICES', country: 'USA' }, code: '120200', remark: '跨境电商平台亚马逊家居收纳用品货款', amount: 6120.4 },
    scenario: { title: '平台多站点收款（美国站）', story: '跨境电商子公司在亚马逊美国站、英国站都有店铺，同一平台名称分别从美国、英国结算。', expect: '同名不同国别被预筛命中，智能体识别为平台多国收付，排除（误报拦截）。', rules: [] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆跨境电子商务有限公司'], cp: { name: 'AMAZON SELLER SERVICES', country: 'GBR' }, code: '120200', remark: '跨境电商平台亚马逊家居收纳用品货款', amount: 3980.15 },
    scenario: { title: '平台多站点收款（英国站）', story: '同上，英国站结算。', expect: '同上，不计为国别疑点。', rules: [] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆纺织品进出口有限公司'], cp: { name: 'OCEANIC TRADE PARTNERS', country: 'ZZZ' }, code: '110100', remark: '一般贸易项下出口涤纶面料货款', amount: 12800 },
    scenario: { title: '国家/地区填了未分类 ZZZ', story: '经办查不到对方所在国，选了“未分类”。', expect: '确定性规则：国家/地区为 ZZZ 列为疑问数据，提示核实。', rules: ['R407'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆光电科技有限公司'], cp: CP.lumen, code: '', remark: '', amount: 15800, currency: 'EUR' },
    scenario: { title: '漏填类别编码和用途说明', story: '月末集中补录时漏填了类别编码和用途说明就提交了。', expect: '确定性规则：必填项缺失。', rules: ['R201'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆精密模具有限公司'], cp: CP.siam, code: '110100', remark: '战略项目：一般贸易项下出口注塑模具货款', amount: 30000 },
    patch: { fxAmt: '30000.00', fxAcct: '', convAmt: '', cnyAcct: '', rate: '' },
    scenario: { title: '外币金额没有账号', story: '款项入外币账户，但外币账号字段为空。', expect: '确定性规则：账号与金额不对应。', rules: ['R202'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆医疗器械有限公司'], cp: CP.greenfield, code: '110100', remark: '一般贸易项下出口医用敷料货款', amount: 41250, date: '20261012' },
    patch: { bankRef: 'BK260915381926' },
    scenario: { title: '到账近一个月才录入', story: '9 月 15 日到账的款项，业务部门迟迟未提供认领信息，10 月 12 日才录入收款单。', expect: '从银行流水号推断到账日期，超过 5 个工作日时限。', rules: ['R601'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆跨境电子商务有限公司'], cp: CP.meridian, code: '120200', remark: '跨境电商出口家居收纳用品货款', amount: 13870.66 },
    scenario: { title: '跨境电商未注明平台（区域规则）', story: '华东区域要求跨境电商收款写明平台名称，以便按平台对账。集团制度没有这一要求。', expect: '区域规则 R701 命中。', rules: ['R701'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆电子科技有限公司'], cp: CP.vietlink, code: '110100', remark: '一般贸易项下出口电子元器件货款', amount: 58300 },
    scenario: { title: '战略项目未标注（区域规则）', story: '子公司在战略项目名单内，本笔是项目业务，但用途说明没有标注“战略项目”。', expect: '区域规则 R702：依赖区域维护的战略项目名单。', rules: ['R702'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆新材料有限公司'], cp: CP.yfhk, code: '810100', remark: '收到关联方款项：集团内部往来款', amount: 500000, currency: 'EUR', tradeType: '3' },
    scenario: { title: '专用编码用途说明不规范', story: '香港控股公司向子公司下拨资金，编码选对了“集团内资金划转”，但用途说明写成“集团内部往来款”，看不出是资金划转。', expect: '确定性规则 R104：专用编码须使用规定表述。', rules: ['R104'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆检测技术有限公司'], cp: CP.northstar, code: '110100', remark: '电子元器件检测服务费', amount: 15600, currency: 'EUR' },
    patch: { txAmt1: '15000.00' },
    scenario: { title: '一笔多个问题', story: '检测服务费误用货物编码，同时明细金额与收款金额不一致（600 欧元差额）。', expect: '同一笔记录命中两条规则，导出时疑点类型合并显示。', rules: ['R101', 'R301'] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆汽车零部件有限公司'], cp: CP.surya, code: '110100', remark: '战略项目：一般贸易项下出口汽车零部件预收货款（含预收出口空运费150美元）', amount: 36150, nature: 'A' },
    scenario: { title: '误报拦截：货款中含少量运费', story: '用途说明出现“空运费”，单纯关键词规则会误报编码不匹配。实际是货款中合并收取的少量运费，按货物填报可接受。', expect: '智能体识别“（含…）”为补充说明，判定通过，并记为“误报拦截”。', rules: [] },
  },
  {
    biz: 'receipt',
    base: { company: C['远帆检测技术有限公司'], cp: CP.lumen, code: '270600', remark: '光学元件检测服务费', amount: 8800 },
    patch: { country: 'USA' },
    scenario: { title: '弱线索：只能提示人工确认', story: '对方名称为 LUMEN OPTICS GMBH，没有地址。GmbH 多见于德语区，但不能据此断定国别。', expect: '单看这一笔，智能体只能给出“需人工确认”（置信度约 0.6）；放到批次里，该对方其余单据均为德国，批次级规则给出更明确的线索。', rules: ['R403', 'R405'] },
  },

  /* ---------- 付款单 ---------- */
  {
    biz: 'payment',
    base: { company: C['远帆国际物流有限公司'], cp: { name: 'ORIENT PACIFIC SHIPPING LIMITED', country: 'HKG', bank: 'STRAITS UNION BANK' }, code: '210101', remark: '为出口货物支付的海运费', amount: 7350 },
    scenario: { title: '同一船公司换了写法、填成香港', story: '同一家新加坡船公司，这笔付款的收款方写成“ORIENT PACIFIC SHIPPING LIMITED”、国家/地区填了香港；本批次收款、付款中其他写法都填新加坡。', expect: '名称清洗后与“ORIENT PACIFIC SHIPPING PTE. LTD.”相同，智能体判定为同一主体，国家/地区不一致，建议改为新加坡。', rules: ['R406'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆金属贸易有限公司'], cp: CP.andes, code: '110100', remark: '一般贸易项下收到进口铁矿石货款', amount: 186000, nature: 'P' },
    scenario: { title: '付款用途写成“收到”', story: '经办复制了收款单的用途模板，付款单的用途说明写成“收到…货款”。', expect: '确定性规则：付款单的用途说明出现收入类用语，收付方向不符（疑问数据）。', rules: ['R105'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆环保设备有限公司'], cp: CP.northstar, code: '110100', remark: '进口废气处理设备海运费', amount: 6380, currency: 'EUR' },
    scenario: { title: '进口运费录成货款', story: '子公司支付德国供应商代垫的海运费，沿用了设备货款的编码。', expect: '中心语“海运费”+ 方向“进口”，建议 210102。', rules: ['R101'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆生物医药有限公司'], cp: CP.nova, code: '110100', remark: '支付美国生物技术展会展位费', amount: 12400 },
    scenario: { title: '展位费录成货款', story: '子公司参加海外展会支付展位费，经办按“对美国付款都是进口货款”习惯填写。', expect: '展会服务，建议 270500。', rules: ['R101'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆环保设备有限公司'], cp: CP.helvetia, code: '110100', remark: '一般贸易项下进口废气处理设备预付款', amount: 88000, currency: 'EUR', nature: 'P' },
    scenario: { title: '预付款选成到货付款', story: '合同约定 30% 预付，用途说明写了预付款，款项性质却选了到货付款。', expect: '建议款项性质改为 A-预付款。', rules: ['R503'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆金属贸易有限公司'], cp: CP.andes, code: '110100', remark: '一般贸易项下进口铁矿石到货付款', amount: 412600, nature: 'A' },
    scenario: { title: '到货付款选成预付', story: '货已到港，子公司凭单付款，款项性质却选了预付款。', expect: '用途说明写明“到货付款”，与预付矛盾。', rules: ['R503'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆生物医药有限公司'], cp: CP.sakura, code: '110100', remark: '一般贸易项下进口实验试剂货款', amount: 26500, nature: 'P', date: '20261012' },
    patch: { latestShipDate: '20261120' },
    scenario: { title: '到货付款但货还没交付', story: '款项性质选到货付款，但最迟交货日期在一个多月以后，说明货物尚未交付。', expect: '逻辑勾稽：实质是预付款。', rules: ['R506'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆生物医药有限公司'], cp: CP.nova, code: '110100', remark: '退回 实验试剂货款', amount: 3200, nature: 'R' },
    scenario: { title: '退回没写原单据编号', story: '境外供应商退回货款后子公司重新付款，用途说明没有原单据编号。', expect: '确定性规则 R504。', rules: ['R504'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆环保设备有限公司'], cp: CP.lumen, code: '110100', remark: '退款原单据编号FK110102202609180002一般贸易设备款', amount: 5400, currency: 'EUR', nature: 'R' },
    scenario: { title: '付款项下用了“退款”字样（区域规则）', story: '集团制度只要求注明原单据编号，已满足；但华东区域要求付款单项下统一使用“退回”字样。', expect: '集团规则通过，区域规则 R705 提示。', rules: ['R705'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆管理咨询有限公司'], cp: CP.kingsway, code: '270300', remark: '境外咨询顾问服务费', amount: 18000 },
    patch: { country: 'CHN' },
    scenario: { title: '付款对方国家/地区填成中国', story: '香港咨询公司收款，国家/地区误填 CHN。', expect: '确定性规则 R401。', rules: ['R401'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆国际物流有限公司'], cp: { name: '上海远舟物流有限公司', country: 'HKG' }, code: '210101', remark: '出口货物海运费', amount: 7600, tradeType: '4' },
    scenario: { title: '境内往来填了境外国别', story: '向境内物流公司支付外币运费（境内往来），国家/地区却填了香港。', expect: '提示人工确认是否应为境外往来。', rules: ['R402'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆生物医药有限公司'], cp: CP.helvetia, code: '110100', remark: '一般贸易项下进口实验试剂货款', amount: 86500, nature: 'P', currency: 'USD' },
    patch: { convAmt: '60000.00', rate: '7.1268', cnyAcct: '95501860100000015104', fxAmt: '26000.00', fxAcct: '95501860100000015563' },
    scenario: { title: '本币 + 外币不等于付款金额', story: '部分购汇、部分外币账户支付，两项合计比付款金额少 500 美元。', expect: '确定性规则 R302。', rules: ['R302'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆环保设备有限公司'], cp: CP.helvetia, code: '110100', remark: '一般贸易项下进口废气处理设备货款', amount: 168000, nature: 'P' },
    patch: { approvalNo: '' },
    scenario: { title: '大额付款缺审批单号', story: '设备尾款 16.8 万美元，超过 10 万美元授权门槛，但单据上没有 OA 审批单号，可能是先付款后补审批。', expect: '确定性规则 R505：大额付款须有审批单号。', rules: ['R505'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆金属贸易有限公司'], cp: CP.kingsway, code: '110100', remark: '一般贸易项下进口铁矿石货款', amount: 238000, nature: 'P' },
    patch: { invoiceNo: '' },
    scenario: { title: '到货付款缺发票号', story: '集团财务共享中心补充要求：到货付款应填写发票号，便于三单匹配。', expect: '非刚性规则，提示人工确认。', rules: ['R204'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆管理咨询有限公司'], cp: CP.meridian, code: '270300', remark: '费用', amount: 2600 },
    scenario: { title: '用途说明只写“费用”', story: '对外支付服务费，用途说明只写“费用”。', expect: '用途说明笼统。', rules: ['R102'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆国际物流有限公司'], cp: CP.yfsg, code: '210109', remark: '船舶港口代理费', amount: 4100, tradeType: '3' },
    scenario: { title: '向关联方付款缺前缀', story: '往来类型 3，用途说明缺“向关联方支付款项”。', expect: '确定性规则 R103。', rules: ['R103'] },
  },
  {
    biz: 'payment',
    base: { company: C['远帆精密机械有限公司'], cp: CP.atlas, code: '270800', remark: '战略项目：精密轴承出口销售佣金', amount: 9800, currency: 'USD' },
    patch: { txCur1: 'EUR' },
    scenario: { title: '明细币种与付款币种不一致', story: '合同币种为欧元，实际以美元付款，明细币种填了欧元。', expect: '提示人工确认。', rules: ['R304'] },
  },

  /* ---------- 进口结算单 ---------- */
  {
    biz: 'settlement',
    base: { company: C['远帆金属贸易有限公司'], cp: CP.andes, code: '110100', remark: '一般贸易项下进口铁矿石支出款', amount: 1286400 },
    patch: { actualAmt: '1285200.00' },
    scenario: { title: '实付金额对不上', story: '信用证结算扣费 120 美元，实付金额却比结算金额少 1,200 美元，两种扣费口径都对不上（疑似多录一位）。', expect: '确定性规则 R303。', rules: ['R303'] },
  },
  {
    biz: 'settlement',
    base: { company: C['远帆环保设备有限公司'], cp: CP.northstar, code: '110100', remark: '一般贸易项下进口废气处理设备预付款', amount: 156000, currency: 'EUR', nature: 'A' },
    patch: { latestShipDate: '20261130' },
    scenario: { title: '信用证项下预付', story: '信用证一般凭单付款，选预付需要确认是否为预付款信用证。', expect: '提示人工确认。', rules: ['R507'] },
  },
  {
    biz: 'settlement',
    base: { company: C['远帆生物医药有限公司'], cp: CP.nova, code: '110100', remark: '进口实验试剂空运费', amount: 4300 },
    scenario: { title: '空运费录成货款', story: '信用证项下附带支付空运费，编码沿用货款。', expect: '建议 210202。', rules: ['R101'] },
  },
  {
    biz: 'settlement',
    base: { company: C['远帆金属贸易有限公司'], cp: CP.yfhk, code: '110100', remark: '一般贸易项下进口铁矿石支出款', amount: 640000, tradeType: '3' },
    scenario: { title: '向关联方结算缺前缀', story: '收款方为集团香港控股公司（转口结算），用途说明缺规定前缀。', expect: '确定性规则 R103。', rules: ['R103'] },
  },
  {
    biz: 'settlement',
    base: { company: C['远帆环保设备有限公司'], cp: CP.helvetia, code: '110100', remark: '一般贸易项下进口废气处理设备支出款', amount: 254000, currency: 'EUR' },
    patch: { txAmt1: '245000.00' },
    scenario: { title: '明细金额录入错位', story: '254,000 录成了 245,000。', expect: '确定性规则 R301（非取整）。', rules: ['R301'] },
  },
  {
    biz: 'settlement',
    base: { company: C['远帆生物医药有限公司'], cp: CP.helvetia, code: '110100', remark: '一般贸易项下进口实验试剂支出款', amount: 73800, currency: 'EUR' },
    patch: { country: 'DEU' },
    scenario: { title: '瑞士供应商填成德国', story: '收款方地址在苏黎世，经办按“欧元付款”习惯填了德国。', expect: '智能体从地址识别瑞士；本批次该对方其余单据均为瑞士，国家/地区不唯一。', rules: ['R403', 'R405'] },
  },
];

/* ---------------- 组装 ---------------- */

const COUNTS: Record<BizType, number> = { receipt: 128, payment: 86, settlement: 32 };

function generate(biz: BizType): DocRecord[] {
  const r = rng(biz === 'receipt' ? 20261013 : biz === 'payment' ? 20261012 : 20261011);
  const issues = ISSUES.filter((i) => i.biz === biz);
  const nClean = COUNTS[biz] - issues.length;
  const fieldsList: { f: Fields; scenario?: Scenario }[] = [];
  for (let i = 0; i < nClean; i++) {
    const base = biz === 'receipt' ? cleanReceipt(r) : biz === 'payment' ? cleanPayment(r) : cleanSettlement(r);
    fieldsList.push({ f: build(biz, base, r) });
  }
  if (biz === 'receipt') {
    // 境内往来收款（往来类型 4）：只登记基础信息、不填类别编码
    for (const amt of [5300, 11820.4]) {
      const f = build(biz, { company: C['远帆国际物流有限公司'], cp: { name: '上海远舟物流有限公司', country: '' }, date: '20261009', code: '', remark: '', amount: amt, tradeType: '4' }, r, {
        txCur1: '',
        txAmt1: '',
      });
      fieldsList.splice(Math.floor(r() * fieldsList.length), 1, { f });
    }
  }
  // 疑点情景插入到固定的“看起来随机”的位置
  const step = Math.floor(fieldsList.length / (issues.length + 1));
  issues.forEach((iss, k) => {
    const f = build(biz, { ...iss.base, date: iss.base.date ?? DATES[(k * 3) % DATES.length] }, r, iss.patch);
    fieldsList.splice(step * (k + 1) + k, 0, { f, scenario: iss.scenario });
  });
  return fieldsList.map(({ f, scenario }, i) => {
    const rec = fromRaw(biz, toRaw(biz, f), i + 3);
    if (scenario) SCENARIOS[rec.key] = scenario;
    return rec;
  });
}

let cache: Record<BizType, DocRecord[]> | null = null;

export function mockLedger(biz: BizType): DocRecord[] {
  if (!cache) cache = { receipt: generate('receipt'), payment: generate('payment'), settlement: generate('settlement') };
  return cache[biz];
}

export function mockFileName(biz: BizType) {
  return `ERP收付款单据导出_${biz === 'receipt' ? '收款' : biz === 'payment' ? '付款' : '进口结算'}_20261008-20261013.xlsx`;
}

/** 演示“上传失败”的非标准文件：某银行账户流水导出，表头与单据格式不符 */
export const WRONG_FORMAT = {
  fileName: '银行账户交易流水_202610.xlsx',
  header: ['交易日期', '交易时间', '借贷标志', '交易金额', '账户余额', '对方户名', '对方账号', '摘要', '用途'],
  rows: [
    ['20261012', '10:21:33', '贷', '18650.00', '1023376.12', 'ORIENT PACIFIC SHIPPING', 'SG0099120001', '跨境汇入', '运费'],
    ['20261012', '14:02:10', '借', '3200.00', '1020176.12', 'NOVA BIOTECH', 'US7700012239', '跨境汇出', '退回'],
  ],
};

export function headersOf(biz: BizType) {
  return HEADERS[biz];
}
