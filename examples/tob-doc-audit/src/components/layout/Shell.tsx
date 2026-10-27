import { Fragment, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/primitives';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { ActorChip } from '@/components/flow/ActorChip';
import { FlowNavigator } from '@/components/flow/FlowNavigator';
import { FlowDock } from '@/components/flow/FlowDock';
import { flowPrefs, focusStep, useFlow } from '@/flow/director';
import { useStore } from '@/lib/store';
import { STEPS, STEP_INDEX, stepsForRoute } from '@/flow/workflow';
import { href, useRoute } from '@/lib/router';
import { PERMS, ROLE_ORDER, USERS, orgByCode, type PermKey, type RoleKey } from '@/domain/orgs';
import { setRole, useRole, useUser } from '@/state/session';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  note?: string;
  /** 需要的权限（无权限的岗位不显示该菜单） */
  perm?: PermKey;
}

/** 一级菜单“单据智能核查”：上传即核查，结果留存，规则库按组织维护，驾驶舱分层 */
export const APP_NAV: NavItem[] = [
  { to: '/check', label: '一键核查', icon: 'upload', perm: 'check' },
  { to: '/results', label: '核查结果', icon: 'list', perm: 'resultsView' },
  { to: '/rules', label: '核查规则库', icon: 'book', perm: 'ruleView' },
  { to: '/cockpit', label: '核查驾驶舱', icon: 'chart', perm: 'cockpit' },
];

/** 原型讨论区：不属于需求范围，用于和业务一起理解场景、讨论设计 */
export const PROTO_NAV: NavItem[] = [
  { to: '/', label: '场景导览', icon: 'compass' },
  { to: '/flow', label: '全流程总览', icon: 'route', note: '一键' },
  { to: '/agent-ops', label: '智能体运行设计', icon: 'cpu', note: '跑批' },
  { to: '/notes', label: '假设与待确认', icon: 'help' },
];

function isActive(path: string, to: string) {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
}

