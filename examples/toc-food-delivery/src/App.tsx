import { Suspense, lazy, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Toaster } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/primitives';
import { useRoute } from '@/lib/router';

// 按页面拆分代码，首屏只加载当前页面
const Overview = lazy(() => import('@/pages/Overview').then((m) => ({ default: m.Overview })));
const LivePage = lazy(() => import('@/pages/LivePage').then((m) => ({ default: m.LivePage })));
const OpsPage = lazy(() => import('@/pages/OpsPage').then((m) => ({ default: m.OpsPage })));
const SettlePage = lazy(() => import('@/pages/SettlePage').then((m) => ({ default: m.SettlePage })));
const DesignPage = lazy(() => import('@/pages/DesignPage').then((m) => ({ default: m.DesignPage })));
const FlowOverview = lazy(() => import('@/pages/FlowOverview').then((m) => ({ default: m.FlowOverview })));
const Notes = lazy(() => import('@/pages/Notes').then((m) => ({ default: m.Notes })));

function Page() {
  const { path } = useRoute();
  switch (path) {
    case '/live':
      return <LivePage />;
    case '/ops':
      return <OpsPage />;
    case '/settle':
      return <SettlePage />;
    case '/design':
      return <DesignPage />;
    case '/flow':
      return <FlowOverview />;
    case '/notes':
      return <Notes />;
    default:
      return <Overview />;
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
