import { Fragment, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ActorChip } from '@/components/flow/ActorChip';
import { FlowNavigator } from '@/components/flow/FlowNavigator';
import { FlowDock } from '@/components/flow/FlowDock';
import { BrandMark } from '@/components/live/FoodArt';
import { flowPrefs, focusStep, useFlow } from '@/flow/director';
import { useStore } from '@/lib/store';
import { STEPS, STEP_INDEX, stepsForRoute } from '@/flow/workflow';
import { href, useRoute } from '@/lib/router';
import { ROLE_ORDER, USERS, setRole, useRole } from '@/state/session';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { useScenario } from '@/state/live';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  note?: string;
}

/** 业务现场：需求范围内的三端与后台 */
export const APP_NAV: NavItem[] = [
  { to: '/live', label: '三端联动', icon: 'bike', note: '主舞台' },
  { to: '/ops', label: '运营后台', icon: 'chart' },
  { to: '/settle', label: '结算中心', icon: 'receipt' },
];

/** 原型讨论区：帮助理解场景、讨论设计 */
export const PROTO_NAV: NavItem[] = [
  { to: '/', label: '场景导览', icon: 'compass' },
  { to: '/flow', label: '全流程总览', icon: 'route', note: '一键' },
  { to: '/design', label: '方案讨论', icon: 'sliders' },
  { to: '/notes', label: '假设与待确认', icon: 'help' },
];

