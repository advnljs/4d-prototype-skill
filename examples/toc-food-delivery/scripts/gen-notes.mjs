// 由 src/content/notes.ts 生成 docs/原型说明与待确认事项.md 第 4 节（Node 22.6+ 可直接 import .ts）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { NOTE_GROUPS } = await import(join(root, 'src/content/notes.ts'));
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const body = NOTE_GROUPS.map((g) =>
  [`### ${g.title}`, '', g.desc, '', '| 编号 | 事项 | 需求怎么说 / 缺什么 | 原型怎么处理 | 体现在 | 需确认 |', '|---|---|---|---|---|---|', ...g.items.map((i) => `| ${i.id} | ${esc(i.title)} | ${esc(i.detail)} | ${esc(i.handling)} | ${esc(i.where)} | ${esc(i.owner)} |`)].join('\n'),
).join('\n\n');
const file = join(root, 'docs/原型说明与待确认事项.md');
const doc = readFileSync(file, 'utf8');
const out = doc.replace(/<!-- notes:start -->[\s\S]*<!-- notes:end -->/, `<!-- notes:start -->\n${body}\n<!-- notes:end -->`);
writeFileSync(file, out);
console.log(`已生成 ${NOTE_GROUPS.reduce((n, g) => n + g.items.length, 0)} 条`);
