import { useState } from 'react';
import { PageHeader } from '@/components/layout/Shell';
import { Badge, Button, Modal, Panel, Tabs } from '@/components/ui/primitives';
import { toast } from '@/components/ui/Toast';
import { NOTE_GROUPS } from '@/content/notes';
import { setQuery, useRoute } from '@/lib/router';
import { resetDemo } from '@/state/reset';

export function Notes() {
  const { query } = useRoute();
  const tab = query.get('g') || 'all';
  const [confirm, setConfirm] = useState(false);
  const groups = NOTE_GROUPS.filter((g) => tab === 'all' || g.key === tab);
  const total = NOTE_GROUPS.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <PageHeader
        title="假设与待确认"
        crumbs={['原型讨论区', '假设与待确认']}
        desc={`需求说明书中缺失或不明确的信息，原型按需求大方向做了补充。这里逐条列出补充了什么、在哪里体现、需要谁确认，共 ${total} 条。`}
        actions={
          <Button icon="refresh" onClick={() => setConfirm(true)}>
            重置演示数据
          </Button>
        }
      >
        <Tabs
          value={tab}
          onChange={(v) => setQuery({ g: v === 'all' ? null : v })}
          items={[{ value: 'all', label: '全部', count: total }, ...NOTE_GROUPS.map((g) => ({ value: g.key, label: g.title.replace(/（.*）/, ''), count: g.items.length }))]}
        />
      </PageHeader>
      <div className="space-y-6 px-10 py-7">
        {groups.map((g) => (
          <Panel key={g.key} title={g.title} desc={g.desc} bodyClassName="p-0 pb-2">
            <ul className="divide-y divide-black/[0.05]">
              {g.items.map((it) => (
                <li key={it.id} className="grid grid-cols-[72px_minmax(0,1.1fr)_minmax(0,1fr)_180px] gap-6 px-6 py-4">
                  <span className="code pt-0.5 text-ink-400">{it.id}</span>
                  <div>
                    <div className="font-semibold text-ink-900">{it.title}</div>
                    <p className="mt-1 text-sm leading-relaxed text-ink-600">{it.detail}</p>
                  </div>
                  <div className="text-sm leading-relaxed text-ink-700">
                    <div className="mb-1 text-xs font-medium text-ink-400">原型中的处理</div>
                    {it.handling}
                  </div>
                  <div className="space-y-1.5 text-xs text-ink-500">
                    {it.where ? (
                      <div>
                        体现在 <Badge>{it.where}</Badge>
                      </div>
                    ) : null}
                    {it.owner ? (
                      <div>
                        需确认 <Badge tone="amber">{it.owner}</Badge>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="重置演示数据"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetDemo();
                setConfirm(false);
                toast('success', '演示数据已重置', '角色、各区域规则库、本机核查结果与判例库已恢复初始状态');
              }}
            >
              重置
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-700">将清除本浏览器中演示产生的数据：当前角色、各区域规则库的修改与版本记录、本机核查的批次、判例库。演示数据只保存在本机浏览器中。</p>
      </Modal>
    </>
  );
}
