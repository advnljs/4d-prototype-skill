import { Suspense, lazy, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Toaster } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/primitives';
import { useRoute } from '@/lib/router';
import { Placeholder } from '@/pages/Placeholder';

// 按页面拆分代码，首屏只加载当前页面
const Overview = lazy(() => import('@/pages/Overview').then((m) => ({ default: m.Overview })));
const CheckPage = lazy(() => import('@/pages/CheckPage').then((m) => ({ default: m.CheckPage })));
const ResultsPage = lazy(() => import('@/pages/ResultsPage').then((m) => ({ default: m.ResultsPage })));
const CockpitPage = lazy(() => import('@/pages/CockpitPage').then((m) => ({ default: m.CockpitPage })));
const RuleLibrary = lazy(() => import('@/pages/RuleLibrary').then((m) => ({ default: m.RuleLibrary })));
const AgentOps = lazy(() => import('@/pages/AgentOps').then((m) => ({ default: m.AgentOps })));
const FlowOverview = lazy(() => import('@/pages/FlowOverview').then((m) => ({ default: m.FlowOverview })));
const Notes = lazy(() => import('@/pages/Notes').then((m) => ({ default: m.Notes })));

function Page() {
  const { path } = useRoute();
  switch (path) {
    case '/':
      return <Overview />;
    case '/flow':
      return <FlowOverview />;
    case '/check':
      return <CheckPage />;
    case '/results':
      return <ResultsPage />;
    case '/cockpit':
      return <CockpitPage />;
    case '/rules':
      return <RuleLibrary />;
    case '/agent-ops':
      return <AgentOps />;
    case '/notes':
      return <Notes />;
    default:
      return <Placeholder title="页面不存在" desc="请从左侧菜单选择页面。" />;
  }
}

export default function App() {
  const { path } = useRoute();
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [path]);
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-400">
            <Spinner /> 加载中…
          </div>
        }
      >
        <Page />
      </Suspense>
      <Toaster />
    </Shell>
  );
}
