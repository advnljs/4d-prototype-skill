import type { ReactNode } from 'react';
import { Badge, Button, cx } from '@/components/ui/primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { href, navigate } from '@/lib/router';
import { setRole } from '@/state/session';
import { openFlowStart } from '@/flow/director';
import { USERS, type RoleKey } from '@/domain/orgs';
import { SCENARIOS, mockLedger } from '@/mock/ledger';

interface Script {
  title: string;
  role: RoleKey | null;
  to: string;
  minutes: number;
  steps: string[];
  learn: string;
}

const SCRIPTS: Script[] = [
  {
    title: '子公司核查岗：上传三类单据，一键核查',
    role: 'checker',
    to: '/check',
    minutes: 3,
    steps: ['上传演示文件（一个文件含收款、付款、进口结算三个工作表；也试试“非标准格式”失败示例）', '一键核查：看按工号匹配规则库、批次级国家/地区一致性、智能体语义核查', '结果按大类查看，国家/地区为一个大类；打开“同一交易对方国家/地区不唯一”的疑点', '自动生成的结果文件：各类疑点 + 国别疑点工作表'],
    learn: '数据全部来自上传，三类单据用同一规则库；国别问题在一个批次内就能发现。',
  },
  {
    title: 'RPA 通过接口上传供应商付款申请',
    role: 'checker',
    to: '/check?tab=api',
    minutes: 2,
    steps: ['查看上传接口说明（multipart + 触发人工号）', '模拟 RPA 调用接口：读取供应商协同平台的待付款申请 → 付款单 Excel → 上传', '后台同一流程核查，接口返回批次号与结果', '在“核查结果”中看到这批接口上传的数据'],
    learn: '协同平台抓取与 ERP 导出两条线合一，核查与抓取彻底解耦。',
  },
  {
    title: '区域财务管理员用自然语言维护规则库',
    role: 'tier2',
    to: '/rules?tab=nl',
    minutes: 3,
    steps: ['选第一个示例：一句话拆成“新增规则、改类别、调时限”三条变更', '查看每条变更的前后对比与演示数据命中变化，逐条确认或全部确认', '发布新版本，在“版本与变更”中回看 diff', '再试“停用类别编码与用途说明不匹配”“预收 90 天”，看智能体如何拦下与拒绝'],
    learn: '规则库按区域独立维护；每次更新都有版本和 diff，可审计。',
  },
  {
    title: '复核岗与区域查看核查结果',
    role: 'reviewer',
    to: '/results',
    minutes: 2,
    steps: ['复核岗：只看到本公司的批次（界面上传 + 接口上传）', '打开批次，按大类筛选，国家/地区大类看交易对方的国别分布', '确认疑点或判定误报，结论回流判例库', '切换为区域角色，看到辖内全部子公司的批次'],
    learn: '统一认证的身份决定可见范围：本公司 / 辖内 / 全集团。',
  },
  {
    title: '集团驾驶舱：从全集团下钻到子公司',
    role: 'tier1',
    to: '/cockpit',
    minutes: 2,
    steps: ['看全集团核心指标与各区域疑点率', '用“组织 × 大类”热力图找问题集中处，国家/地区单列', '点击华东区域下钻，看辖内各子公司', '切换为区域角色，驾驶舱只显示辖内'],
    learn: '驾驶舱由核查批次实时聚合，按角色分层。',
  },
  {
    title: '为什么建议智能体离线跑批',
    role: null,
    to: '/agent-ops',
    minutes: 3,
    steps: ['看演示数据中的用途说明组合：几百笔单据只有几十个组合', '调整日均笔数与缓存命中率，对比两种方式的成本', '模拟一次夜间跑批'],
    learn: '语义判断的成本取决于用途说明组合数而不是笔数。',
  },
];

function start(s: Script) {
  if (s.role) setRole(s.role);
  navigate(s.to);
}

