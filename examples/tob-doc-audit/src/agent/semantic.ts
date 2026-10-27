/**
 * 用途说明语义知识（模拟智能体的“领域知识”）。
 * 真实方案中这部分由大模型 + 规则库召回 + 历史判例完成；原型用关键词主题库模拟其期望行为：
 * 1) 预处理：去除“战略项目：”“收到关联方款项”等标注，去除“（含…）”补充说明；
 * 2) 主题抽取：找出用途说明中出现的交易主题；
 * 3) 中心语判定：中文用途说明的中心语通常在末尾（“…项下出口海运费”），取出现位置最靠后的主题作为交易性质；
 * 4) 方向判定：出口 / 进口 / 第三国货物，决定运输、保险类的细分编码。
 */
export type Direction = 'in' | 'out';

export interface Topic {
  id: string;
  label: string;
  re: RegExp;
  codes: (s: string, dir: Direction) => string[];
  /** 是否属于货物大类（编码首位 1），用于区分“细分编码错误”和“大类错误” */
  goods?: boolean;
}

function flow(s: string, exp: string, imp: string, third: string): string[] {
  if (/第三国|不涉及/.test(s)) return [third];
  if (/进口/.test(s)) return [imp];
  if (/出口/.test(s)) return [exp];
  return [exp, imp, third];
}

export const TOPICS: Topic[] = [
  { id: 'groupFund', label: '集团内资金划转', re: /资金划转|资金归集|资金下拨/, codes: () => ['810100'] },
  { id: 'deposit', label: '保证金与押金', re: /保证金|押金/, codes: () => ['820100'] },
  { id: 'agency', label: '代收代付', re: /代收|代付/, codes: () => ['830100'] },
  { id: 'seaFreight', label: '海运运费', re: /海运费|海运运费|海洋运输(服务)?费|海运服务/, codes: (s) => flow(s, '210101', '210102', '210103') },
  { id: 'seaOther', label: '海运代理及港杂', re: /港杂费|港口(服务|装卸|费|代理)|码头|船舶代理|海运[^，,；;]{0,6}代理|代理海洋运输|海洋运输代理|拖车费|提货费|船舶管理|引航/, codes: () => ['210109'] },
  { id: 'airFreight', label: '空运运费', re: /空运费|空运运费|航空运费/, codes: (s) => flow(s, '210201', '210202', '210203') },
  { id: 'airOther', label: '空运代理及机场服务', re: /空运[^，,；;]{0,6}(代理|装卸|仓储)|机场|空港/, codes: () => ['210209'] },
  { id: 'landOther', label: '陆运代理服务', re: /代理[^，,；;]{0,3}(铁路|公路|陆运)|(铁路|公路|陆运)[^，,；;]{0,3}代理/, codes: () => ['210309'] },
  { id: 'landFreight', label: '陆运运费', re: /铁路运(费|输)|陆运(服务)?费|公路运(输|费)|卡车运/, codes: (s) => flow(s, '210301', '210302', '210303') },
  { id: 'cargoInsurance', label: '货物运输保险', re: /货物运输保险(?!赔款|理赔)|货运险/, codes: (s) => (/进口/.test(s) ? ['220102'] : /出口/.test(s) ? ['220101'] : ['220101', '220102']) },
  { id: 'insuranceAux', label: '保险公估及理赔调查', re: /理赔调查|公估/, codes: () => ['220500'] },
  { id: 'insuranceClaim', label: '保险赔款', re: /保险赔款|险赔款|理赔款/, codes: () => ['420000'] },
  { id: 'insurance', label: '保险保费', re: /保费|保险费|财产险|责任险|一切险/, codes: () => ['220900', '220101', '220102'] },
  { id: 'claim', label: '赔偿 / 索赔', re: /滞期费|索赔|违约金|赔偿款/, codes: () => ['430000'] },
  { id: 'telecom', label: '通信服务', re: /通讯服务|通信服务|网络通讯/, codes: () => ['260100'] },
  { id: 'computer', label: '软件与信息技术服务', re: /软件|计算机|信息技术服务|云服务|云平台|APP|系统开发|平台使用费/i, codes: () => ['260200'] },
  { id: 'techService', label: '技术服务（泛指）', re: /技术服务费|技术服务款|技术咨询|技术支持/, codes: () => ['260200', '270600', '270300'] },
  { id: 'tax', label: '税费', re: /关税|税款|增值税|所得税/, codes: () => [] },
  { id: 'testing', label: '检验检测 / 设计', re: /检测|检验|测试|认证|设计费|图纸/, codes: () => ['270600'] },
  { id: 'rnd', label: '研发服务', re: /研发|委托开发/, codes: () => ['270100'] },
  { id: 'consult', label: '咨询 / 代理 / 知识产权服务', re: /咨询|代理服务|代理费|专利(事务|申请|代理)|商标(注册|代理)|知识产权(代理|认证)|法律服务|审计|人力资源/, codes: () => ['270300', '270200'] },
  { id: 'legal', label: '法律服务', re: /诉讼|律师/, codes: () => ['270200', '270300'] },
  { id: 'headhunt', label: '猎头 / 人力资源服务', re: /猎头/, codes: () => ['270300', '270800'] },
  { id: 'ipLicense', label: '知识产权使用费', re: /许可费|使用费|版权费|特许权|特许经营费|专利技术/, codes: () => ['290100', '290200', '290300', '290400'] },
  { id: 'courier', label: '快递服务', re: /快递|邮递|邮寄费|邮政/, codes: () => ['210400'] },
  { id: 'ads', label: '广告与市场推广', re: /广告|推广|营销/, codes: () => ['270400'] },
  { id: 'exhibition', label: '展会服务', re: /展会|展位|展览|摊位/, codes: () => ['270500'] },
  { id: 'commission', label: '佣金 / 中介', re: /佣金|中介费|中介服务/, codes: () => ['270800'] },
  { id: 'lease', label: '经营性租赁', re: /租赁|租金/, codes: () => ['270700'] },
  { id: 'repair', label: '维修维护', re: /维修|维护费|保养|检修|售后服务/, codes: () => ['280000'] },
  { id: 'education', label: '培训', re: /培训|学费/, codes: () => ['230200'] },
  { id: 'travel', label: '差旅', re: /差旅|机票|住宿/, codes: () => ['230100'] },
  { id: 'salary', label: '劳务报酬', re: /工资|薪酬|劳务费/, codes: () => ['310000'] },
  { id: 'donation', label: '捐赠', re: /捐赠|援助/, codes: () => ['410000'] },
  { id: 'construction', label: '境外工程', re: /承包工程|工程项目/, codes: (_s, dir) => (dir === 'in' ? ['110900', '240100'] : ['240100', '110900']) },
  { id: 'bankFee', label: '银行手续费', re: /手续费|通知费|银行费用/, codes: () => ['250000'] },
  { id: 'processing', label: '加工贸易货物', re: /进料加工|来料加工|加工贸易/, codes: () => ['110200'], goods: true },
  { id: 'reexport', label: '转口贸易', re: /转口贸易|离岸转手/, codes: () => ['120100'], goods: true },
  { id: 'crossEcom', label: '跨境电商货款', re: /跨境电商/, codes: () => ['120200'], goods: true },
  {
    id: 'goods',
    label: '货物货款',
    re: /一般贸易|货物贸易|货款|进口[^，,；;]{0,12}?(设备|材料|产品|原料|矿|配件)|出口[^，,；;]{0,12}?(货物|产品)收入|预收|预付|到货/,
    codes: () => ['110100', '110200', '110900', '120200', '120100'],
    goods: true,
  },
];