export function Shell({ children }: { children: ReactNode }) {
  const { path } = useRoute();
  const role = useRole();
  // 全流程导航展开时（左下角浮层宽 408px，越出侧栏约 172px），正文让出这部分宽度，避免遮挡页面内容
  const navOpen = useStore(flowPrefs, (p) => p.panel === 'open');
  // 演示播放时控制胶囊悬浮在正文底部中间：正文底部留出空间，最后的内容可以滚到它上方
  const playing = useFlow((s) => s.active);
  return (
    <div className="flex h-screen min-w-[1280px] flex-col overflow-hidden bg-paper">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav aria-label="主菜单" className="flex w-[248px] shrink-0 flex-col overflow-y-auto border-r border-ink-950/[0.06] bg-surface/60 pb-[250px] backdrop-blur-xl">
          <div className="px-3 pt-4">
            <HostItem icon="layers" label="工作台" />
            <HostItem icon="chart" label="业务监测" />
            <div className="mt-3 px-3 pb-1.5 text-xs font-semibold text-ink-500">单据智能核查</div>
            <ul className="space-y-0.5">
              {APP_NAV.filter((it) => !it.perm || PERMS[it.perm][role]).map((it) => (
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
          <div className="mt-auto px-6 pb-5 pt-6 text-xs leading-relaxed text-ink-400">原型使用虚构数据与预设的智能体行为，不连接真实系统，也不调用大模型。</div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" className={cx('min-h-0 flex-1 overflow-y-auto pb-6 transition-[padding] duration-200 ease-out', navOpen && 'pl-[180px]', playing && 'pb-[84px]')}>
            {children}
          </main>
          {/* 演示播放时：流程 · 数据窗口停靠在正文底部（布局的一部分，不遮挡正文） */}
          <FlowDock />
        </div>
      </div>
      <FlowNavigator />
    </div>
  );
}

function HostItem({ icon, label }: { icon: IconName; label: string }) {
  return (
    <div className="flex h-8 cursor-default items-center gap-2.5 rounded-lg px-3 text-sm text-ink-400" title="财务共享平台既有菜单（原型中不展开）">
      <Icon name={icon} size={16} />
      {label}
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <a
      href={href(item.to)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] transition-colors duration-150',
        active ? 'bg-ink-950/[0.06] font-medium text-ink-900' : 'text-ink-700 hover:bg-ink-950/[0.035]',
      )}
    >
      <Icon name={item.icon} size={17} className={active ? 'text-primary-500' : 'text-ink-400 group-hover:text-ink-600'} />
      <span className="truncate">{item.label}</span>
      {item.note ? <span className="ml-auto rounded-full bg-ink-950/[0.05] px-1.5 text-2xs leading-[18px] text-ink-500">{item.note}</span> : null}
    </a>
  );
}

const ROLE_SHORT: Record<RoleKey, string> = { checker: '子公司核查岗', reviewer: '子公司复核岗', tier2: '区域', tier1: '集团' };

function TopBar() {
  const role = useRole();
  const user = useUser();
  const org = orgByCode(user.orgCode);
  return (
    <header className="z-30 flex h-[52px] shrink-0 items-center justify-between border-b border-ink-950/[0.06] bg-surface/75 px-5 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-gradient-to-b from-primary-400 to-primary-600 text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]">
          <Icon name="shield" size={15} />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">财务共享平台</span>
        <span className="text-sm text-ink-400">远帆集团（虚构）</span>
        <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-100">原型演示环境</span>
      </div>
      <div className="flex items-center gap-4">
        <ThemeSwitcher />
        <div className="flex items-center gap-2 text-xs text-ink-500">
          演示角色
          <span className="inline-flex rounded-[9px] bg-ink-950/[0.055] p-[2px]" role="radiogroup" aria-label="演示角色">
            {ROLE_ORDER.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                title={USERS[r].roleName}
                onClick={() => setRole(r)}
                className={cx(
                  'h-7 rounded-[7px] px-3 text-xs transition-[background-color,color,box-shadow] duration-150',
                  role === r ? 'bg-surface font-medium text-ink-900 shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-ink-600 hover:text-ink-900',
                )}
              >
                {ROLE_SHORT[r]}
              </button>
            ))}
          </span>
        </div>
        <span className="h-6 w-px bg-ink-950/[0.08]" />
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-ink-300 to-ink-500 text-sm font-medium text-surface">{user.name.slice(0, 1)}</span>
          <div className="leading-tight">
            <div className="text-sm font-medium text-ink-900">
              {user.name}
              <span className="num ml-1.5 text-xs font-normal text-ink-400">{user.empNo}</span>
            </div>
            <div className="text-xs text-ink-500">
              {org?.name}，{user.roleName}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

/** 页面标题区：大标题风格 */
export function PageHeader({
  title,
  desc,
  actions,
  crumbs,
  children,
}: {
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  crumbs?: string[];
  children?: ReactNode;
}) {
  return (
    <div className="px-10 pt-8">
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
        <div className="min-w-0 max-w-[920px]">
          <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
          {desc ? <p className="mt-2 text-[14.5px] leading-relaxed text-ink-500">{desc}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div> : null}
      </div>
      <FlowContext />
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

/** 页头下方：本页承担全流程中的哪些环节、由谁在什么时点执行 */
function FlowContext() {
  const { path, query } = useRoute();
  const here = stepsForRoute(path, query.get('tab'));
  const activeId = useFlow((s) => (s.active ? STEPS[s.idx].id : ''));
  if (!here.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5" data-flow-anchor="page-flow-context">
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
              activeId === step.id ? 'bg-primary-500 text-white' : exact ? 'bg-surface text-ink-800 shadow-raise ring-1 ring-ink-950/[0.05] hover:bg-ink-50' : 'text-ink-500 hover:bg-ink-950/[0.04]',
            )}
          >
            <span className={cx('num flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold', activeId === step.id ? 'bg-surface/25' : 'bg-ink-100 text-ink-600')}>{STEP_INDEX[step.id] + 1}</span>
            {step.short}
            <ActorChip actor={step.actor} size="xs" short />
            <span className={cx('num text-2xs', activeId === step.id ? 'text-white/80' : 'text-ink-400')}>{step.when}</span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}
