#!/usr/bin/env node
// Installs the bundled 4d-prototype Agent Skill (zero dependencies). The default target is Claude Code's skills folder;
// --dir installs it for any agent that loads skills from a folder.
//
//   npx 4d-prototype              → ~/.claude/skills/4d-prototype   (all projects)
//   npx 4d-prototype --project    → ./.claude/skills/4d-prototype   (this project only)
//   npx 4d-prototype --dir <path> → <path>/4d-prototype             (any skills directory, e.g. another agent's)
//   --force                         replace an existing install
import { cpSync, existsSync, lstatSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NAME = '4d-prototype';
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(pkgRoot, 'skills', NAME);
const { version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
const args = process.argv.slice(2);

const usage = `4d-prototype ${version} — install the 4D prototype Agent Skill

Usage: npx 4d-prototype [--project | --dir <path>] [--force]

  (default)      install to ~/.claude/skills/${NAME}
  --project      install to ./.claude/skills/${NAME}
  --dir <path>   install to <path>/${NAME}
  --force        replace an existing install
  -h, --help     show this help
  -v, --version  print the version

Then ask your agent (e.g. Claude Code) to build a prototype from your requirement doc.
Examples and docs: https://github.com/advnljs/4d-prototype-skill`;

if (args.includes('-h') || args.includes('--help')) {
  console.log(usage);
  process.exit(0);
}
if (args.includes('-v') || args.includes('--version')) {
  console.log(version);
  process.exit(0);
}

const known = new Set(['--project', '--dir', '--force']);
const di = args.indexOf('--dir');
const unknown = args.filter((a, i) => !known.has(a) && !(di >= 0 && i === di + 1));
if (unknown.length || (di >= 0 && !args[di + 1]) || (di >= 0 && args.includes('--project'))) {
  console.error(unknown.length ? `Unknown argument: ${unknown.join(' ')}\n` : 'Use either --project or --dir <path>.\n');
  console.error(usage);
  process.exit(2);
}

const parent = di >= 0 ? resolve(args[di + 1]) : args.includes('--project') ? resolve('.claude', 'skills') : join(homedir(), '.claude', 'skills');
const target = join(parent, NAME);

if (existsSync(target) || isLink(target)) {
  if (!args.includes('--force')) {
    const kind = isLink(target) ? 'a symlink' : 'a directory';
    console.error(`${target} already exists (${kind}). Re-run with --force to replace it.`);
    process.exit(1);
  }
  rmSync(target, { recursive: true, force: true });
}

const skip = new Set(['__pycache__', '.DS_Store', 'node_modules']);
cpSync(source, target, { recursive: true, filter: (p) => !skip.has(basename(p)) });
console.log(`Installed ${NAME} ${version} → ${target}`);
console.log('Start a new session of your agent (e.g. Claude Code), then ask it to build a prototype from your requirement doc.');

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}
