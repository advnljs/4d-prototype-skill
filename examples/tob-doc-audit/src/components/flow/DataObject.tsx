import { Suspense, lazy, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Badge, Button, Modal, Spinner, Tabs, cx } from '@/components/ui/primitives';
import { ACTORS } from '@/flow/actors';
import { DATA_OBJECTS, type DataKey } from '@/flow/dataObjects';
import { STEPS } from '@/flow/workflow';
import { ActorChip } from './ActorChip';

const SENS_TONE = { 高: 'seal', 中: 'amber', 低: 'pine' } as const;

// 格式样例要用到规则引擎与演示数据，按需加载，不进首屏
const FormatSamplesView = lazy(() => import('./FormatPreview').then((m) => ({ default: m.FormatSamplesView })));

const isFile = (k: DataKey) => ['docFile', 'exportImport', 'exportOnline', 'benchEntry', 'suspect', 'histRow', 'newDecl'].includes(k);

/** 数据对象标签：点击查看结构 */
export function DataChip({ k, onOpen, tone = 'in' }: { k: DataKey; onOpen: (k: DataKey) => void; tone?: 'in' | 'out' }) {
  const d = DATA_OBJECTS[k];
  return (
    <button
      type="button"
      onClick={() => onOpen(k)}
      title={`${d.name}（${d.type}）：点击查看数据结构`}
      className={cx(
        'inline-flex h-[22px] max-w-full items-center gap-1 rounded-[7px] px-1.5 text-2xs font-medium transition-colors',
        tone === 'out' ? 'bg-pine-50 text-pine-700 ring-1 ring-inset ring-pine-100 hover:bg-pine-100/70' : 'bg-ink-50 text-ink-700 ring-1 ring-inset ring-black/[0.06] hover:bg-ink-100',
      )}
    >
      <Icon name={k === 'docFile' || k === 'resultXlsx' || k === 'platformData' ? 'sheet' : k === 'ruleLib' || k === 'ruleDiff' || k === 'policyDoc' ? 'book' : k === 'apiUpload' ? 'link' : 'database'} size={11} className="shrink-0 opacity-70" />
      <span className="truncate">{d.name}</span>
    </button>
  );
}

export function DataObjectModal({ k, onClose }: { k: DataKey | null; onClose: () => void }) {
  const d = k ? DATA_OBJECTS[k] : null;
  const producers = k ? STEPS.filter((s) => s.outputs.includes(k)) : [];
  const consumers = k ? STEPS.filter((s) => s.inputs.includes(k)) : [];
  const [tab, setTab] = useState<'sample' | 'schema'>('sample');
  return (
    <Modal open={!!d} onClose={onClose} width={1000} title={d ? `数据对象：${d.name}` : ''} footer={<Button onClick={onClose}>关闭</Button>}>
      {d && k ? (
        <div className="space-y-4">
          <Tabs<'sample' | 'schema'>
            value={tab}
            onChange={setTab}
            items={[
              { value: 'sample', label: isFile(k) ? '文件格式样例' : '数据格式样例' },
              { value: 'schema', label: '字段结构' },
            ]}
          />
          {tab === 'sample' ? (
            <Suspense
              fallback={
                <div className="flex h-40 items-center justify-center gap-2 text-sm text-ink-400">
                  <Spinner /> 生成样例…
                </div>
              }
            >
              <FormatSamplesView k={k} />
            </Suspense>
          ) : (
            <SchemaView k={k} producers={producers} consumers={consumers} />
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function SchemaView({ k, producers, consumers }: { k: DataKey; producers: typeof STEPS; consumers: typeof STEPS }) {
  const d = DATA_OBJECTS[k];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="code rounded-[7px] bg-ink-50 px-2 py-0.5 text-ink-800">{d.type}</span>
        <ActorChip actor={d.producer} />
        <Badge tone={SENS_TONE[d.sensitivity]} icon="lock">
          敏感度 {d.sensitivity}：{d.sensNote}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed text-ink-700">{d.desc}</p>
      <div className="text-xs text-ink-500">
        <span className="font-medium text-ink-700">载体与存放：</span>
        {d.carrier}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-ink-50 text-left text-xs text-ink-500">
          <tr>
            <th className="rounded-l-[8px] px-3 py-1.5 font-medium">字段</th>
            <th className="px-3 py-1.5 font-medium">类型</th>
            <th className="rounded-r-[8px] px-3 py-1.5 font-medium">说明</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.05] align-top">
          {d.fields.map((f) => (
            <tr key={f.name}>
              <td className="code whitespace-nowrap px-3 py-1.5 text-ink-900">{f.name}</td>
              <td className="code px-3 py-1.5 text-agent-700">{f.type}</td>
              <td className="px-3 py-1.5 text-ink-700">{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <StepList title="由这些环节产生" steps={producers} />
        <StepList title="被这些环节使用" steps={consumers} />
      </div>
    </div>
  );
}

function StepList({ title, steps }: { title: string; steps: typeof STEPS }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-ink-500">{title}</div>
      {steps.length ? (
        <ul className="space-y-1">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-ink-800">
              <span className="num w-5 text-right text-xs text-ink-400">{STEPS.indexOf(s) + 1}</span>
              <span className="min-w-0 truncate">{s.short}</span>
              <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ background: ACTORS[s.actor].color }} title={ACTORS[s.actor].label} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-400">外部来源 / 流程起点</p>
      )}
    </div>
  );
}

/** 业务页面上的“文件格式”入口：在上传、导出、下载按钮旁查看文件长什么样 */
export function FormatLink({ k, label = '文件格式' }: { k: DataKey; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" icon="sheet" onClick={() => setOpen(true)} title={`查看“${DATA_OBJECTS[k].name}”的格式样例与字段结构`}>
        {label}
      </Button>
      <DataObjectModal k={open ? k : null} onClose={() => setOpen(false)} />
    </>
  );
}

/** 便捷 hook：页面里管理一个数据结构弹窗 */
export function useDataModal() {
  const [k, setK] = useState<DataKey | null>(null);
  return { open: setK, modal: <DataObjectModal k={k} onClose={() => setK(null)} /> };
}
