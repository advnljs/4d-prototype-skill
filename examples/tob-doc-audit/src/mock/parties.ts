/**
 * 虚构的集团子公司（本方单位）与境外交易对方（不对应任何真实主体）。
 * 每家子公司带有“业务画像”，生成干净记录时按画像选择类别编码与用途说明，保证数据在业务上自洽。
 */
export interface Company {
  name: string;
  code: string; // 本方主体代码（虚构）
  goods?: string;
  profile: 'exporter' | 'importer' | 'software' | 'testing' | 'forwarder' | 'ecommerce' | 'processing' | 'consult' | 'holding';
  /** 战略项目主体（R702 使用） */
  project?: boolean;
  fxAcct: string;
  cnyAcct: string;
  cps: string[]; // 常用交易对方 id
}

export interface Counterparty {
  id: string;
  name: string; // 含地址
  country: string;
  bank?: string;
}

export const COUNTERPARTIES: Counterparty[] = [
  { id: 'northstar', name: 'NORTHSTAR MACHINERY GMBH;HAMBURG 20457;DE', country: 'DEU', bank: 'HANSEATIC COMMERCE BANK AG' },
  { id: 'sakura', name: 'SAKURA FINE CHEMICAL CO., LTD.;2-14 HONMACHI CHUO-KU;OSAKA;JP', country: 'JPN', bank: 'KANSAI TRUST BANK LTD' },
  { id: 'bluewave', name: 'BLUEWAVE TEXTILE CO., LIMITED', country: 'HKG', bank: 'HARBOUR CITY BANK LIMITED' },
  { id: 'meridian', name: 'MERIDIAN TRADING LLC;1200 SMITH ST;HOUSTON TX 77002;US', country: 'USA', bank: 'GULF STATES NATIONAL BANK' },
  { id: 'orient', name: 'ORIENT PACIFIC SHIPPING PTE. LTD.;SINGAPORE 068898', country: 'SGP', bank: 'STRAITS UNION BANK' },
  { id: 'surya', name: 'PT SURYA ABADI ELEKTRIK;JL GATOT SUBROTO 21;JAKARTA;ID', country: 'IDN' },
  { id: 'greenfield', name: 'GREENFIELD AGRO SDN BHD;KUALA LUMPUR;MY', country: 'MYS' },
  { id: 'hanbit', name: 'HANBIT PRECISION CO., LTD;GANGNAM-GU;SEOUL;KR', country: 'KOR' },
  { id: 'vietlink', name: 'VIETLINK COMPONENTS JSC;HAI PHONG;VN', country: 'VNM' },
  { id: 'atlas', name: 'ATLAS INGENIERIA S.A.;CALLE ALCALA 50;MADRID;ES', country: 'ESP' },
  { id: 'kingsway', name: 'KINGSWAY GLOBAL LIMITED', country: 'HKG' },
  { id: 'nova', name: 'NOVA BIOTECH INC.;BOSTON MA 02110;US', country: 'USA' },
  { id: 'lumen', name: 'LUMEN OPTICS GMBH', country: 'DEU' },
  { id: 'siam', name: 'SIAM POLYMER CO., LTD.;BANGKOK;TH', country: 'THA' },
  { id: 'cedar', name: 'CEDAR HOME FURNISHING LTD;TORONTO ON;CA', country: 'CAN' },
  { id: 'bombay', name: 'DECCAN TEXTILE MILLS PVT LTD;MUMBAI;IN', country: 'IND' },
  { id: 'aurora', name: 'AURORA CARGO LOGISTICS LTD;SOUTHAMPTON;GB', country: 'GBR' },
  { id: 'desert', name: 'DESERT ROSE TRADING FZE;JEBEL ALI;DUBAI;AE', country: 'ARE' },
  { id: 'rioverde', name: 'RIO VERDE COMERCIO LTDA;SAO PAULO;BR', country: 'BRA' },
  { id: 'andes', name: 'ANDES MINERALES S.A.C.;LIMA;PE', country: 'PER' },
  { id: 'helvetia', name: 'HELVETIA PRECISION TOOLS AG;ZURICH;CH', country: 'CHE' },
  // 集团内关联方（境外）：往来类型应为 3
  { id: 'yfhk', name: 'YUANFAN HOLDINGS (HK) LIMITED', country: 'HKG' },
  { id: 'yfsg', name: 'YUANFAN LOGISTICS (SINGAPORE) PTE. LTD.', country: 'SGP' },
];

export const CP = Object.fromEntries(COUNTERPARTIES.map((c) => [c.id, c])) as Record<string, Counterparty>;

