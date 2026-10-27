/**
 * 操作方（谁在做这一步）——4D 的“角色”维度。
 * 人工：用户、商家、骑手、运营；机器：平台服务（订单 / 支付 / 推送）、智能调度（算法）、定时任务；外部：支付网关（原型中为模拟环境）。
 * 颜色是独立的一组 token（--color-act-*），只表示“谁在做”，与结论色无关。
 */
import type { IconName } from '@/components/ui/Icon';

export type ActorKey = 'user' | 'merchant' | 'rider' | 'ops' | 'platform' | 'dispatch' | 'scheduler' | 'gateway';

export interface ActorDef {
  key: ActorKey;
  label: string;
  short: string;
  icon: IconName;
  kind: '人工' | '机器' | '外部';
  desc: string;
  color: string;
}

export const ACTORS: Record<ActorKey, ActorDef> = {
  user: { key: 'user', label: '用户', short: '用户', icon: 'user', kind: '人工', desc: '在橙子到家 App 浏览、领券、下单、支付、收货、评价、申请售后', color: 'var(--color-act-user)' },
  merchant: { key: 'merchant', label: '商家', short: '商家', icon: 'store', kind: '人工', desc: '在商家版 App 上架菜品、开店、接单、出餐、处理退款', color: 'var(--color-act-merchant)' },
  rider: { key: 'rider', label: '骑手', short: '骑手', icon: 'bike', kind: '人工', desc: '在骑手 App 接单、到店、取餐、配送、送达；位置每 5 秒上报一次', color: 'var(--color-act-rider)' },
  ops: { key: 'ops', label: '城市运营', short: '运营', icon: 'chart', kind: '人工', desc: '配置营销券、盯实时看板与超时预警、处理异常订单', color: 'var(--color-act-ops)' },
  platform: { key: 'platform', label: '平台服务', short: '平台', icon: 'cpu', kind: '机器', desc: '订单、价格试算、支付回调处理（幂等）、消息推送、售后', color: 'var(--color-act-platform)' },
  dispatch: { key: 'dispatch', label: '智能调度', short: '调度', icon: 'sparkle', kind: '机器', desc: '召回候选骑手、多因子打分、ETA 预测、超时预警与改派（算法模拟，可解释）', color: 'var(--color-act-dispatch)' },
  scheduler: { key: 'scheduler', label: '定时任务', short: '定时', icon: 'clock', kind: '机器', desc: '次日 02:00 结算分账、生成对账文件；15 分钟未支付自动取消', color: 'var(--color-act-scheduler)' },
  gateway: { key: 'gateway', label: '支付网关', short: '网关', icon: 'wallet', kind: '外部', desc: '外部支付渠道：收银台、异步回调、原路退款（原型中为模拟环境）', color: 'var(--color-act-gateway)' },
};

export const ACTOR_ORDER: ActorKey[] = ['user', 'merchant', 'rider', 'ops', 'platform', 'dispatch', 'scheduler', 'gateway'];

/** 人工操作方：子步骤由他们执行时显示演示光标 */
export const HUMAN: ActorKey[] = ACTOR_ORDER.filter((k) => ACTORS[k].kind === '人工');
