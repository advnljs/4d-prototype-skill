import { useEffect } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Segmented, cx } from '@/components/ui/primitives';
import { SPEEDS, useSpeed, type Speed } from '@/flow/clock';
import { flowPrefs, nextStep, prevStep, restartFlow, setFlowMode, setFlowSpeed, stopFlow, togglePlay, type FlowMode, type FlowState } from '@/flow/director';

export const SPEED_LABEL: Record<Speed, string> = { 0.25: '0.25×', 0.5: '0.5×', 1: '1×', 2: '2×' };

/** 播放速度：随时可调，立即作用于导演、页面脚本、流水线与 RPA 回放、光标动画 */
export function SpeedControl({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const speed = useSpeed() as Speed;
  return (
    <Segmented<string>
      size={size}
      value={String(speed)}
      onChange={(v) => setFlowSpeed(Number(v) as Speed)}
      items={SPEEDS.map((x) => ({ value: String(x), label: SPEED_LABEL[x] }))}
    />
  );
}

export function ModeControl({ f, size = 'sm' }: { f: FlowState; size?: 'sm' | 'md' }) {
  return (
    <Segmented<FlowMode>
      size={size}
      value={f.mode}
      onChange={setFlowMode}
      items={[
        { value: 'auto', label: '自动连播' },
        { value: 'step', label: '逐步' },
      ]}
    />
  );
}

function RoundBtn({ icon, label, onClick, disabled, primary, size = 36 }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; disabled?: boolean; primary?: boolean; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex shrink-0 items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35',
        primary ? 'bg-primary-500 text-white shadow-[0_6px_16px_-6px_color-mix(in_oklab,var(--color-primary-500)_70%,transparent)] hover:brightness-[1.06]' : 'bg-ink-950/[0.06] text-ink-800 hover:bg-ink-950/[0.1]',
      )}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={primary ? 20 : 16} strokeWidth={primary ? 2 : 1.8} />
    </button>
  );
}

/** 大号播放控制：上一环节 / 暂停·继续 / 下一环节 / 结束 */
export function BigControls({ f }: { f: FlowState }) {
  if (f.status === 'finished')
    return (
      <div className="flex items-center gap-2">
        <RoundBtn icon="refresh" label="重新运行" onClick={restartFlow} primary size={44} />
        <RoundBtn icon="stop" label="结束演示" onClick={stopFlow} />
      </div>
    );
  const waitingNext = f.status === 'step-done' && f.mode === 'step' && !f.paused;
  const playing = !f.paused && !waitingNext;
  return (
    <div className="flex items-center gap-2">
      <RoundBtn icon="skipBack" label="上一环节" onClick={prevStep} disabled={f.trail.length < 2} />
      <RoundBtn icon={playing ? 'pause' : 'play'} label={f.paused ? '继续（空格）' : waitingNext ? '下一环节（空格）' : '暂停（空格）'} onClick={togglePlay} primary size={44} />
      <RoundBtn icon="skip" label="下一环节" onClick={nextStep} />
      <RoundBtn icon="stop" label="结束演示" onClick={stopFlow} />
    </div>
  );
}

/** 全局快捷键：空格 暂停/继续（演示中），[ ] 调整播放速度 */
export function usePlaybackHotkeys(active: boolean) {
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === '[' || e.key === ']') {
        const cur = SPEEDS.indexOf(flowPrefs.get().speed ?? 1);
        const i = Math.max(0, Math.min(SPEEDS.length - 1, cur + (e.key === ']' ? 1 : -1)));
        setFlowSpeed(SPEEDS[i]);
        e.preventDefault();
        return;
      }
      if (active && (e.code === 'Space' || e.key === ' ')) {
        // 捕获阶段处理并阻止默认行为：焦点停在按钮上时也不会再触发一次按钮点击
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) togglePlay();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (active && (e.code === 'Space' || e.key === ' ') && !typing(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
    };
  }, [active]);
}
