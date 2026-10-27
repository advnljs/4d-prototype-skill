import { Fragment } from 'react';
import { BIZ_FORM, TRADE_TYPE, NATURE_LABEL, SETTLE_LABEL, fmtDate8, labelOf, type DocRecord, type FieldKey } from '@/domain/docs';
import { codeLabel } from '@/domain/codes';
import { countryLabel } from '@/domain/countries';
import { cx } from '@/components/ui/primitives';

type Item = { label: string; key?: FieldKey; render?: (r: DocRecord) => string; span?: 1 | 2 | 3 | 4; also?: FieldKey[] };
type Section = { title: string; items: Item[] };

const amt = (cur: FieldKey, val: FieldKey) => (r: DocRecord) => (r.f[val] ? `${r.f[cur] || ''} ${r.f[val]}`.trim() : '');

function sections(rec: DocRecord): Section[] {
  const receipt = rec.biz === 'receipt';
  const settlement = rec.biz === 'settlement';
  const head: Section = {
    title: '单据信息',
    items: [
      { label: '单据编号', key: 'docNo', span: 2 },
      { label: '往来类型', key: 'tradeType', render: (r) => labelOf(TRADE_TYPE, r.f.tradeType) },
      { label: '单据日期', key: 'docDate', render: (r) => fmtDate8(r.f.docDate) },
      { label: '银行流水号', key: 'bankRef', span: 2 },
      { label: '组织编码', key: 'orgCode' },
      { label: '数据来源', key: 'source' },
    ],
  };
  const own: Section = {
    title: '本方单位',
    items: [
      { label: '名称', key: 'domesticName', span: 3 },
      { label: '本方主体代码', key: 'entityCode' },
    ],
  };
  const money: Section = {
    title: receipt ? '收款币种及金额' : settlement ? '结算币种及金额' : '付款币种及金额',
    items: [
      { label: '结算方式', key: 'settle', render: (r) => labelOf(SETTLE_LABEL, r.f.settle) },
      { label: receipt ? '收款金额' : settlement ? '结算金额' : '付款金额', key: 'amount', render: amt('currency', 'amount'), also: ['currency'] },
      { label: '本币金额', key: 'convAmt', render: (r) => (r.f.convAmt ? `${r.f.convAmt}（汇率 ${r.f.rate || '—'}）` : '') },
      { label: '本币账号', key: 'cnyAcct' },
      { label: '外币金额', key: 'fxAmt' },
      { label: '外币账号', key: 'fxAcct' },
      { label: '其他金额', key: 'otherAmt' },
      { label: '其他账号', key: 'otherAcct' },
      ...(receipt
        ? [
            { label: '我方手续费', key: 'feeDomAmt' as FieldKey, render: amt('feeDomCur', 'feeDomAmt') },
            { label: '对方手续费', key: 'feeForAmt' as FieldKey, render: amt('feeForCur', 'feeForAmt') },
          ]
        : settlement
          ? [
              { label: '扣费', key: 'feeDomAmt' as FieldKey, render: amt('feeDomCur', 'feeDomAmt') },
              { label: '实付金额', key: 'actualAmt' as FieldKey, render: amt('actualCur', 'actualAmt') },
            ]
          : []),
    ],
  };
  const cp: Section = {
    title: receipt ? '付款方（交易对方）' : '收款方（交易对方）',
    items: [
      { label: '名称', key: 'counterparty', span: 3 },
      { label: '国家/地区', key: 'country', render: (r) => countryLabel(r.f.country) },
      ...(!receipt ? [{ label: settlement ? '交单行' : '对方开户行', key: 'bankName' as FieldKey, span: 4 as const }] : []),
    ],
  };
  const nature: Section = {
    title: '款项性质与依据',
    items: [
      { label: '款项性质', key: 'nature', render: (r) => labelOf(NATURE_LABEL[r.biz], r.f.nature) },
      ...(!receipt ? [{ label: '最迟交货日期', key: 'latestShipDate' as FieldKey, render: (r: DocRecord) => fmtDate8(r.f.latestShipDate) }] : []),
      { label: '审批单号', key: 'approvalNo' },
      ...(!receipt
        ? [
            { label: '合同号', key: 'contractNo' as FieldKey },
            { label: '发票号', key: 'invoiceNo' as FieldKey },
            ...(settlement ? [{ label: '运单号', key: 'billNo' as FieldKey }] : []),
          ]
        : []),
    ],
  };
  const tx: Section = {
    title: '类别编码与用途说明',
    items: [
      { label: '类别编码 1', key: 'code1', render: (r) => (r.f.code1 ? codeLabel(r.f.code1) : ''), span: 2 },
      { label: '币种及金额 1', key: 'txAmt1', render: amt('txCur1', 'txAmt1'), also: ['txCur1'] },
      { label: ' ', render: () => '' },
      { label: '用途说明 1', key: 'remark1', span: 4 },
      ...(rec.f.code2 || rec.f.remark2
        ? [
            { label: '类别编码 2', key: 'code2' as FieldKey, render: (r: DocRecord) => codeLabel(r.f.code2), span: 2 as const },
            { label: '币种及金额 2', key: 'txAmt2' as FieldKey, render: amt('txCur2', 'txAmt2'), also: ['txCur2' as FieldKey] },
            { label: ' ', render: () => '' },
            { label: '用途说明 2', key: 'remark2' as FieldKey, span: 4 as const },
          ]
        : []),
    ],
  };
  return [head, own, money, cp, nature, tx];
}

