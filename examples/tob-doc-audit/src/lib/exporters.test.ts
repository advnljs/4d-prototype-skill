import { describe, expect, it } from 'vitest';
import { batchResultXlsx } from './exporters';
import { readXlsx } from './xlsx/reader';
import { mockLedger } from '@/mock/ledger';
import { runChecks } from '@/rules/engine';
import { HEADERS, type BizType } from '@/domain/docs';
import { USERS } from '@/domain/orgs';
import { checkSetupFor } from '@/state/useCheckSetup';

describe('核查结果文件（每次核查自动导出）', () => {
  it('三类各一张疑点工作表（首行汇总、第一列疑点类型、其后原导入数据项），国别疑点单独一张', async () => {
    const s = checkSetupFor(USERS.checker.empNo);
    const recs = (['receipt', 'payment', 'settlement'] as BizType[]).flatMap((b) => mockLedger(b));
    const run = runChecks(recs, s.rules, s.ctx);
    const bytes = batchResultXlsx(run.results, run.ctx.batch, { batchId: 'B20261014-0101', time: '2026-10-14 10:00:00', lib: s.libLabel, empNo: 'F0021578', source: '界面上传' });
    const sheets = await readXlsx(bytes.slice().buffer as ArrayBuffer);
    expect(sheets.map((x) => x.name)).toEqual(['收款疑点', '付款疑点', '进口结算疑点', '国别疑点']);

    const receipt = sheets[0];
    const incomeRecs = run.results.filter((r) => r.rec.biz === 'receipt');
    const nonCountry = incomeRecs.filter((r) => r.findings.some((f) => f.major !== 'country')).length;
    expect(receipt.rows[0].slice(0, 4)).toEqual(['总核查笔数', String(incomeRecs.length), '疑点笔数', String(nonCountry)]);
    expect(receipt.rows[1][0]).toBe('疑点类型');
    expect(receipt.rows[1].slice(2)).toEqual(HEADERS.receipt);
    expect(receipt.rows.slice(2).filter((r) => r.some(Boolean)).length).toBe(nonCountry);

    const country = sheets[3];
    const countryFindings = run.results.flatMap((r) => r.findings.filter((f) => f.major === 'country'));
    expect(country.rows[0][0]).toBe('国别疑点笔数');
    expect(country.rows[0][1]).toBe(String(countryFindings.length));
    expect(country.rows[1].slice(0, 4)).toEqual(['疑点类型', '交易对方（清洗后）', '本批次国别分布', '建议国别']);
    const orient = country.rows.slice(2).find((r) => r[1] === 'ORIENT PACIFIC SHIPPING')!;
    expect(orient[3]).toBe('SGP');
    expect(orient[4]).toBe('付款');
  });
});
