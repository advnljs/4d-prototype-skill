/** 国别字典（原型子集）：ISO 3166 三位码 → 中文名；二位码、城市/国名关键词用于“地址中的国别线索”识别 */
export const COUNTRIES: Record<string, string> = {
  CHN: '中国', HKG: '中国香港', MAC: '中国澳门', TWN: '中国台湾', USA: '美国', JPN: '日本', KOR: '韩国',
  SGP: '新加坡', DEU: '德国', GBR: '英国', FRA: '法国', ITA: '意大利', ESP: '西班牙', NLD: '荷兰', BEL: '比利时',
  CHE: '瑞士', AUT: '奥地利', SWE: '瑞典', NOR: '挪威', DNK: '丹麦', FIN: '芬兰', POL: '波兰', CZE: '捷克',
  TUR: '土耳其', RUS: '俄罗斯', BLR: '白俄罗斯', UKR: '乌克兰', GRC: '希腊', VNM: '越南', THA: '泰国',
  MYS: '马来西亚', IDN: '印度尼西亚', PHL: '菲律宾', KHM: '柬埔寨', IND: '印度', PAK: '巴基斯坦', BGD: '孟加拉国',
  ARE: '阿联酋', SAU: '沙特阿拉伯', ISR: '以色列', EGY: '埃及', NGA: '尼日利亚', ZAF: '南非', KEN: '肯尼亚',
  AUS: '澳大利亚', NZL: '新西兰', CAN: '加拿大', MEX: '墨西哥', BRA: '巴西', ARG: '阿根廷', CHL: '智利', PER: '秘鲁',
  MHL: '马绍尔群岛', VGB: '英属维尔京群岛', WSM: '萨摩亚', CYM: '开曼群岛', PAN: '巴拿马', LBR: '利比里亚',
  EST: '爱沙尼亚', MUS: '毛里求斯', LUX: '卢森堡', KAZ: '哈萨克斯坦',
};

export function countryLabel(code: string) {
  if (!code) return '（空）';
  return COUNTRIES[code] ? `${code} ${COUNTRIES[code]}` : code;
}

export const ISO2: Record<string, string> = {
  CN: 'CHN', HK: 'HKG', MO: 'MAC', TW: 'TWN', US: 'USA', JP: 'JPN', KR: 'KOR', SG: 'SGP', DE: 'DEU', GB: 'GBR',
  UK: 'GBR', FR: 'FRA', IT: 'ITA', ES: 'ESP', NL: 'NLD', BE: 'BEL', CH: 'CHE', AT: 'AUT', SE: 'SWE', NO: 'NOR',
  DK: 'DNK', FI: 'FIN', PL: 'POL', CZ: 'CZE', TR: 'TUR', RU: 'RUS', BY: 'BLR', UA: 'UKR', GR: 'GRC', VN: 'VNM',
  TH: 'THA', MY: 'MYS', ID: 'IDN', PH: 'PHL', KH: 'KHM', IN: 'IND', PK: 'PAK', BD: 'BGD', AE: 'ARE', SA: 'SAU',
  IL: 'ISR', EG: 'EGY', NG: 'NGA', ZA: 'ZAF', KE: 'KEN', AU: 'AUS', NZ: 'NZL', CA: 'CAN', MX: 'MEX', BR: 'BRA',
  AR: 'ARG', CL: 'CHL', PE: 'PER',
};

