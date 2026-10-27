import { casebookStore } from './casebook';
import { rectifyStore } from './closure';
import { resultsStore, runCache } from './results';
import { ruleLibStore } from './ruleLibs';
import { sessionStore } from './session';

/** 清空演示过程中产生的数据（角色、各区域规则库的修改与版本、本机核查结果、判例库、整改登记），恢复初始状态 */
export function resetDemo() {
  ruleLibStore.reset();
  resultsStore.reset();
  runCache.clear();
  casebookStore.reset();
  rectifyStore.reset();
  sessionStore.reset();
}