const MARKERS = /战略项目[:：]?|收到关联方款项[:：]?|向关联方支付款项[:：]?/g;

export interface Preprocessed {
  original: string;
  cleaned: string;
  removed: string[];
}

export function preprocessRemark(remark: string): Preprocessed {
  const removed: string[] = [];
  let s = remark;
  s = s.replace(MARKERS, (m) => {
    removed.push(m.replace(/[:：]$/, ''));
    return '';
  });
  s = s.replace(/[（(]\s*含[^）)]*[）)]/g, (m) => {
    removed.push(m);
    return '';
  });
  s = s.replace(/退款|退回/g, (m) => {
    removed.push(m);
    return '';
  });
  s = s.replace(/(SK|FK|JS)\d{18}|\d{6,}/g, (m) => {
    removed.push(m);
    return '';
  });
  s = s.replace(/^[\s：:，,。.、]+|[\s：:，,。.、]+$/g, '').replace(/\s+/g, '');
  return { original: remark, cleaned: s, removed };
}

export interface TopicHit {
  topic: Topic;
  /** 最靠后的一次命中 */
  match: string;
  end: number;
  /** 全部命中文本 */
  matches: string[];
}

export function extractTopics(cleaned: string): TopicHit[] {
  const hits: TopicHit[] = [];
  for (const t of TOPICS) {
    const re = new RegExp(t.re.source, t.re.flags.includes('g') ? t.re.flags : `${t.re.flags}g`);
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    const all: string[] = [];
    while ((m = re.exec(cleaned))) {
      last = m;
      all.push(m[0]);
      if (m[0].length === 0) re.lastIndex++;
    }
    if (last) hits.push({ topic: t, match: last[0], end: last.index + last[0].length, matches: all });
  }
  // 中心语在后：按结束位置倒序；同位置时具体主题优先于泛化的“货物货款”
  return hits.sort((a, b) => b.end - a.end || Number(a.topic.id === 'goods') - Number(b.topic.id === 'goods'));
}

/** 过于笼统的用途说明 */
const GENERIC = /^(货款|服务费|费用|往来款|款项|还款|收款|付款|货物|其他|佣金|运费|劳务费|技术费|备用金|预付款|预收款)$/;

export function isGenericRemark(cleaned: string): boolean {
  if (!cleaned) return false;
  return GENERIC.test(cleaned) || cleaned.length <= 2;
}

export const PLATFORM_RE = /亚马逊|AMAZON|EBAY|速卖通|ALIEXPRESS|阿里巴巴|ALIBABA|SHOPEE|TEMU|TIKTOK|LAZADA|WISH|独立站|SHEIN|沃尔玛|WALMART|平台[^，,；;]{0,4}[A-Z]{3,}/i;

/** 专用类别主题：一旦出现即决定交易性质，不再按中心语规则判断 */
export const SPECIAL_TOPICS = new Set(['groupFund', 'deposit', 'agency']);

export function primaryTopic(hits: TopicHit[]): TopicHit | undefined {
  return hits.find((h) => SPECIAL_TOPICS.has(h.topic.id)) ?? hits[0];
}

/** 仅凭“预收 / 预付 / 到货”等收付时点词判定为货款（缺少商品或服务内容），可信度低 */
export function timingOnly(h: TopicHit | undefined) {
  return !!h && h.topic.id === 'goods' && h.matches.every((x) => /^(预收|预付|到货)$/.test(x));
}

export const REFUND_RE = /退款|退回|退还|^退/;
