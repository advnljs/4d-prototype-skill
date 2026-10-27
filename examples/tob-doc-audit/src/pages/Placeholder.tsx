import { PageHeader } from '@/components/layout/Shell';
import { Empty } from '@/components/ui/primitives';

export function Placeholder({ title, desc }: { title: string; desc?: string }) {
  return (
    <>
      <PageHeader title={title} desc={desc} crumbs={['单据智能核查', title]} />
      <div className="px-10 py-8">
        <Empty icon="layers" title="该页面将在后续里程碑中实现">
          {desc}
        </Empty>
      </div>
    </>
  );
}
