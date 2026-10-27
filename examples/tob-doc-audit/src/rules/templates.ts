import { codeLabel } from '@/domain/codes';
import { n0 } from '@/domain/docs';
import { fmtAmt } from '@/lib/format';
import { Tracer } from './judges';
import type { RuleDef } from './types';

/**
 * 自然语言维护规则库时，智能体“新增规则”变更引用的预置实现（演示用）。
 * 变更经逐条确认发布后加入该组织的规则库，对其用户的一键核查实时生效。
 */
export const TEMPLATE_RULES: RuleDef[] = [
  {
    id: 'R706',
    name: '大额服务类收款用途说明未注明合同号',
    major: 'codeRemark',
    engine: 'code',
    level: 'warn',
    rigid: false,
    biz: ['receipt'],
    owner: '区域自定',
    desc: '单笔折美元 5 万及以上的服务类收款（类别编码 2 字头），用途说明须注明合同编号，便于真实性核验。',
    basis: '区域自然语言新增（示意）：“单笔 5 万美元以上的服务收入，用途说明要写合同号”',
    refs: [{ doc: 'local', title: '区域自然语言新增（示意）' }, { doc: 'manual', no: '5.3', title: '服务类单据填写示例' }],
    params: [{ key: 'threshold', label: '金额门槛', value: 50000, unit: '美元' }],
    logic: `WHEN 单据种类 = 收款单 AND 类别编码1 STARTS_WITH "2" AND 折美元金额 >= {threshold}
  ASSERT MATCH(用途说明1, /合同|协议|NO\\.?\\s*[A-Z0-9-]{4,}/i) ELSE 提示`,
    version: 'v0.1（草案）',
    updatedAt: '—',
    updatedBy: 'AI 生成，待审核',
    check: (rec, ctx, trace) => {
      const t = new Tracer(trace, rec.key + 'R706');
      const th = Number(ctx.params.R706?.threshold ?? 50000);
      const usd = n0(rec.f.usdAmt) || n0(rec.f.amount);
      t.add('perceive', '读取字段', undefined, { 类别编码1: codeLabel(rec.f.code1), 折美元金额: fmtAmt(usd), 用途说明1: rec.f.remark1 });
      if (!rec.f.code1.startsWith('2') || usd < th) return t.done({ verdict: 'skip', message: '非大额服务类收款，不适用。' });
      const ok = /合同|协议|NO\.?\s*[A-Z0-9-]{4,}/i.test(rec.f.remark1);
      t.add('tool', '执行规则表达式', `折美元 ${fmtAmt(usd)} ≥ ${fmtAmt(th)}`, { 表达式: '用途说明含合同 / 协议编号', 结果: ok ? '未命中' : '命中' });
      return ok
        ? t.done({ verdict: 'pass' })
        : t.done({ verdict: 'warn', confidence: 1, message: `服务类收款折美元 ${fmtAmt(usd)}，用途说明未注明合同编号。`, suggestion: '用途说明补充“合同号XXXX”', fields: ['remark1'] });
    },
  },
  {
    id: 'R707',
    name: '服务类大额付款未填写合同号',
    major: 'completeness',
    engine: 'code',
    level: 'error',
    rigid: false,
    biz: ['payment'],
    owner: '区域自定',
    desc: '服务类（类别编码 2 字头）单笔折美元 5 万以上的付款，“合同号”栏必须填写，便于付款与合同、验收单据勾稽。',
    basis: '区域自然语言新增（示意）：“服务费对外付款超过 5 万美元的，要填合同号”',
    refs: [{ doc: 'local', title: '区域自然语言新增（示意）' }, { doc: 'policy', no: '6.2', title: '服务采购付款的附件要求' }],
    params: [{ key: 'threshold', label: '金额门槛', value: 50000, unit: '美元' }],
    logic: `WHEN 单据种类 = 付款单 AND 类别编码1 STARTS_WITH "2" AND 折美元金额 > {threshold}
  ASSERT NOT_EMPTY(合同号) ELSE 疑点`,
    version: 'v0.1（草案）',
    updatedAt: '—',
    updatedBy: 'AI 生成，待审核',
    check: (rec, ctx, trace) => {
      const t = new Tracer(trace, rec.key + 'R707');
      const th = Number(ctx.params.R707?.threshold ?? 50000);
      const usd = n0(rec.f.usdAmt) || n0(rec.f.amount);
      t.add('perceive', '读取字段', undefined, { 类别编码1: codeLabel(rec.f.code1), 折美元金额: fmtAmt(usd), 合同号: rec.f.contractNo || '（空）' });
      if (!rec.f.code1.startsWith('2') || usd <= th) return t.done({ verdict: 'skip', message: '非服务类大额付款，不适用。' });
      const ok = !!rec.f.contractNo.trim();
      t.add('tool', '执行规则表达式', `折美元 ${fmtAmt(usd)} > ${fmtAmt(th)}`, { 表达式: '合同号非空', 结果: ok ? '未命中' : '命中' });
      return ok
        ? t.done({ verdict: 'pass' })
        : t.done({ verdict: 'fail', confidence: 1, message: `服务类付款折美元 ${fmtAmt(usd)}，未填写合同号。`, suggestion: '在“合同号”栏填写对应的服务合同编号', fields: ['contractNo'] });
    },
  },
];
