/**
 * 三端联动的演示编排：骑行动画、环节脚本、手动操作时的平台自动派单。
 * PC 的三端联动页与手机 App 共用，保证两个入口演示的是同一套业务。
 */
import { useEffect } from 'react';
import { vClearTimeout, vSetTimeout } from '@/flow/clock';
import { flowStore, useFlow, useFlowStep, type FlowCtl } from '@/flow/director';
import { STEPS, STEP_INDEX, ancestorsOf, stepById, type StepId } from '@/flow/workflow';
import { SCENARIO_MAP } from '@/sim/scenarios';
import { reached, type Stage } from '@/sim/world';
import { advance, legDuration, liveStore, liveUi, prepareAt, pulseRadar, ride, setScores, setUserScreen, useWorld } from './live';

export type Later = (ms: number, fn: () => void) => void;

/** 骑手从当前位置到商家（故障情景：先停在半路、预警、改派，再由新骑手骑到店） */
export function rideToStore(later: Later, onStep?: (k: 'stuck' | 'arrived') => void) {
  const w = liveStore.get().world;
  if (!w.plan || reached(w, 'arrived')) return;
  const legs = w.plan.legs.map((l, i) => ({ l, i })).filter((x) => x.l.kind === 'toStore');
  const first = legs[0];
  ride(first.i, legDuration(w, first.i));
  if (first.l.stuckAt !== undefined) {
    const second = legs[1];
    later(legDuration(w, first.i) + 900, () => {
      onStep?.('stuck');
      advance('reassigned');
      later(1400, () => {
        ride(second.i, legDuration(liveStore.get().world, second.i));
        later(legDuration(liveStore.get().world, second.i) + 200, () => {
          advance('arrived');
          onStep?.('arrived');
        });
      });
    });
  } else {
    later(legDuration(w, first.i) + 200, () => {
      advance('reassigned');
      advance('arrived');
      onStep?.('arrived');
    });
  }
}

export function rideToCustomer(later: Later, onDone?: () => void) {
  const w = liveStore.get().world;
  if (!w.plan || !reached(w, 'picked') || reached(w, 'delivered')) return;
  const leg = w.plan.legs.length - 1;
  ride(leg, legDuration(w, leg));
  later(legDuration(w, leg) + 150, () => onDone?.());
}

/** 手动操作时的“自动驾驶”：用虚拟时钟排程（暂停时同样冻结） */
export const manualLater: Later = (ms, fn) => {
  vSetTimeout(fn, ms);
};

/** 手动操作时，机器环节由平台与外部系统自己完成：商家接单后约 1.5 秒（虚拟时间）自动派单；商家同意退款后网关自动退款 */
export function useAutoDispatch() {
  const w = useWorld();
  const flowActive = useFlow((s) => s.active);
  useEffect(() => {
    if (flowActive || w.stage !== 'accepted') return;
    const id = vSetTimeout(() => {
      if (flowStore.get().active || liveStore.get().world.stage !== 'accepted') return;
      pulseRadar();
      advance('dispatched');
      setScores(true);
    }, 1500);
    return () => vClearTimeout(id);
  }, [flowActive, w.stage]);
  // 商家同意退款后，网关原路退款并回调（外部系统自动完成）
  useEffect(() => {
    if (flowActive || w.stage !== 'refundApproved') return;
    const id = vSetTimeout(() => {
      if (!flowStore.get().active && liveStore.get().world.stage === 'refundApproved') advance('refunded');
    }, 1500);
    return () => vClearTimeout(id);
  }, [flowActive, w.stage]);
}

/* ---------------- 并行分支与线性世界 ---------------- */

const descendants: Record<string, Set<StepId>> = {};
function descendantsOf(id: StepId) {
  return (descendants[id] ??= new Set(STEPS.filter((s) => ancestorsOf(s.id).has(id)).map((s) => s.id)));
}

/**
 * 环节脚本“自备上游”：把世界放到本环节开始前的阶段 pre，返回 'run'。
 * 模拟世界按阶段线性推进，而 DAG 里有并行分支：排在后面的并行环节若已先执行（为自备上游把世界推过了本环节的产出 out），
 * 且本环节的下游都还没做，就只回放、不回退世界（回退会抹掉并行分支的结果），返回 'replay'。
 */
