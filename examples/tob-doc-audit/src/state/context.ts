import { PROJECT_ENTITIES } from '@/mock/parties';
import type { CheckContext } from '@/rules/types';

/** 原型中的“今天”：与 mock 数据日期对齐 */
export const TODAY = new Date(2026, 9, 14, 9, 30, 0);

/** 组装规则执行上下文：规则参数来自用户所属区域的规则库 + 战略项目主体名单；批次级索引在整批核查时由引擎补上 */
export function buildContext(params: CheckContext['params']): CheckContext {
  return { today: TODAY, params, projectEntities: PROJECT_ENTITIES };
}
