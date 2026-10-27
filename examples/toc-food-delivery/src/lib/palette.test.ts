import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildVars, contrast, hexToOklch, oklchToHex, PRESETS, type Mode, type Style } from './palette';

// 原始 token 直接从样式表里读，测试与页面用的是同一份
const css = readFileSync(new URL('../styles/index.css', import.meta.url), 'utf8');
const defaults: Record<string, string> = {};
for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) defaults[m[1]] = m[2];

const PALETTES = [...PRESETS.map((p) => ({ palette: p.key })), ...['#e11d48', '#16a34a', '#f5b400', '#7dd3fc'].map((brand) => ({ palette: 'custom', brand }))];
const MODES: Mode[] = ['light', 'dark'];
const STYLES: Style[] = ['soft', 'sharp'];
const resolved = (vars: Record<string, string>, k: string) => vars[k] ?? defaults[k];

describe('配色引擎', () => {
  it('OKLCH 往返换算误差在 1/255 以内', () => {
    for (const hex of ['#e25507', '#2563eb', '#1c8c50', '#776d66', '#ffffff', '#000000']) {
      const back = oklchToHex(...hexToOklch(hex));
      const d = Math.max(...[1, 3, 5].map((i) => Math.abs(parseInt(back.slice(i, i + 2), 16) - parseInt(hex.slice(i, i + 2), 16))));
      expect(d, `${hex} → ${back}`).toBeLessThanOrEqual(1);
    }
  });

  it('浅色 + 原型默认不覆盖任何颜色（保持手工调好的配色）', () => {
    const vars = buildVars(defaults, { palette: 'default', mode: 'light', style: 'soft' });
    expect(vars).toEqual({});
  });

  for (const p of PALETTES) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`${p.palette}${p.brand ? ` ${p.brand}` : ''} · ${mode} · ${style}：正文、次要文字、链接、按钮与语义色都可读`, () => {
          const vars = buildVars(defaults, { ...p, mode, style });
          const v = (k: string) => resolved(vars, k);
          for (const bg of [v('paper'), v('surface')]) {
            expect(contrast(v('ink-900'), bg)).toBeGreaterThanOrEqual(7);
            expect(contrast(v('ink-500'), bg)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(v('ink-400'), bg)).toBeGreaterThanOrEqual(4.5);
          }
          expect(contrast(v('primary-600'), v('surface'))).toBeGreaterThanOrEqual(4.5);
          expect(contrast('#ffffff', v('primary-500'))).toBeGreaterThanOrEqual(3);
          for (const fam of ['seal', 'amber', 'pine', 'rule', 'agent']) {
            expect(contrast(v(`${fam}-600`), v('surface')), fam).toBeGreaterThanOrEqual(4.5);
          }
          // 浅底（50 / 100）上的同色文字仍可读：标签、提示条常用这种组合
          expect(contrast(v('primary-700'), v('primary-50'))).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  it('深色下中性色反转：画布比正文暗，正文比画布亮', () => {
    const vars = buildVars(defaults, { palette: 'default', mode: 'dark', style: 'soft' });
    expect(hexToOklch(vars['paper'])[0]).toBeLessThan(0.3);
    expect(hexToOklch(vars['ink-900'])[0]).toBeGreaterThan(0.85);
  });

  it('风格“方正”只换阴影（圆角由样式表按 data-style 处理），不改颜色', () => {
    const soft = buildVars(defaults, { palette: 'ocean', mode: 'light', style: 'soft' });
    const sharp = buildVars(defaults, { palette: 'ocean', mode: 'light', style: 'sharp' });
    const strip = (r: Record<string, string>) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('shadow-')));
    expect(strip(sharp)).toEqual(strip(soft));
    expect(sharp['shadow-raise']).toContain('0 0 0 1px');
  });
});

describe('原型界面不写死颜色', () => {
  // 原样呈现的内容可以有自己的颜色：手机里的 App、插画与地图、文件与格式样例；手机版入口（mobile/）不接外观切换
  const ISLAND_FILES = ['components/live/UserApp.tsx', 'components/live/RiderApp.tsx', 'components/live/MerchantApp.tsx', 'components/live/FoodArt.tsx', 'components/live/CityMap.tsx', 'components/live/Phone.tsx', 'components/flow/FormatPreview.tsx'];
  const SKIP = /^(mobile\/|lib\/palette|lib\/theme\.ts$)|\.test\.ts$/;
  const root = new URL('../', import.meta.url);
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => /\.(tsx|ts)$/.test(f) && !SKIP.test(f) && !ISLAND_FILES.includes(f));

  it('外壳、页面与流程组件只用 token：没有 #hex 色值、没有 bg-white 与白色渐变端点、没有 black/ 叠色（遮罩除外）', () => {
    const bad: string[] = [];
    for (const f of files) {
      const lines = readFileSync(new URL(f, root), 'utf8').split('\n');
      let fixedBlock = false; // theme-fixed:start … theme-fixed:end：整段有意保持固定颜色
      lines.forEach((l, i) => {
        if (l.includes('theme-fixed:start')) fixedBlock = true;
        if (l.includes('theme-fixed:end')) fixedBlock = false;
        const marked = fixedBlock || /theme-(island|fixed)/.test(l) || /theme-(island|fixed)/.test(lines[i - 1] ?? '');
        if (marked) return;
        if (/#[0-9a-fA-F]{6}\b/.test(l) || /\bbg-white\b/.test(l) || (/\b(bg|ring|border|divide|text)-black\//.test(l) && !/inset-0/.test(l)) || /(?<![\w-])(from|via|to)-white\b(?!\/)/.test(l)) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 100)}`);
        // 深色下会变浅的实底（ink 深色阶、操作方颜色）上不能用白字：用 text-surface，明暗切换时自动反色
        for (const q of l.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? []) {
          if (/\bbg-(ink-([6-9]00|950)|act-[a-z]+)\b(?!\/)/.test(q) && /(?<![:\w-])text-white\b/.test(q)) bad.push(`${f}:${i + 1}: 反色实底用了 text-white`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it('原样呈现的组件都带 theme-island，切换外观时恢复原始 token', () => {
    for (const f of ['components/live/Phone.tsx', 'components/live/CityMap.tsx', 'components/flow/FormatPreview.tsx']) {
      expect(readFileSync(new URL(f, root), 'utf8'), f).toContain('theme-island');
    }
  });
});
