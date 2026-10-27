/**
 * 支付网关（外部系统，原型中为模拟环境）：下单请求、异步回调、退款。
 * 平台收到回调后：验签 → 金额一致 → 按网关流水号 trade_no 幂等（同一 trade_no 只处理一次）→ 回 ack。
 * 网关在未收到 ack 时会重发回调，所以“重复回调”是正常现象，必须幂等处理（见情景“回调重复”）。
 * 报文字段、签名方式均为原型建议（见 Q-02），签名用哈希模拟，不代表任何真实网关。
 */
import { hash } from '@/lib/format';

export const NOTIFY_URL = 'https://api.chengzi-daojia.example/pay/notify';
export const GATEWAY_APP_ID = 'CZDJ-DEMO-APP';

export interface PayRequest {
  app_id: string;
  out_trade_no: string;
  total_amount: number;
  currency: 'CNY';
  subject: string;
  notify_url: string;
  expire_minutes: number;
  nonce: string;
  sign: string;
}

export interface PayCallback {
  app_id: string;
  out_trade_no: string;
  trade_no: string;
  total_amount: number;
  trade_status: 'SUCCESS' | 'CLOSED';
  paid_at: string;
  notify_id: string;
  sign: string;
}

export type CallbackResult = { result: 'processed' } | { result: 'ignored'; reason: string } | { result: 'rejected'; reason: string };

export interface RefundRequest {
  out_trade_no: string;
  trade_no: string;
  out_refund_no: string;
  refund_amount: number;
  reason: string;
  sign: string;
}

export interface RefundCallback {
  out_refund_no: string;
  refund_no: string;
  refund_amount: number;
  refund_status: 'SUCCESS';
  refunded_at: string;
  sign: string;
}

/** 模拟签名：对字段按字母序拼接后取哈希 */
export function mockSign(fields: object) {
  const f = fields as Record<string, unknown>;
  const raw = Object.keys(f)
    .filter((k) => k !== 'sign')
    .sort()
    .map((k) => `${k}=${String(f[k])}`)
    .join('&');
  return `MOCK-${hash(raw).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function payRequest(orderNo: string, amount: number, subject: string): PayRequest {
  const base = { app_id: GATEWAY_APP_ID, out_trade_no: orderNo, total_amount: amount, currency: 'CNY' as const, subject, notify_url: NOTIFY_URL, expire_minutes: 15, nonce: hash(orderNo).toString(36) };
  return { ...base, sign: mockSign(base) };
}

/** 网关流水号：由平台订单号确定性生成（模拟） */
export function tradeNoOf(orderNo: string) {
  return `GW${orderNo.slice(2, 10)}${String(hash(orderNo) % 1e8).padStart(8, '0')}`;
}

export function payCallback(req: PayRequest, paidAt: string, seq = 1): PayCallback {
  const base = {
    app_id: req.app_id,
    out_trade_no: req.out_trade_no,
    trade_no: tradeNoOf(req.out_trade_no),
    total_amount: req.total_amount,
    trade_status: 'SUCCESS' as const,
    paid_at: paidAt,
    notify_id: `N${hash(`${req.out_trade_no}-${seq}`).toString(36).toUpperCase()}`,
  };
  return { ...base, sign: mockSign(base) };
}

/**
 * 平台的回调处理：processed 表示本次真正改了订单状态；ignored 表示已处理过（幂等）；rejected 表示验签或金额不通过。
 * processedTradeNos 由调用方保存（正式环境是带唯一索引的支付流水表）。
 */
export function handleCallback(cb: PayCallback, expectAmount: number, processedTradeNos: string[]): CallbackResult {
  if (mockSign(cb) !== cb.sign) return { result: 'rejected', reason: '验签失败' };
  if (cb.total_amount !== expectAmount) return { result: 'rejected', reason: `金额不一致：回调 ${cb.total_amount} 分，订单 ${expectAmount} 分` };
  if (processedTradeNos.includes(cb.trade_no)) return { result: 'ignored', reason: `trade_no ${cb.trade_no} 已处理，直接回 ack，不重复推送商家` };
  return { result: 'processed' };
}

export function refundRequest(orderNo: string, tradeNo: string, amount: number, reason: string): RefundRequest {
  const base = { out_trade_no: orderNo, trade_no: tradeNo, out_refund_no: `RF${orderNo.slice(2)}`, refund_amount: amount, reason };
  return { ...base, sign: mockSign(base) };
}

export function refundCallback(req: RefundRequest, at: string): RefundCallback {
  const base = { out_refund_no: req.out_refund_no, refund_no: `GR${String(hash(req.out_refund_no) % 1e10).padStart(10, '0')}`, refund_amount: req.refund_amount, refund_status: 'SUCCESS' as const, refunded_at: at };
  return { ...base, sign: mockSign(base) };
}