/** 两栏排布：整行字段前若有半行空位，用占位格补齐，避免露出网格底色 */
function layout(items: Item[]): (Item | null)[] {
  const out: (Item | null)[] = [];
  let pos = 0;
  for (const it of items) {
    if (it.label.trim() === '') continue;
    const wide = (it.span ?? 1) > 1;
    if (wide && pos === 1) {
      out.push(null);
      pos = 0;
    }
    out.push(it);
    pos = wide ? 0 : (pos + 1) % 2;
  }
  if (pos === 1) out.push(null);
  return out;
}

/** 单据式字段视图：疑点涉及的字段以红色标出（本原型的“签名”视图） */
export function DeclarationForm({ rec, highlight, warnFields }: { rec: DocRecord; highlight: Set<FieldKey>; warnFields?: Set<FieldKey> }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-surface">
      <div className="flex items-center justify-between border-b border-ink-200 bg-ink-50 px-4 py-2">
        <span className="text-sm font-semibold text-ink-800">{BIZ_FORM[rec.biz]}</span>
        <span className="text-xs text-ink-500">原文件第 {rec.row} 行</span>
      </div>
      {sections(rec).map((sec) => (
        <Fragment key={sec.title}>
          <div className="border-b border-ink-150 bg-ink-50/60 px-4 py-1 text-xs font-medium text-ink-500">{sec.title}</div>
          <div className="grid grid-cols-2 gap-px border-b border-ink-150 bg-ink-100 last:border-b-0">
            {layout(sec.items).map((it, i) => {
              if (!it) return <div key={i} className="bg-surface" aria-hidden="true" />;
              const v = it.render ? it.render(rec) : it.key ? rec.f[it.key] : '';
              const keys = [it.key, ...(it.also ?? [])].filter(Boolean) as FieldKey[];
              const bad = keys.some((k) => highlight.has(k));
              const warn = !bad && keys.some((k) => warnFields?.has(k));
              const span = (it.span ?? 1) > 1 ? 'col-span-2' : 'col-span-1';
              return (
                <div key={i} className={cx('flex min-w-0 bg-surface', span)}>
                  <div className="w-[96px] shrink-0 border-r border-ink-100 bg-ink-50/40 px-2.5 py-1.5 text-xs leading-5 text-ink-500">{it.label}</div>
                  <div
                    className={cx(
                      'relative min-w-0 flex-1 break-words px-2.5 py-1.5 text-sm leading-5',
                      bad ? 'bg-seal-50 font-medium text-seal-700 ring-1 ring-inset ring-seal-200' : warn ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100' : 'text-ink-800',
                      it.key && /Acct|docNo|bankRef|entityCode|orgCode/.test(it.key) ? 'code' : '',
                    )}
                  >
                    {v || <span className="text-ink-300">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}
