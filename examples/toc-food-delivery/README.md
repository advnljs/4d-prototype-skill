# Consumer example: one food-delivery order, end to end (a 4D prototype)

A consumer example of the [4d-prototype](../../skills/4d-prototype/SKILL.md) method: the fictitious on-demand delivery platform "Orange Home" (橙子到家). One order goes from opening the store, couriers coming online, ordering and payment, accepting and cooking in parallel with dispatch and the ride to the store, pickup and delivery, rating and the operations dashboard, to next-day reconciliation, settlement, payout and a partial refund offset in the next cycle. The highlights are **the time axis (the fourth dimension) + linked apps + an order state machine + real-time dispatch**; actors, workflow and data are what you see at each moment on the timeline:

- **Time (the fourth dimension)**: a business clock (10:50 couriers online → 11:52 order → 12:20 delivered → next day 01:00 reconciliation, 02:00 settlement, 08:00 payout → day after 02:00 offset). Change the speed from 0.25× to 2× at any time, pause with Space, click any node of the DAG to switch to it or replay it. Couriers move smoothly across the map on the virtual clock.
- **Actors**: customer, merchant, courier, city operations; platform services, dispatch (algorithm), scheduled jobs; the payment gateway (external, simulated).
- **Workflow**: a DAG of 17 steps in four lanes. The merchant branch (accept → cook) runs in parallel with the dispatch branch (couriers online → dispatch → courier at the store) and they join at pickup and delivery. The money branch starts from the payment flow (channel reconciliation → T+1 settlement → payout), and the refund joins settlement at the next-cycle offset. T+1 settlement is marked "required by the spec"; the partial refund and the offset are "prototype addition · optional".
- **Data**: 16 data objects. App screens, database tables, API payloads and the reconciliation spreadsheet are shown in their original form, with stage-by-stage field changes and state transitions of "one order" and "one payment".

> Brand, merchants, people, addresses, coordinates and all data are fictitious; the map is a stylized diagram and the payment gateway is simulated. Nothing connects to a real system.

The (fictitious) requirement summary, added assumptions and open questions are in [docs/原型说明与待确认事项.md](docs/原型说明与待确认事项.md) (section 4 is generated from the same source as the in-app assumptions page; in Chinese, like the UI).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5290 (acceptance viewport 1920×1080). Click "一键运行完整流程" (run the whole flow) on the home page to play the whole flow; you can pick a scenario in the dialog. Or open "三端联动" (linked apps) and click through the three phones yourself — dispatch happens automatically after the merchant accepts.

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (port 5290; desktop at `/`, phone version at `/app.html`) |
| `npm run dev:lan` | Same, reachable from phones on the local network |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Pricing, order state machine (including illegal transitions), dispatch scoring and ETA, idempotent payment callbacks, settlement balancing and refund allocation, reconciliation and payout offsets, expected results of the six scenarios, DAG invariants (parallel branches and joins), format samples and lineage, docs sync |
| `npm run build` / `npm run preview` | Static build / local preview (port 5291) |
| `node scripts/gen-notes.mjs` | Regenerate section 4 of the notes document from `src/content/notes.ts` |

## Phone version

Open http://localhost:5290/app.html (acceptance viewport: iPhone 16, 393×852 CSS px). One phone holds four apps:

- **Orange Home (customer)**: home, store and menu, order confirmation with price calculation, checkout (simulated gateway), order tracking on a map, rating, after-sales.
- **Merchant**: dishes and stock, opening the store, new-order alert and accept, cooking countdown, food ready, refunds.
- **Courier**: lunch-peak capacity forecast and going online, dispatch sheet with "why you got this order" scores, store / pickup / delivery tasks, breakdown and reassignment, earnings.
- **Operations**: live dashboard, coupon publishing, money (channel reconciliation → T+1 settlement → payout → next-cycle offset).

In a one-click run the phone switches between the four apps to follow whoever acts in the current sub-step, a capsule at the top shows the current step, and a touch indicator replaces the finger. On a computer it shows inside an iPhone frame with narration on the left and platform events on the right. It is a mobile web prototype, not a native iOS / Android project, and shares `src/sim`, `src/state`, `src/flow` and the step scripts with the desktop version.