export const COMPANIES: Company[] = [
  { name: '远帆精密机械有限公司', code: 'YF0101', goods: '精密轴承', profile: 'exporter', project: true, fxAcct: '95501860100000001218', cnyAcct: '95501860100000001101', cps: ['northstar', 'hanbit', 'atlas', 'helvetia'] },
  { name: '远帆电子科技有限公司', code: 'YF0102', goods: '电子元器件', profile: 'exporter', project: true, fxAcct: '95501860100000002237', cnyAcct: '95501860100000002105', cps: ['vietlink', 'hanbit', 'meridian'] },
  { name: '远帆纺织品进出口有限公司', code: 'YF0103', goods: '涤纶面料', profile: 'exporter', fxAcct: '95501860100000003341', cnyAcct: '95501860100000003109', cps: ['bluewave', 'bombay', 'cedar', 'rioverde'] },
  { name: '远帆化工有限公司', code: 'YF0104', goods: '化工助剂', profile: 'processing', fxAcct: '95501860100000004452', cnyAcct: '95501860100000004102', cps: ['sakura', 'siam', 'desert'] },
  { name: '远帆软件技术有限公司', code: 'YF0105', profile: 'software', fxAcct: '95501860100000005563', cnyAcct: '95501860100000005103', cps: ['meridian', 'nova', 'hanbit'] },
  { name: '远帆检测技术有限公司', code: 'YF0106', profile: 'testing', fxAcct: '95501860100000006674', cnyAcct: '95501860100000006104', cps: ['northstar', 'sakura', 'lumen'] },
  { name: '远帆国际物流有限公司', code: 'YF0107', profile: 'forwarder', fxAcct: '95501860100000007785', cnyAcct: '95501860100000007106', cps: ['orient', 'aurora', 'yfsg'] },
  { name: '远帆跨境电子商务有限公司', code: 'YF0108', goods: '家居收纳用品', profile: 'ecommerce', fxAcct: '95501860100000008896', cnyAcct: '95501860100000008107', cps: ['meridian', 'cedar'] },
  { name: '远帆汽车零部件有限公司', code: 'YF0109', goods: '汽车零部件', profile: 'exporter', project: true, fxAcct: '95501860100000009907', cnyAcct: '95501860100000009108', cps: ['northstar', 'meridian', 'surya'] },
  { name: '远帆新能源科技有限公司', code: 'YF0110', goods: '光伏组件', profile: 'exporter', project: true, fxAcct: '95501860100000010018', cnyAcct: '95501860100000010109', cps: ['atlas', 'desert', 'rioverde', 'greenfield'] },
  { name: '远帆丝绸有限公司', code: 'YF0111', goods: '丝绸围巾', profile: 'exporter', fxAcct: '95501860100000011129', cnyAcct: '95501860100000011100', cps: ['bluewave', 'aurora', 'sakura'] },
  { name: '远帆医疗器械有限公司', code: 'YF0112', goods: '医用敷料', profile: 'exporter', fxAcct: '95501860100000012230', cnyAcct: '95501860100000012101', cps: ['nova', 'greenfield', 'surya'] },
  { name: '远帆环保设备有限公司', code: 'YF0113', goods: '废气处理设备', profile: 'importer', fxAcct: '95501860100000013341', cnyAcct: '95501860100000013102', cps: ['northstar', 'helvetia', 'lumen'] },
  { name: '远帆金属贸易有限公司', code: 'YF0114', goods: '铁矿石', profile: 'importer', fxAcct: '95501860100000014452', cnyAcct: '95501860100000014103', cps: ['andes', 'kingsway'] },
  { name: '远帆生物医药有限公司', code: 'YF0115', goods: '实验试剂', profile: 'importer', fxAcct: '95501860100000015563', cnyAcct: '95501860100000015104', cps: ['nova', 'helvetia', 'sakura'] },
  { name: '远帆管理咨询有限公司', code: 'YF0116', profile: 'consult', fxAcct: '95501860100000016674', cnyAcct: '95501860100000016105', cps: ['kingsway', 'meridian'] },
  { name: '远帆光电科技有限公司', code: 'YF0117', goods: '光学镜片', profile: 'exporter', project: true, fxAcct: '95501860100000017785', cnyAcct: '95501860100000017106', cps: ['lumen', 'hanbit', 'vietlink'] },
  { name: '远帆精密模具有限公司', code: 'YF0118', goods: '注塑模具', profile: 'exporter', project: true, fxAcct: '95501860100000018896', cnyAcct: '95501860100000018107', cps: ['surya', 'vietlink', 'siam'] },
  { name: '远帆服饰有限公司', code: 'YF0119', goods: '针织服装', profile: 'exporter', fxAcct: '95501860100000019907', cnyAcct: '95501860100000019108', cps: ['bluewave', 'cedar', 'aurora'] },
  { name: '远帆新材料有限公司', code: 'YF0120', profile: 'holding', fxAcct: '95501860100000020018', cnyAcct: '95501860100000020109', cps: ['helvetia', 'yfhk'] },
];

export const COMPANY = Object.fromEntries(COMPANIES.map((c) => [c.name, c])) as Record<string, Company>;

/** 战略项目主体名单（R702 使用；名单中特意少放一家，便于演示名单维护） */
export const PROJECT_ENTITIES = new Set(
  ['远帆精密机械有限公司', '远帆电子科技有限公司', '远帆汽车零部件有限公司', '远帆新能源科技有限公司', '远帆光电科技有限公司', '远帆精密模具有限公司'].map((n) => COMPANY[n].code),
);

export const FILLERS = ['王芳', '刘洋', '陈静', '赵磊', '孙婷', '周凯', '吴倩', '郑浩', '冯雪', '褚航'];

/** 折美元汇率（原型固定值） */
export const USD_RATE: Record<string, number> = { USD: 1, EUR: 1.08, JPY: 0.0067, HKD: 0.128, CNY: 0.139, GBP: 1.27, SGD: 0.74, CHF: 1.12 };
