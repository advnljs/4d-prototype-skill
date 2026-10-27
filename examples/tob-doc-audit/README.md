# B2B example: document audit assistant (a 4D prototype)

A B2B example of the [4d-prototype](../../skills/4d-prototype/SKILL.md) method: the finance shared-service center of the fictitious "Yuanfan Group" (远帆集团) audits its subsidiaries' payment and receipt documents with a rules engine plus an agent. It shows everything a 4D prototype should have. The core is the fourth dimension, time; the other three are what you see at each moment on the timeline:

- **Time (the fourth dimension)**: one batch unfolds in business time (07:00 master-data sync → 10:30 RPA upload through the API → 14:01 audit → 14:20 review → 15:30 rectification → 02:00 next day, nightly batch → 09:00 next day, dashboard). Run the whole flow with one click, change the speed from 0.25× to 2× at any time, pause with Space, click any node of the DAG to switch to it or replay it. The demo cursor and the "Flow · Data" dock follow along.
- **Actors**: group finance admin, regional finance admin, subsidiary checker and reviewer, plus four machine / external actors: RPA, backend batch, agent, and an external platform (the supplier collaboration portal).
- **Workflow**: a DAG of 14 steps in four lanes — master data (a daily organization sync that fans out to rule maintenance and both upload paths), rule library (AI reads policy documents → natural-language maintenance → tuning from false positives), API upload (RPA upload → write-back to the portal, holding suspicious payment requests), and UI upload (upload → audit → automatic export → review → rectification). They join at the regional view and the dashboard. The nightly batch and the false-positive feedback loop are marked "prototype addition · optional".
- **Appearance**: the "外观" button in the top bar switches the palette (the prototype's own, business blue, jade, violet, graphite, or one generated from the client's brand color), light / dark / system, and a soft or sharp style at any time; format samples (spreadsheets, tables, payloads, external forms) keep their original look.
- **Data**: 18 data objects. Files, database tables and API payloads are shown in their original form, with field-by-field lineage of a document and a counterparty across stages.

> The scenario, group, subsidiaries, counterparties, organization codes, employees, accounts, document numbers and policy documents are all fictitious. The prototype does not call an LLM: deterministic rules really run, and semantic verdicts are preset to the expected agent behavior with the full reasoning trace shown.

Assumptions and open questions that fill gaps in the requirements are in [docs/原型说明与待确认事项.md](docs/原型说明与待确认事项.md) (generated from the same source as the in-app "assumptions and open questions" page; in Chinese, like the UI).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5280 (acceptance viewport 1920×1080) and click "一键运行完整流程" (run the whole flow) on the home page. The home page also has six demo scripts. The "demo role" switch in the top bar simulates the signed-in user; each role has its own menus, permissions and data scope.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (port 5280) |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Rules-engine scenarios (each hits exactly the expected rules, compliant data produces zero findings), batch-level country consistency, rule library and natural-language maintenance, result retention and visibility, xlsx and export layouts, DAG invariants and lineage, docs sync |
| `npm run build` / `npm run preview` | Static build / local preview (port 5281) |

## Pages

| Route | Page | Contents |
|---|---|---|
| `#/` | Scenario tour | Business map, a five-minute primer, demo scripts |
| `#/check` | One-click audit | UI upload / API upload (RPA) → audit with the rule library matched by employee ID → view by category → result file generated and the batch saved |
| `#/results` | Audit results | Batches (visibility by role), batch detail, document view with reasoning trace, review |
| `#/rules` | Rule library | Rule catalog, natural-language maintenance (diff + per-change confirmation), versions, AI reading of policy documents, users and rule libraries |
| `#/cockpit` | Dashboard | Regional / group aggregation with drill-down |
| `#/flow` | Whole-flow overview | DAG, actor swimlanes, file and data formats, lineage, data object catalog, agent touchpoints, case library |
| `#/agent-ops` | Agent run design | Semantic combination statistics, layered architecture, cost estimate, nightly batch simulation |
| `#/notes` | Assumptions and open questions | Added assumptions, doubts about the spec, open questions; reset demo data |

## Technical notes

- Vite + React + TypeScript + Tailwind CSS; the only runtime dependencies are `react` and `react-dom`. xlsx reading and writing and the charts are implemented in-house.
- Hash routing and relative build paths, so `dist/` deploys as static files; pages load on demand.
- Demo state (role, rule libraries and versions per organization, local audit batches, case library) lives in localStorage and can be reset on the assumptions page. Historical batches are a deterministic seed (`src/mock/batches.ts`), recomputed with each organization's initial rule library, so list statistics match the details.
- The time axis (4D orchestration layer) is in `src/flow/` (workflow definition, director, virtual clock, cursor, format samples, lineage) and `src/components/flow/` (navigator, DAG, "Flow · Data" dock, playback controls, swimlanes).

## Layout

```
src/
  domain/      document field mapping, category codes, countries, name cleaning, organizations and roles
  rules/       rule catalog, agent judges, engine (with batch-level rules), templates for rules added in natural language
  agent/       semantic knowledge, audit pipeline, batch-level country index, natural-language rule maintenance
  state/       rule libraries and versions, result retention, case library, session
  flow/        time axis: actors, data objects, workflow (DAG), director, virtual clock, cursor, format samples, lineage
  mock/        fictitious documents and finding scenarios, counterparties and subsidiaries, batch seed, policy summaries
  pages/       pages
  components/  shell, basic components, audit process and result components, charts, flow/
  lib/         router, state, xlsx, sheet parsing, export layouts
docs/          prototype notes, assumptions and open questions (Chinese)
```

## Origin

This example was rewritten from the prototype of a real project: the architecture, pages, time axis and rule mechanics were kept, the domain was replaced with a fictitious group-finance scenario, and every statistic derived from real data was removed.
