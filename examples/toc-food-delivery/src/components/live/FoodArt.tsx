import { useId } from 'react';
import type { DishKind } from '@/domain/catalog';

/** 菜品插画（自绘 SVG，不用图片与 emoji） */
export function FoodArt({ kind, size = 56, steam = false }: { kind: DishKind; size?: number; steam?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <radialGradient id={`bg${id}`} cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#fff7ef" />
          <stop offset="1" stopColor="#ffe3cc" />
        </radialGradient>
        <linearGradient id={`bowl${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f1e6dc" />
        </linearGradient>
        <radialGradient id={`soup${id}`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor={kind === 'tomatoNoodle' ? '#ff8a4a' : '#c9874f'} />
          <stop offset="1" stopColor={kind === 'tomatoNoodle' ? '#e2531f' : '#9c5b2c'} />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#bg${id})`} />
      {kind === 'beefNoodle' || kind === 'tomatoNoodle' ? (
        <g>
          {steam ? (
            <g stroke="#d9c7b8" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8">
              <path d="M24 16c-2-3 2-4 0-7" style={{ animation: 'steam 2.4s ease-out infinite' }} />
              <path d="M32 14c-2-3 2-4 0-7" style={{ animation: 'steam 2.4s ease-out 0.6s infinite' }} />
              <path d="M40 16c-2-3 2-4 0-7" style={{ animation: 'steam 2.4s ease-out 1.2s infinite' }} />
            </g>
          ) : null}
          <ellipse cx="32" cy="31" rx="22" ry="8" fill="#e86a1c" />
          <path d="M10 31c0 12 10 21 22 21s22-9 22-21z" fill={`url(#bowl${id})`} />
          <path d="M14 42c5 6 31 6 36 0" stroke="#f2a15e" strokeWidth="1.4" fill="none" opacity="0.7" />
          <ellipse cx="32" cy="31" rx="19.5" ry="6.4" fill={`url(#soup${id})`} />
          <g stroke="#fff3dc" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.9">
            <path d="M18 31c4-2 8 2 12 0s8-2 12 0" />
            <path d="M20 33.5c4-2 8 2 12 0s7-2 10 0" />
          </g>
          {kind === 'beefNoodle' ? (
            <g>
              <path d="M22 27.5c2-2 6-2 7 0-1 2-5 2.5-7 0z" fill="#7a2f1d" />
              <path d="M33 26.5c2.5-1.6 6.5-1.2 7 1-1.4 1.8-5.5 1.6-7-1z" fill="#8a3820" />
              <circle cx="38" cy="32" r="1.3" fill="#3fae62" />
              <circle cx="26" cy="32.5" r="1.1" fill="#3fae62" />
              <circle cx="31" cy="29.5" r="1" fill="#57c27a" />
            </g>
          ) : (
            <g>
              <path d="M22 28c2-2.5 6-2.5 7-.5-1.5 2.5-5 2.8-7 .5z" fill="#ffd34d" />
              <path d="M34 27c2-1.8 5.5-1.6 6.5.4-1.3 2.2-5 2.2-6.5-.4z" fill="#ffcf3f" />
              <circle cx="30" cy="31.5" r="2" fill="#e8401c" />
              <circle cx="38" cy="31" r="1.6" fill="#ee4d23" />
              <circle cx="25" cy="32" r="1" fill="#3fae62" />
            </g>
          )}
        </g>
      ) : kind === 'egg' ? (
        <g>
          <ellipse cx="32" cy="46" rx="18" ry="4" fill="#f0d9c4" />
          <ellipse cx="32" cy="34" rx="13" ry="15" fill="#8b4a22" />
          <ellipse cx="29" cy="29" rx="4" ry="6" fill="#a96236" opacity="0.6" />
          <path d="M22 37h20c-1.5 7-5 10-10 10s-8.5-3-10-10z" fill="#f6e9d8" />
          <ellipse cx="32" cy="38.5" rx="5.5" ry="3.4" fill="#f2a52b" />
        </g>
      ) : kind === 'tea' ? (
        <g>
          <path d="M40 8 34 22" stroke="#3fae62" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M19 20h26l-3 30a4 4 0 0 1-4 3.6H26A4 4 0 0 1 22 50z" fill="#fff4c9" stroke="#f3d88a" strokeWidth="1" />
          <path d="M20.6 30h22.8l-2 20a4 4 0 0 1-4 3.6H26.6a4 4 0 0 1-4-3.6z" fill="#f7c948" opacity="0.85" />
          <rect x="25" y="33" width="6" height="6" rx="1.4" fill="#ffffff" opacity="0.75" transform="rotate(-12 28 36)" />
          <rect x="33" y="38" width="6" height="6" rx="1.4" fill="#ffffff" opacity="0.7" transform="rotate(10 36 41)" />
          <circle cx="44" cy="22" r="7" fill="#ffe066" stroke="#f2c230" strokeWidth="1.4" />
          <path d="M44 15v14M37 22h14M39 17l10 10M49 17 39 27" stroke="#f2c230" strokeWidth="0.9" opacity="0.8" />
        </g>
      ) : (
        <g>
          <ellipse cx="32" cy="40" rx="22" ry="10" fill="#ffffff" stroke="#efe2d6" />
          <g fill="#4caf50">
            <path d="M18 36l7-4 3 5-7 4z" />
            <path d="M28 33l7-3 2 5-7 3z" fill="#5bbf5e" />
            <path d="M37 36l7-3 2 6-7 3z" />
            <path d="M24 41l7-2 2 5-7 2z" fill="#66c86a" />
            <path d="M34 41l7-1 1 5-7 1z" fill="#58b85c" />
          </g>
          <g fill="#e8401c">
            <circle cx="27" cy="38" r="0.9" />
            <circle cx="36" cy="37" r="0.9" />
            <circle cx="31" cy="43" r="0.9" />
            <circle cx="41" cy="41" r="0.9" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** 品牌标识：一颗橙子 */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="brand-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff9a3c" />
          <stop offset="1" stopColor="#f05a0a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#brand-g)" />
      <circle cx="32" cy="35" r="16" fill="#fff" />
      <path d="M32 19c2-6 7-8 11-7-1 5-5 8-11 7z" fill="#3fae62" />
      <circle cx="32" cy="35" r="10" fill="#ff8a25" />
      <path d="M32 27v16M24 35h16M26.5 29.5l11 11M37.5 29.5l-11 11" stroke="#ffd1a6" strokeWidth="1.2" />
    </svg>
  );
}

/** 店铺头像 */
export function StoreBadge({ size = 40 }: { size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-b from-[#3a2a20] to-[#1f1510] font-semibold text-[#ffd8b0]" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      张记
    </span>
  );
}

/** 骑手头像 */
export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {name.slice(-1)}
    </span>
  );
}