export function Overview() {
  return (
    <div className="px-10 pb-16 pt-10">
      {/* 开场：业务地图 */}
      <section className="mx-auto max-w-[1560px]">
        <div className="flex items-end justify-between gap-10">
          <div className="max-w-[780px]">
            <h1 className="text-[40px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink-900">单据智能核查助手</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-500">
              远帆集团（虚构）的子公司财务每天要核对大量收付款单据。核查数据全部来自上传：子公司在界面上传 ERP 导出的三类单据，RPA 通过接口上传供应商协同平台的待付款申请。系统按当前用户所属区域的规则库核查，能用代码判断的交给确定性规则，需要读懂用途说明、地址、名称的交给智能体；每次核查自动导出、保存结果，驾驶舱分层汇总。这是一套情景演示原型，数据均为虚构，智能体行为为预设。
            </p>
          </div>
          <div className="flex shrink-0 gap-3 pb-1">
            <Button variant="primary" size="lg" icon="play" onClick={openFlowStart}>
              一键运行完整流程
            </Button>
            <a href={href('/flow')} className="inline-flex h-11 items-center gap-2 rounded-full bg-ink-950/[0.05] px-6 text-[15px] font-medium text-ink-900 transition-colors hover:bg-ink-950/[0.08]">
              <Icon name="route" size={16} />
              全流程总览
            </a>
            <a href={href('/notes')} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium text-primary-500 transition-colors hover:bg-primary-50">
              假设与待确认
            </a>
          </div>
        </div>
        <BusinessMap />
      </section>

      {/* 业务速览 */}
      <section className="mx-auto mt-16 max-w-[1560px]">
        <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-ink-900">五分钟读懂收付款单据核查</h2>
        <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-ink-500">每一笔收付款都要在 ERP 中录入单据：交易性质（类别编码 + 用途说明）、金额拆分、交易对方与国家/地区。单据填错会影响往来对账、合并抵销、资金计划和经营分析，集团财务共享中心按制度定期抽查。</p>
        <div className="mt-8 grid grid-cols-12 gap-6">
          <Card className="col-span-7" title="一张单据，靠单据编号识别">
            <DocAnatomy />
          </Card>
          <Card className="col-span-5" title="类别编码：6 位数字，首位决定大类">
            <CodePrimer />
          </Card>
          <Card className="col-span-12" title="两条单据路径，一条核查流程">
            <Paths />
          </Card>
          <Card className="col-span-12" title="疑点从哪里来（演示数据中设计的典型问题）">
            <Problems />
          </Card>
        </div>
      </section>

      {/* 演示剧本 */}
      <section className="mx-auto mt-16 max-w-[1560px]">
        <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-ink-900">演示剧本</h2>
        <p className="mt-2 text-[15px] text-ink-500">
          每个剧本会自动切换到对应角色并打开页面，按步骤操作即可。想看完整业务流程串起来的样子，用上方“一键运行完整流程”，或左下角的全流程导航逐个环节查看。
        </p>
        <ol className="mt-6 divide-y divide-ink-950/[0.06] overflow-hidden rounded-[18px] bg-surface shadow-raise ring-1 ring-ink-950/[0.04]">
          {SCRIPTS.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1.2fr)_150px] items-start gap-6 px-6 py-5">
              <span className="num text-[28px] font-semibold leading-none text-ink-200">{i + 1}</span>
              <div>
                <div className="text-[17px] font-semibold text-ink-900">{s.title}</div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
                  {s.role ? <Badge tone="primary">{USERS[s.role].roleName}</Badge> : <Badge>任意角色</Badge>}约 {s.minutes} 分钟
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">看点：{s.learn}</p>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-700 marker:text-ink-300">
                {s.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
              <div className="flex justify-end">
                <Button variant="secondary" iconRight="arrowRight" onClick={() => start(s)}>
                  开始
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-16 grid max-w-[1560px] grid-cols-3 gap-6">
        {[
          ['不调用大模型', '智能体的每一步推理、置信度、耗时都是按期望行为预设的，目的是和业务对齐“它应该怎么想”。确定性规则是真实执行的。'],
          ['数据全部虚构', '集团、子公司、客商、账号、组织编码、单据编号和制度文件均为虚构，不对应任何真实主体。'],
          ['上传与接口为模拟', '文件只在本机浏览器解析；RPA 接口上传在原型内模拟，不访问供应商协同平台或任何外部系统。'],
        ].map(([t, d]) => (
          <div key={t}>
            <div className="text-[15px] font-semibold text-ink-900">{t}</div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

function Card({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-[22px] bg-surface p-7 shadow-raise ring-1 ring-ink-950/[0.04]', className)}>
      <h3 className="text-[19px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h3>
      <div className="mt-5">{children}</div>
    </div>
  );
}

/* ---------------- 业务地图 ---------------- */

const SOURCES: { icon: IconName; title: string; desc: string }[] = [
  { icon: 'sheet', title: '界面上传：ERP 三类单据', desc: '核查岗从 ERP 导出收款 / 付款 / 进口结算单' },
  { icon: 'robot', title: '接口上传：RPA', desc: 'RPA 读取供应商协同平台的待付款申请，整理成付款单 Excel 调用接口' },
  { icon: 'link', title: '统一认证：工号', desc: '决定规则库与结果可见范围（系统集成）' },
];

const MODULES: { icon: IconName; title: string; desc: string; to: string; src: string }[] = [
  { icon: 'upload', title: '一键核查', desc: '两种上传，同一流程；自动导出', to: '/check', src: '上传' },
  { icon: 'list', title: '核查结果', desc: '每次核查留存；本公司 / 辖内 / 全集团', to: '/results', src: '留存' },
  { icon: 'book', title: '核查规则库', desc: '区域各自维护；自然语言 + 逐条确认', to: '/rules', src: '规则' },
  { icon: 'chart', title: '核查驾驶舱', desc: '区域 / 集团分层聚合', to: '/cockpit', src: '汇总' },
];

const OUTPUTS: { icon: IconName; title: string }[] = [
  { icon: 'sheet', title: '结果 Excel（各类疑点 + 国别疑点）' },
  { icon: 'database', title: '核查批次与疑点明细' },
  { icon: 'git', title: '规则库版本与变更 diff' },
  { icon: 'chart', title: '驾驶舱（分层聚合）' },
];

function BusinessMap() {
  return (
    <div className="mt-10 grid grid-cols-[minmax(0,0.9fr)_40px_minmax(0,1.6fr)_40px_minmax(0,0.8fr)] items-center rounded-[28px] bg-surface p-8 shadow-raise ring-1 ring-ink-950/[0.04]">
      <div>
        <div className="mb-3 text-xs font-semibold text-ink-400">数据来源</div>
        <ul className="space-y-3">
          {SOURCES.map((s) => (
            <li key={s.title} className="flex items-start gap-3 rounded-[14px] bg-ink-50 px-4 py-3">
              <Icon name={s.icon} size={20} className="mt-0.5 shrink-0 text-ink-500" />
              <div>
                <div className="text-sm font-semibold text-ink-900">{s.title}</div>
                <div className="text-xs text-ink-500">{s.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <Icon name="chevronRight" size={22} className="mx-auto text-ink-300" />
      <div className="rounded-[20px] bg-gradient-to-b from-primary-50 to-surface p-5 ring-1 ring-primary-100">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-primary-600">核查助手</span>
          <span className="text-xs text-ink-400">财务共享平台</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MODULES.map((m) => (
            <a key={m.title} href={href(m.to)} className="group rounded-[14px] bg-surface px-4 py-3.5 shadow-raise ring-1 ring-ink-950/[0.04] transition-shadow hover:shadow-pop">
              <div className="flex items-center gap-2">
                <Icon name={m.icon} size={18} className="text-primary-500" />
                <span className="text-[15px] font-semibold text-ink-900">{m.title}</span>
                <Icon name="chevronRight" size={14} className="ml-auto text-ink-300 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-1 text-xs text-ink-500">{m.desc}</div>
            </a>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 rounded-[12px] bg-rule-50 px-3 py-2 text-rule-700">
            <Icon name="code" size={14} />
            确定性规则：完整性、金额勾稽、款项性质、审批、区域要求（毫秒级）
          </div>
          <div className="flex items-center gap-2 rounded-[12px] bg-agent-50 px-3 py-2 text-agent-700">
            <Icon name="sparkle" size={14} />
            智能体：用途说明、地址、交易对方归并（批量 + 缓存）
          </div>
        </div>
      </div>
      <Icon name="chevronRight" size={22} className="mx-auto text-ink-300" />
      <div>
        <div className="mb-3 text-xs font-semibold text-ink-400">产出</div>
        <ul className="space-y-2">
          {OUTPUTS.map((o) => (
            <li key={o.title} className="flex items-center gap-2.5 text-sm text-ink-700">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-50 text-ink-500">
                <Icon name={o.icon} size={14} />
              </span>
              {o.title}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------------- 单据编号解剖 ---------------- */

function DocAnatomy() {
  const segs: [string, string, string][] = [
    ['SK', '种类', '收款单'],
    ['110102', '组织', '杭州子公司'],
    ['20261013', '日期', '2026-10-13'],
    ['0007', '序号', '当日流水'],
  ];
  return (
    <div>
      <div className="flex items-end gap-1.5">
        {segs.map(([v, k, d], i) => (
          <div key={k} className="text-center">
            <div className={cx('code rounded-[10px] px-2.5 py-2 text-[26px] font-semibold tracking-[0.02em]', i === 0 ? 'bg-primary-500 text-white' : 'bg-ink-50 text-ink-900')}>{v}</div>
            <div className="mt-2 text-xs font-medium text-ink-700">{k}</div>
            <div className="text-2xs text-ink-400">{d}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        {[
          ['SK', '收款单', '客户回款、退款收回'],
          ['FK', '付款单', '采购、服务、费用付款'],
          ['JS', '进口结算单', '信用证、托收项下结算'],
        ].map(([l, t, d]) => (
          <div key={l} className="flex items-start gap-2.5">
            <span className="code flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-600">{l}</span>
            <div>
              <div className="font-medium text-ink-900">{t}</div>
              <div className="text-xs text-ink-500">{d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CodePrimer() {
  const groups: [string, string][] = [
    ['1', '货物'],
    ['2', '服务'],
    ['3', '人工'],
    ['4', '赔偿与捐赠'],
    ['8', '资金往来'],
    ['9', '其他'],
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {groups.map(([d, n]) => (
          <span key={d} className="flex items-center gap-1.5 rounded-full bg-ink-50 py-1 pl-1 pr-3 text-sm text-ink-700">
            <span className="code flex h-6 w-6 items-center justify-center rounded-full bg-surface font-semibold text-ink-900 shadow-raise">{d}</span>
            {n}
          </span>
        ))}
      </div>
      <ul className="mt-5 space-y-2.5 text-sm">
        <li className="flex items-start gap-2.5">
          <Icon name="checkCircle" size={17} className="mt-0.5 shrink-0 text-pine-500" />
          <span>
            <span className="code font-semibold">110100</span> 一般贸易货物，用途说明“一般贸易项下出口精密轴承货款”
          </span>
        </li>
        <li className="flex items-start gap-2.5">
          <Icon name="alertCircle" size={17} className="mt-0.5 shrink-0 text-seal-500" />
          <span>
            <span className="code font-semibold">110100</span> 却写“出口货物海运费收入”，海运费属于服务，应为 <span className="code font-semibold">210101</span>
          </span>
        </li>
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-ink-500">判断编码对不对，需要读懂用途说明的“中心语”，这正是智能体负责的部分。</p>
    </div>
  );
}

function Paths() {
  const rows: { name: string; steps: string[]; hit: number; note: string }[] = [
    { name: 'ERP 录入的单据', steps: ['业务部门发起收付款', '子公司财务在 ERP 录入单据', '核查岗导出三类单据上传', '集团财务共享中心定期抽查'], hit: 2, note: '界面上传：一键核查，抽查前发现并整改' },
    { name: '供应商线上付款申请', steps: ['供应商在协同平台提交付款申请', 'RPA 读取待付款申请', '调接口上传（同一流程）', '子公司审批后付款'], hit: 2, note: '接口上传：在审批付款前先核一遍，结果与 ERP 单据一起留存、汇总' },
  ];
  return (
    <div className="space-y-6">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[220px_minmax(0,1fr)] items-center gap-6">
          <div className="text-[15px] font-semibold text-ink-900">{r.name}</div>
          <div>
            <ol className="flex items-center gap-2">
              {r.steps.map((s, i) => (
                <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
                  <div className={cx('min-w-0 flex-1 rounded-[12px] px-3.5 py-2.5 text-sm', i === r.hit ? 'bg-primary-500 font-medium text-white shadow-[0_6px_16px_-6px_rgb(0_113_227/0.6)]' : 'bg-ink-50 text-ink-700')}>{s}</div>
                  {i < r.steps.length - 1 ? <Icon name="chevronRight" size={16} className="shrink-0 text-ink-300" /> : null}
                </li>
              ))}
            </ol>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-primary-600">
              <Icon name="shield" size={15} />
              {r.note}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Problems() {
  mockLedger('receipt');
  const count = (ids: string[]) => Object.values(SCENARIOS).filter((x) => x.rules.some((r) => ids.includes(r))).length;
  const list: [string, string, string][] = [
    ['类别编码与用途说明不匹配', `演示情景 ${count(['R101'])} 个`, '运费、服务费用了货物编码，或运输方向选反'],
    ['金额与账户不平衡', `演示情景 ${count(['R301', 'R302', 'R303', 'R202'])} 个`, '明细金额取整、漏填手续费、实付金额录错'],
    ['国家/地区不一致', `演示情景 ${count(['R401', 'R402', 'R403', 'R405', 'R406', 'R407'])} 个`, '按付款行所在地填国别；同一交易对方在一批数据里国别不唯一'],
    ['款项性质与用途矛盾', `演示情景 ${count(['R502', 'R503', 'R504', 'R506', 'R507'])} 个`, '预付 / 到货 / 退款选错，影响往来账龄与资金计划'],
    ['关联方与审批', `演示情景 ${count(['R103', 'R501', 'R505'])} 个`, '关联方往来没按格式填、往来类型选错；大额付款缺审批单号'],
    ['区域要求未落实', `演示情景 ${count(['R701', 'R702', 'R705'])} 个`, '集团制度没有、区域有要求，如跨境电商未写平台'],
  ];
  return (
    <ul className="grid grid-cols-3 gap-x-8 gap-y-5">
      {list.map(([t, n, d]) => (
        <li key={t}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold text-ink-900">{t}</span>
            <span className="num shrink-0 text-xs text-ink-400">{n}</span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-500">{d}</p>
        </li>
      ))}
    </ul>
  );
}