export function prepareStep(id: StepId, pre: Stage, out: Stage): 'run' | 'replay' {
  if (reached(liveStore.get().world, out)) {
    const f = flowStore.get();
    const done = new Set([...f.completed, ...f.assumed]);
    const down = descendantsOf(id);
    const up = ancestorsOf(id);
    const laterParallel = STEPS.some((s) => done.has(s.id) && STEP_INDEX[s.id] > STEP_INDEX[id] && !down.has(s.id) && !up.has(s.id));
    if (laterParallel && ![...down].some((d) => done.has(d))) return 'replay';
  }
  prepareAt(pre);
  return 'run';
}

/** 光标移到锚点；当前入口没有这个锚点（如手机版没有地图卡片）时直接继续，不空等 */
export function look(c: FlowCtl, anchor: string, then: () => void) {
  if (document.querySelector(`[data-flow-anchor="${anchor}"]`)) c.hover(`[data-flow-anchor="${anchor}"]`, then);
  else then();
}

/** 回放：世界已处于本环节完成后的状态，只按子步骤依次高亮 */
export function replaySubs(c: FlowCtl, id: StepId) {
  const subs = stepById(id).subs;
  const go = (i: number) => {
    if (i >= subs.length) {
      c.later(600, () => c.done());
      return;
    }
    c.sub(i);
    const next = () => c.later(1200, () => go(i + 1));
    const a = subs[i].anchor;
    if (a) look(c, a, next);
    else next();
  };
  go(0);
}

