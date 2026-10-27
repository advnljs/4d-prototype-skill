import { createStore } from '@/lib/store';
import { LUNCH_COUPON, type CouponTpl } from '@/domain/pricing';

/** 运营后台的券编辑草稿（发布后写入模拟世界的券模板） */
export const couponDraft = createStore<{ draft: CouponTpl; touched: boolean }>('coupon-draft', () => ({ draft: { ...LUNCH_COUPON, threshold: 0, off: 0, name: '' }, touched: false }));

export function applyLunchTemplate() {
  couponDraft.set({ draft: { ...LUNCH_COUPON }, touched: true });
}
