import { useSyncExternalStore } from 'react';

/**
 * 极简哈希路由：#/path?query
 * 选择哈希路由是为了打包后可直接作为静态文件挂到集团门户，不依赖服务端路由配置。
 */
export interface Route {
  path: string;
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p || '/', query: new URLSearchParams(q) };
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

const getHash = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '');
  return parse(hash);
}

export function navigate(to: string) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash !== target) window.location.hash = target;
}

export function href(to: string) {
  return to.startsWith('#') ? to : `#${to}`;
}

/** 更新当前路由的 query（不新增历史记录），用于把筛选、页签等状态写进 URL */
export function setQuery(patch: Record<string, string | null | undefined>) {
  const { path, query } = parse(window.location.hash);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') query.delete(k);
    else query.set(k, v);
  }
  const qs = query.toString();
  const next = `#${path}${qs ? `?${qs}` : ''}`;
  window.history.replaceState(null, '', next);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