/** 三端联动承担的 11 个环节的演示脚本（PC 三端联动页与手机 App 共用；点击目标用 data-demo 约定） */
export function useLiveFlow() {
  // 商家上架开店
  useFlowStep('menu', (c) => {
    if (prepareStep('menu', 'coupon', 'store') === 'replay') return replaySubs(c, 'menu');
    c.sub(0);
    c.hover('[data-demo="merchant-menu"]', () =>
      c.later(1500, () => {
        c.sub(1);
        c.click('[data-demo="merchant-open"]', () => {
          advance('store');
          c.later(900, () => c.done());
        });
      }),
    );
  });

  // 运力预测，骑手上线
  useFlowStep('shift', (c) => {
    if (prepareStep('shift', 'store', 'online') === 'replay') return replaySubs(c, 'shift');
    c.sub(0);
    look(c, 'dispatch-panel', () =>
      c.later(2400, () => {
        c.sub(1);
        c.click('[data-demo="rider-online"]', () => {
          advance('online');
          c.later(1000, () => {
            c.sub(2);
            look(c, 'live-map', () => c.later(1800, () => c.done()));
          });
        });
      }),
    );
  });

  // 用户加购、领券、下单
  useFlowStep('order', (c) => {
    if (prepareStep('order', 'online', 'ordered') === 'replay') return replaySubs(c, 'order');
    const cart = SCENARIO_MAP[liveStore.get().scenario].params.cart;
    c.sub(0);
    c.click('[data-demo="user-store"]', () => {
      setUserScreen('shop');
      const clicks = cart.flatMap((l) => Array.from({ length: l.qty }, () => l.dishId));
      const addNext = (i: number) => {
        if (i >= clicks.length) {
          c.later(500, () => {
            c.sub(1);
            c.click('[data-demo="user-checkout"]', () => {
              advance('cart');
              setUserScreen(null);
              c.later(2600, () => {
                c.sub(2);
                c.click('[data-demo="user-submit"]', () => {
                  advance('ordered');
                  c.later(700, () => c.done());
                });
              });
            });
          });
          return;
        }
        c.click(`[data-demo="add-${clicks[i]}"]`, () => {
          liveUi.set((s) => ({ picked: { ...s.picked, [clicks[i]]: (s.picked[clicks[i]] ?? 0) + 1 } }));
          c.later(250, () => addNext(i + 1));
        });
      };
      c.later(700, () => addNext(0));
    });
  });

  // 支付与回调
  useFlowStep('pay', (c) => {
    if (prepareStep('pay', 'ordered', 'paid') === 'replay') return replaySubs(c, 'pay');
    c.sub(0);
    c.click('[data-demo="user-pay"]', () => {
      c.sub(1);
      c.later(1400, () => {
        advance('paid');
        c.sub(2);
        c.later(2000, () => c.done());
      });
    });
  });

  // 商家接单（逐步模式下先走了并行的“智能派单”时，接单已随派单自备完成，这里只回放）
  useFlowStep('accept', (c) => {
    if (prepareStep('accept', 'paid', 'accepted') === 'replay') return replaySubs(c, 'accept');
    c.sub(0);
    c.later(1600, () => {
      c.sub(1);
      c.click('[data-demo="merchant-accept"]', () => {
        advance('accepted');
        c.later(1800, () => c.done());
      });
    });
  });

  // 智能派单
  useFlowStep('dispatch', (c) => {
    if (prepareStep('dispatch', 'accepted', 'riderAccepted') === 'replay') return replaySubs(c, 'dispatch');
    c.sub(0);
    pulseRadar();
    c.later(1600, () => {
      advance('dispatched');
      setScores(true);
      c.sub(1);
      c.later(3200, () => {
        c.sub(2);
        c.click('[data-demo="rider-accept"]', () => {
          advance('riderAccepted');
          setScores(false);
          c.later(1200, () => c.done());
        });
      });
    });
    return () => setScores(false);
  });

  // 骑手前往商家（故障情景：停在半路 → 预警 → 改派 → 新骑手到店）
  useFlowStep('arrive', (c) => {
    if (prepareStep('arrive', 'riderAccepted', 'arrived') === 'replay') return replaySubs(c, 'arrive');
    const w = liveStore.get().world;
    c.sub(0);
    if (!w.plan?.stuck) {
      const first = w.plan?.legs.findIndex((l) => l.kind === 'toStore') ?? 0;
      c.later(Math.round(legDuration(w, first) * 0.55), () => c.sub(1));
    }
    rideToStore(c.later, (k) => {
      if (k === 'stuck') {
        c.sub(1);
        return;
      }
      c.later(700, () => {
        c.sub(2);
        look(c, 'phone-rider', () => c.later(1400, () => c.done()));
      });
    });
  });

  // 商家备餐出餐
  useFlowStep('cook', (c) => {
    if (prepareStep('cook', 'arrived', 'ready') === 'replay') return replaySubs(c, 'cook');
    c.sub(0);
    look(c, 'phone-merchant', () =>
      c.later(1500, () => {
        c.sub(1);
        look(c, 'event-log', () =>
          c.later(1500, () => {
            c.sub(2);
            c.click('[data-demo="merchant-ready"]', () => {
              advance('ready');
              c.later(1100, () => c.done());
            });
          }),
        );
      }),
    );
  });

  // 取餐与配送（出餐与骑手到店两支在此汇合）
  useFlowStep('deliver', (c) => {
    if (prepareStep('deliver', 'ready', 'delivered') === 'replay') return replaySubs(c, 'deliver');
    c.sub(0);
    c.click('[data-demo="rider-pickup"]', () => {
      advance('picked');
      c.later(700, () => {
        c.sub(1);
        rideToCustomer(c.later, () => {
          c.sub(2);
          c.click('[data-demo="rider-deliver"]', () => {
            advance('delivered');
            c.later(1200, () => c.done());
          });
        });
      });
    });
  });

  // 收货评价
  useFlowStep('confirm', (c) => {
    if (prepareStep('confirm', 'delivered', 'rated') === 'replay') return replaySubs(c, 'confirm');
    c.sub(0);
    c.click('[data-demo="user-confirm"]', () => {
      advance('confirmed');
      c.later(1200, () => {
        c.sub(1);
        c.click('[data-demo="user-rate"]', () => {
          advance('rated');
          c.later(1000, () => c.done());
        });
      });
    });
  });

  // 售后部分退款
  useFlowStep('refund', (c: FlowCtl) => {
    if (prepareStep('refund', 'paidOut', 'refunded') === 'replay') return replaySubs(c, 'refund');
    setUserScreen('refund');
    c.sub(0);
    c.later(1400, () =>
      c.click('[data-demo="user-refund"]', () => {
        advance('refundApplied');
        setUserScreen(null);
        c.later(1500, () => {
          c.sub(1);
          c.click('[data-demo="merchant-refund-ok"]', () => {
            advance('refundApproved');
            c.sub(2);
            c.later(1500, () => {
              advance('refunded');
              c.later(1600, () => c.done());
            });
          });
        });
      }),
    );
  });

  // 页面卸载时收起派单打分
  useEffect(() => () => setScores(false), []);
}
