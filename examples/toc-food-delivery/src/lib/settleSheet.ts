/**
 * 结算对账文件的版式模型：结算中心页面预览、格式样例与真实下载共用同一个模型（所见即所下）。
 */
import { balanced, summarize, type SettleLine } from '@/domain/settlement';
import { DEMO_DATE, MERCHANT } from '@/domain/catalog';
import type { XSheet } from './xlsx/writer';

const y = (fen: number) => Math.round(fen) / 100;

export const SETTLE_HEADERS = ['订单号', '下单时间', '商品原价', '包装费', '配送费', '商家满减', '平台券', '用户实付', '佣金', '商家应得', '骑手收入', '通道费', '平台净收入', '勾稽'];

export function settleFileName() {
  return `结算对账_${MERCHANT.id}_${DEMO_DATE.replace(/-/g, '')}.xlsx`;
}

export function settlementSheet(lines: SettleLine[], highlight?: string): XSheet {
  const s = summarize(lines);
  return {
    name: '结算明细',
    widths: [22, 9, 9, 8, 8, 9, 8, 9, 8, 9, 9, 8, 10, 9],
    freezeRows: 3,
    rows: [
      { cells: [{ v: `结算单 ${DEMO_DATE}（元）`, s: 'title' }], height: 26 },
      {
        style: 'summary',
        cells: [
          `合计 ${s.orders} 笔`,
          '',
          y(lines.reduce((a, l) => a + l.goods, 0)),
          y(lines.reduce((a, l) => a + l.pack, 0)),
          y(lines.reduce((a, l) => a + l.delivery, 0)),
          y(s.merchantOff),
          y(s.couponOff),
          y(s.payable),
          y(s.commission),
          y(s.merchantNet),
          y(s.rider),
          y(s.channelFee),
          y(s.platformNet),
          s.unbalanced ? `不平 ${s.unbalanced}` : '全部平衡',
        ],
      },
      { style: 'header', cells: SETTLE_HEADERS, height: 22 },
      ...lines.map((l) => ({
        style: l.orderNo === highlight ? ('summary' as const) : ('bordered' as const),
        cells: [l.orderNo, l.time, y(l.goods), y(l.pack), y(l.delivery), y(l.merchantOff), y(l.couponOff), y(l.payable), y(l.commission), y(l.merchantNet), y(l.rider.total), y(l.channelFee), y(l.platformNet), balanced(l) ? '平' : '不平'],
      })),
    ],
  };
}
