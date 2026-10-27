# 4D Prototype · an Agent Skill

Turn requirement documents into **4D prototypes**. A traditional prototype has three dimensions: screens laid out in space. A 4D prototype adds the fourth dimension — **time**. The whole business becomes a timeline that plays by itself in business time, from the first event to the last (scheduled jobs, overnight reconciliation and settlement, parallel branches included). Pause it, change the speed from 0.25× to 2×, jump to any step, replay it, or take over and click at any moment.

Every moment on the timeline shows **who** is acting (people, machines, external systems), **which step** is running (a workflow DAG) and **what the data looks like** right now (original formats, state changes, field-level lineage). Because the flow itself is structured data, it can be **formally verified**: no cycles, every hand-off matches on both ends, any step can start and the rest still completes, required steps never depend on optional ones, illegal state transitions are rejected — checked by tests on every change.

| Pain of a traditional prototype | 4D prototype |
|---|---|
| Static screenshots; someone has to narrate the flow | One click runs the flow, advancing in business time |
| You can't see who does what, and when | One swimlane per actor; the demo cursor shows who is clicking |
| Parallel work, waiting and overnight steps can't be drawn | A DAG for order, a timeline for moments; jump to the next day in one click |
| Whether the flow is right is checked by eye | The flow is structured data, verified by invariant tests |
| Placeholder data | Payloads, tables and spreadsheets in their original form, traceable step by step |
| Every what-if means redrawing | Switch the scenario or change a parameter, and replay on the spot |
| One look for every audience | Switch palette, light / dark and style at any time, or generate the whole palette from the client's brand color |

It fits most IT projects: approvals and tickets, data processing and audit, system integration, admin consoles, dashboards, RPA, multi-party consumer apps, AI and agents. Backends and external systems are deterministic mocks; nothing connects to a real system.

## Install

Pick one:

```bash
npx 4d-prototype              # installs to ~/.claude/skills/4d-prototype (all projects)
npx 4d-prototype --project    # installs to ./.claude/skills/ (this project only)
```

```bash
npx skills add advnljs/4d-prototype-skill    # skills.sh: choose which agents to install it for
```

```bash
clawhub install 4d-prototype                 # ClawHub
```

Then start a new session of your agent (Claude Code or any agent that loads skills) and hand it your requirement materials, for example: "Build a 4D prototype from the requirement docs in refer/".

## What's in this repository

| Path | Contents |
|---|---|
| [skills/4d-prototype](skills/4d-prototype/SKILL.md) | The skill: method, six reference documents, scripts for reading Word / PDF / Excel and driving headless Chrome, and flow-kit, a reference implementation of the time axis |
| [examples/tob-doc-audit](examples/tob-doc-audit/README.md) | B2B example: a group finance shared-service center audits payment documents (rules engine + simulated agent + RPA upload and write-back + dashboard), 14 steps |
| [examples/toc-food-delivery](examples/toc-food-delivery/README.md) | Consumer example: one food-delivery order end to end (three linked apps + dispatch + idempotent payment callbacks + reconciliation and settlement), 17 steps, 6 scenarios, plus a phone version |

The examples' brands, companies, people and data are all fictitious. Their UI is in Chinese — the skill builds the UI in the language of the requirement documents. To run them:

```bash
cd examples/toc-food-delivery && npm install && npm run dev   # http://localhost:5290
cd examples/tob-doc-audit && npm install && npm run dev       # http://localhost:5280
```

Click "一键运行完整流程" (run the whole flow) on the home page. `npm test` runs the flow invariants, scenario and domain tests.

## License

[MIT-0](LICENSE)