function isActive(path: string, to: string) {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const navOpen = useStore(flowPrefs, (p) => p.panel === 'open');
  const playing = useFlow((s) => s.active);
  const scenario = SCENARIO_MAP[useScenario()];
  return (
    <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden bg-paper">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="主菜单" className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-black/[0.06] bg-white/60 pb-[250px] backdrop-blur-xl">
          <div className="px-3 pt-4">
            <div className="px-3 pb-1.5 text-xs font-semibold text-ink-500">业务现场</div>
            <ul className="space-y-0.5">
              {APP_NAV.map((it) => (
                <li key={it.to}>
                  <NavLink item={it} active={isActive(path, it.to)} />
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 px-3">
            <div className="px-3 pb-1.5 text-xs font-semibold text-ink-500">原型讨论区</div>
            <ul className="space-y-0.5">
              {PROTO_NAV.map((it) => (
                <li key={it.to}>
                  <NavLink item={it} active={isActive(path, it.to)} />
                </li>
              ))}
            </ul>
          </div>
          <div className="mx-6 mt-6 rounded-[12px] bg-primary-50 px-3 py-2.5 text-xs leading-relaxed text-primary-700">
            <div className="font-semibold">当前情景</div>
            <div className="mt-0.5">{scenario.title}</div>
          </div>
          <div className="mx-3 mt-3">
            <a href="./app.html" className="group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] text-ink-700 transition-colors duration-150 hover:bg-black/[0.035]">
              <Icon name="phone" size={17} className="text-ink-400 group-hover:text-ink-600" />
              <span className="truncate">手机版 App</span>
              <span className="ml-auto rounded-full bg-primary-50 px-1.5 text-2xs leading-[18px] text-primary-700">新</span>
            </a>
          </div>
          <div className="mt-auto px-6 pb-5 pt-6 text-xs leading-relaxed text-ink-400">品牌、商家、人物、地址与数据全部虚构；支付网关与地图均为模拟，不连接任何真实系统。</div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" className={cx('min-h-0 flex-1 overflow-y-auto pb-6 transition-[padding] duration-200 ease-out', navOpen && 'pl-[188px]', playing && 'pb-[84px]')}>
            {children}
          </main>
          <FlowDock />
        </div>
      </div>
      <FlowNavigator />
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={href(item.to)}
      aria-current={active ? 'page' : undefined}
      className={cx('group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors duration-150', active ? 'bg-primary-50 font-medium text-ink-900' : 'text-ink-700 hover:bg-black/[0.035]')}
    >
      <Icon name={item.icon} size={17} className={active ? 'text-primary-500' : 'text-ink-400 group-hover:text-ink-600'} />
      <span className="truncate">{item.label}</span>
      {item.note ? <span className={cx('ml-auto rounded-full px-1.5 text-2xs leading-[18px]', active ? 'bg-primary-100 text-primary-700' : 'bg-black/[0.05] text-ink-500')}>{item.note}</span> : null}
    </a>
  );
}

function TopBar() {
  const role = useRole();
  const u = USERS[role];
  return (
    <header className="z-30 flex h-[56px] shrink-0 items-center justify-between border-b border-black/[0.06] bg-white/80 px-5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <BrandMark size={30} />
        <span className="text-[16px] font-bold tracking-[-0.01em] text-ink-900">橙子到家</span>
        <span className="text-sm text-ink-400">即时配送 · 业务全景原型</span>
        <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-100">原型演示环境 · 数据虚构</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-ink-500">
          演示角色
          <span className="inline-flex rounded-[10px] bg-black/[0.055] p-[2px]" role="radiogroup" aria-label="演示角色">
            {ROLE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                title={`${USERS[r].roleName} · ${USERS[r].app}`}
                onClick={() => setRole(r)}
                className={cx('h-7 rounded-[8px] px-3 text-xs transition-[background-color,color,box-shadow] duration-150', role === r ? 'bg-white font-medium text-ink-900 shadow-[0_1px_3px_rgb(0_0_0/0.12)]' : 'text-ink-600 hover:text-ink-900')}
              >
                {USERS[r].roleName} · {USERS[r].name}
              </button>
            ))}
          </span>
        </div>
        <span className="h-6 w-px bg-black/[0.08]" />
        <div className="flex items-center gap-2.5">
          <span className="brand-grad flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white">{u.name.slice(-1)}</span>
          <div className="leading-tight">
            <div className="text-sm font-medium text-ink-900">{u.full}</div>
            <div className="text-xs text-ink-500">{u.app}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** 页面标题区 */
export function PageHeader({ title, desc, actions, crumbs, children }: { title: ReactNode; desc?: ReactNode; actions?: ReactNode; crumbs?: string[]; children?: ReactNode }) {
  return (
    <div className="px-10 pt-7">
      {crumbs ? (
        <div className="mb-1 flex items-center gap-1 text-xs text-ink-400">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 ? <Icon name="chevronRight" size={11} className="text-ink-300" /> : null}
              {c}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex items-end justify-between gap-8">
        <div className="min-w-0 max-w-[980px]">
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink-900">{title}</h1>
          {desc ? <p className="mt-1.5 text-[14px] leading-relaxed text-ink-500">{desc}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
      </div>
      <FlowContext />
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** 页头下方：本页承担全流程中的哪些环节 */
function FlowContext() {
  const { path, query } = useRoute();
  const here = stepsForRoute(path, query.get('tab'));
  const activeId = useFlow((s) => (s.active ? STEPS[s.idx].id : ''));
  if (!here.length) return null;
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-1.5" data-flow-anchor="page-flow-context">
      <span className="mr-1 flex items-center gap-1 text-xs text-ink-500">
        <Icon name="route" size={13} />
        本页在全流程中
      </span>
      {here.map(({ step, exact }, i) => (
        <Fragment key={step.id}>
          {i > 0 ? <Icon name="chevronRight" size={12} className="text-ink-300" /> : null}
          <button
            type="button"
            onClick={() => focusStep(step.id)}
            title={`${step.title}（${step.trigger}，${step.when}）`}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs transition-[background-color,box-shadow] duration-150',
              activeId === step.id ? 'brand-grad text-white' : exact ? 'bg-white text-ink-800 shadow-raise ring-1 ring-black/[0.05] hover:bg-ink-50' : 'text-ink-500 hover:bg-black/[0.04]',
            )}
          >
            <span className={cx('num flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold', activeId === step.id ? 'bg-white/25' : 'bg-ink-100 text-ink-600')}>{STEP_INDEX[step.id] + 1}</span>
            {step.short}
            <ActorChip actor={step.actor} size="xs" short />
            <span className={cx('num text-2xs', activeId === step.id ? 'text-white/80' : 'text-ink-400')}>{step.when}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
