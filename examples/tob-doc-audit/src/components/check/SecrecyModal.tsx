import { useEffect, useState } from 'react';
import { Button, Callout, Modal } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';

/** 需求说明书：核查结果导出时弹窗做数据安全及保密提示 */
export function SecrecyModal({
  open,
  fileName,
  rows,
  sensitive = true,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  rows: number;
  sensitive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (open) setAgree(false);
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      tone="warn"
      title={
        <span className="flex items-center gap-2">
          <Icon name="shield" size={18} className="text-amber-600" />
          数据安全及保密提示
        </span>
      }
      footer={
        <>
          <Button onClick={onCancel} data-demo="secrecy-cancel">
            取消
          </Button>
          <Button variant="primary" icon="download" disabled={!agree} onClick={onConfirm} data-demo="secrecy-confirm">
            确认下载
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm leading-relaxed text-ink-700">
        <p>
          {sensitive
            ? '导出文件包含收付款单据明细（客商名称、账号、交易金额等），属于集团内部敏感数据。'
            : '导出文件仅包含单据编号、银行流水号等非敏感字段，但仍属于集团内业务数据。'}
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>仅限用于单据核查与整改，不得用于其他用途；</li>
          <li>严禁通过个人邮箱、个人即时通讯工具等非公司渠道传输；</li>
          <li>不得存储于个人设备或移动存储介质，使用完毕及时删除；</li>
          <li>本次下载将记录操作人、时间与文件名，纳入操作日志可追溯。</li>
        </ul>
        <Callout tone="neutral" icon="sheet">
          <span className="code break-all">{fileName}</span>
          <span className="ml-2 text-ink-500">共 {rows} 行数据</span>
        </Callout>
        <label className="flex cursor-pointer items-center gap-2 rounded-[12px] border border-ink-950/[0.07] px-3 py-2 hover:bg-ink-50" data-demo="secrecy-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary-500)]" />
          我已阅读上述提示，并承诺遵守数据安全与保密要求
        </label>
      </div>
    </Modal>
  );
}
