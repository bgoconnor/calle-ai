# Hermes Buildathon scoring rubric

Source: Builder Handbook text supplied by the team on July 11, 2026.

This document is the durable scoring reference for Calle AI. The selected track is **AI as Agency**.

## Eligibility

Every team must use Hermes in at least one of two ways:

1. As the coding partner, with session prompts and receipts available for mentors.
2. As the product's base harness, with at least one Hermes capability doing real work.

No Hermes means no score.

## Scoring formula

Every parameter is scored L1–L5:

- L1: floor; not attempted; 0 points.
- L2: baseline; attempted but missing the core.
- L3: working; does what it claims.
- L4: strong; real quality that stands out.
- L5: exceptional but reachable with excellent shipping.

`points = (level - 1) × weight`

Claims are verified live. Numbers and integration success must be demonstrated from real databases, provider calls, dashboards, traces, and deployed surfaces rather than screenshots or canned data.

## Track 03 — AI as Agency

Track definition: a team of AI agents replaces a full human function. A manager plans, specialists execute, artifacts pass through handoffs, memory persists, and a non-engineer has a control surface.

Base score: **164**, plus uncapped real-output overflow.

### Working product shipping real output — 20x, max 80

- L1: demo-only or canned; no completed tasks.
- L2: agents run but output is broken, hallucinated, incomplete, or under 30% successful.
- L3: working output on staged/test surfaces; 50–70% task success. Staged surfaces cap here.
- L4: real output on real surfaces; 70–85% success; a human approves every step.
- L5: end-to-end output on live surfaces; 85%+ success across at least three repeated runs; exception-only escalation.

Overflow: +20 points per additional real task completed autonomously during judging.

For Calle AI, judges should be able to submit a real business, observe live research and specialist execution, approve only exceptions, and open the resulting live bilingual site.

### Agent organization — 5x, max 20

- L1: one monolithic agent.
- L2: 2–3 agents with fixed handoffs and no manager.
- L3: manager plus specialists with static routing.
- L4: manager dynamically plans for the request, delegates, reviews, and returns at least one output for revision.
- L5: manager spawns specialists on demand; agents escalate concrete blockers; roles adjust to the task.

For Calle AI, the visible target is L4: distinct discovery, normalization, localization, testimonial, publishing, and reporting roles; request-specific plans; manager review/revision traces.

### Observability — 7x, max 28

- L1: console output only.
- L2: persistent structured logs without UI.
- L3: UI can open a run and show each agent step with inputs and outputs.
- L4: cross-agent trace tree, caller relationships, token/cost per step, filters by agent/task.
- L5: side-by-side run diff, failure/cost alerts, global search, production-grade debugging.

For Calle AI, the visible target is L4: every Linkup call, model call, artifact, review, revision, and publish action must be persisted and inspectable in the Control Room.

### Evaluation and iteration — 5x, max 20

- L1: no evals.
- L2: manual spot checks only.
- L3: named fixed eval set with expected outcomes; manually compare versions.
- L4: automatic CI-style eval pipeline that blocks quality regressions.
- L5: failed real runs enter a growing eval set; prompts/agents are versioned; gains are measurable across versions.

For Calle AI, first deliver L3 fixtures for menu completeness, translation direction, unsupported prices, ambiguous item-review matching, exact quotations, and insufficient testimonial evidence. Automate them if time permits.

### Agent handoffs and memory — 2x, max 8

- L1: no memory; every turn restarts.
- L2: one or two identity fields persist.
- L3: context persists within a task but is lost at handoff.
- L4: context survives the task and one or two handoffs; recent history affects decisions.
- L5: current task, customer/business history, and agency policies all survive every handoff.

For Calle AI, the target is L5: current job artifacts, versioned business memory, and versioned agency policies are supplied to every specialist. Stable menu item IDs preserve context across discovery, normalization, translation, testimonials, and publishing.

### Cost and latency per task — 1x, max 4

The worse of latency or cost determines the level:

- L1: over 30 minutes or over $5.
- L2: 10–30 minutes or $2–$5.
- L3: 5–10 minutes or $0.50–$2.
- L4: 1–5 minutes or $0.10–$0.50.
- L5: under one minute and under $0.10.

Trace real end-to-end duration and cost. Use bounded Linkup search loops and stop when 3–4 defensible testimonials are found.

### Management UI — 1x, max 4

- L1: CLI/code only.
- L2: basic developer-only web UI.
- L3: functional UI a PM can operate with documentation.
- L4: clean UI a non-engineer can operate after one walkthrough.
- L5: a non-engineer can create a new role, select tools, set guardrails, and run it in under ten minutes without help.

For Calle AI, the near-term target is L4 through natural-language intake, artifact approval/revision, task retry, trace inspection, and publishing in the Control Room.

## Partner power-ups — 25 points each

Only real use counts; mentors must see it working:

- Wispr Flow: 500+ words dictated during the event; show stats.
- ElevenLabs: voice performs real product work; demonstrate live.
- Convex: stores real product state or serves as primary backend; show repository and dashboard.
- Linkup: live search performs real product work; show code and live query.
- Dodo Payments: live checkout in the product; activated account alone does not count.
- Cloudflare: hosting, Worker, or another Cloudflare product performs real work; show live URL and dashboard.

All six yield +150 points.

## Cross-track bonus — up to 50

Wins outside the selected track score at half weight with the same proof requirements. Relevant opportunities:

- Virality signups, visitors, and reactions/comments.
- Revenue signups, live product quality, and product revenue.
- AI-as-Agency real output and observability are already scored in the selected track and cannot be double-counted.

## Calle AI scoring priorities

1. Ship a repeatable live end-to-end job to a real published URL.
2. Make Linkup visibly load-bearing for menu discovery and testimonial research.
3. Show dynamic manager planning, specialist handoffs, review, and revision.
4. Preserve full provenance: source URL, exact quote, artifacts, stable menu IDs, traces, latency, tokens, and cost.
5. Demonstrate at least three successful real runs and exception-only human review.
6. Keep named eval cases for the failure modes judges are likely to probe.
7. Make the Control Room clear enough for a non-engineer to operate.
8. Demonstrate Convex, Cloudflare, Linkup, and ElevenLabs live; add other power-ups only when genuinely functional.