/** 城市 / 国名关键词（强线索） */
export const PLACE_HINTS: [RegExp, string][] = [
  [/\bHONG ?KONG\b|\bKOWLOON\b|\bKWUN TONG\b|\bTSIM SHA TSUI\b/, 'HKG'],
  [/\bSINGAPORE\b/, 'SGP'],
  [/\bTOKYO\b|\bOSAKA\b|\bNAGOYA\b|\bYOKOHAMA\b|\bKOBE\b|\bJAPAN\b/, 'JPN'],
  [/\bSEOUL\b|\bBUSAN\b|\bINCHEON\b|\bKOREA\b/, 'KOR'],
  [/\bUNITED STATES\b|\bU\.?S\.?A\b|\bNEW YORK\b|\bLOS ANGELES\b|\bHOUSTON\b|\bCHICAGO\b|\bBOSTON\b/, 'USA'],
  [/\bGERMANY\b|\bHAMBURG\b|\bMUNICH\b|\bMUENCHEN\b|\bFRANKFURT\b|\bBERLIN\b|\bSTUTTGART\b/, 'DEU'],
  [/\bUNITED KINGDOM\b|\bLONDON\b|\bSOUTHAMPTON\b|\bMANCHESTER\b|\bENGLAND\b/, 'GBR'],
  [/\bFRANCE\b|\bPARIS\b|\bLYON\b/, 'FRA'],
  [/\bITALY\b|\bMILANO\b|\bMILAN\b|\bTORINO\b/, 'ITA'],
  [/\bSPAIN\b|\bMADRID\b|\bBARCELONA\b/, 'ESP'],
  [/\bVIETNAM\b|\bVIET NAM\b|\bHANOI\b|\bHO CHI MINH\b|\bHAI PHONG\b/, 'VNM'],
  [/\bTHAILAND\b|\bBANGKOK\b/, 'THA'],
  [/\bMALAYSIA\b|\bKUALA LUMPUR\b|\bSELANGOR\b|\bPENANG\b/, 'MYS'],
  [/\bINDONESIA\b|\bJAKARTA\b|\bSURABAYA\b/, 'IDN'],
  [/\bINDIA\b|\bMUMBAI\b|\bNEW DELHI\b|\bCHENNAI\b|\bBANGALORE\b/, 'IND'],
  [/\bDUBAI\b|\bABU DHABI\b|\bU\.?A\.?E\b|\bSHARJAH\b/, 'ARE'],
  [/\bCANADA\b|\bTORONTO\b|\bVANCOUVER\b|\bMONTREAL\b/, 'CAN'],
  [/\bAUSTRALIA\b|\bSYDNEY\b|\bMELBOURNE\b/, 'AUS'],
  [/\bBRAZIL\b|\bBRASIL\b|\bSAO PAULO\b/, 'BRA'],
  [/\bPERU\b|\bLIMA\b/, 'PER'],
  [/\bSWITZERLAND\b|\bZURICH\b|\bGENEVA\b|\bBASEL\b/, 'CHE'],
  [/\bAUSTRIA\b|\bVIENNA\b|\bWIEN\b/, 'AUT'],
  [/\bNETHERLANDS\b|\bAMSTERDAM\b|\bROTTERDAM\b/, 'NLD'],
];

/** 法律形式后缀（弱线索：只能说明“可能的”国别范围） */
export const LEGAL_FORM_HINTS: [RegExp, string[], string][] = [
  [/\bGMBH\b/, ['DEU', 'AUT', 'CHE'], 'GmbH（德语区有限责任公司）'],
  [/\bPTE\.? LTD\b/, ['SGP'], 'Pte. Ltd.（新加坡私人有限公司）'],
  [/\bSDN\.? BHD\b/, ['MYS'], 'Sdn. Bhd.（马来西亚私人有限公司）'],
  [/^PT\b|\bPT\.? /, ['IDN'], 'PT（印尼有限责任公司）'],
  [/\bK\.?K\.?\b|\bKABUSHIKI\b/, ['JPN'], 'K.K.（日本株式会社）'],
  [/\bJSC\b/, ['VNM', 'RUS', 'KAZ'], 'JSC（股份公司，常见于越南/独联体）'],
  [/\bPVT\.? LTD\b/, ['IND', 'PAK', 'BGD'], 'Pvt. Ltd.（南亚私人有限公司）'],
  [/\bFZE\b|\bFZCO\b|\bFZ-LLC\b/, ['ARE'], 'FZE（阿联酋自贸区公司）'],
  [/\bLTDA\b/, ['BRA', 'COL', 'PRT'], 'Ltda.（葡语/西语区有限公司）'],
  [/\bS\.?A\.?C\b/, ['PER'], 'S.A.C.（秘鲁封闭式股份公司）'],
];