## Pages

| Route | Page | Contents |
|---|---|---|
| `#/` | Scenario tour | A five-minute primer, the six scenarios one click away, business map |
| `#/live` | Linked apps | Customer / merchant / courier phones + map + capacity forecast and dispatch scoring + order state machine + fulfillment timeline + platform events |
| `#/ops` | Operations console | Live dashboard, coupon configuration (`?tab=coupon`) |
| `#/settle` | Settlement center | Money flow overview, channel reconciliation, T+1 split, where one order's money goes, reconciliation spreadsheet (downloadable), payout, next-cycle offset |
| `#/flow` | Whole-flow overview | DAG / swimlanes, actors, lineage, file and data formats, data object catalog, automation and human checkpoints |
| `#/design` | Solution discussion | Dispatch weight sliders that re-rank couriers live, payment-callback idempotency sequence, coupon threshold definitions and subsidies |
| `#/notes` | Assumptions and open questions | 33 added assumptions, gaps in the spec and open questions; reset demo data |

## Scenarios

| Scenario | What to look at |
|---|---|
| Standard order (lunch peak) | Merchant "¥6 off over ¥50" + platform coupon "¥8 off over ¥40", ¥49 paid; dispatched to the courier on the way; about 29 minutes to deliver; the platform earns ¥0.07 on this order |
| Slow kitchen, courier waits | Food takes 25 minutes; a warning after 10 minutes of waiting, a reminder and a waiting subsidy; 9 minutes late, a ¥3 compensation coupon |
| Courier breakdown, reassignment | The courier stops for 3 minutes → warning → reassigned to the nearest courier, still on time |
| Rain surcharge | Delivery fee +¥2, courier subsidy +¥3, promised time relaxed to 12:30; the platform subsidizes this order |
| Duplicate payment callback | The gateway resends the same trade_no; the platform ignores it idempotently and does not notify the merchant twice |
| Coupon threshold | ¥40 list price, ¥37 after the merchant discount: the platform coupon can't be used, with a "¥3 short" hint |

Every scenario ends with after-sales: a missing item, a ¥2.25 partial refund allocated by list-price share; the order has already been settled and paid out, so the refund is offset in the next settlement cycle at 02:00 the day after.

## Technical notes

- Vite + React + TypeScript + Tailwind CSS; the only runtime dependencies are `react` and `react-dom`. Map, illustrations, charts and xlsx writing are implemented in-house.
- The simulated backend is `src/sim/world.ts`: pure actions (World → World) shared by pages, the time axis, format samples, lineage and tests; `advanceTo` lets any step supply its own upstream.
- The world advances through linear stages while the DAG has parallel branches: step scripts use `prepareStep(id, pre, out)` (`src/state/liveFlow.ts`), so a parallel step that already ran is replayed, not rewound. A one-click run follows `STEPS` in business-time order.
- Animations use only `transform` / `opacity`; courier positions are interpolated from the virtual clock (`vNow()` is read-only), so pausing freezes them; `prefers-reduced-motion` is respected.
- The time axis (4D orchestration layer) is in `src/flow/` and `src/components/flow/`, adapted from the B2B example.

## Layout

```
src/
  domain/      catalog and map, pricing, order state machine, dispatch scoring, payment payloads and idempotency, settlement and refunds, seed data
  sim/         simulated world and actions, scenarios
  state/       linked-apps state, session, coupon draft, reset
  flow/        time axis: actors, data objects, workflow (DAG), director, virtual clock, cursor, format samples, lineage
  components/  live/ (phone frames, the three apps, map, dispatch board, state machine, timeline, events), flow/, ui/, layout/
  pages/       desktop pages
  mobile/      phone version: entry, frame and narration, phone OS layer, the four apps, demo layer
  content/     assumptions and open questions (notes.ts)
docs/          prototype notes, assumptions and open questions (Chinese)
scripts/       gen-notes.mjs
```
