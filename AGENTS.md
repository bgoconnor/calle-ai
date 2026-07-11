# Calle AI developer instructions

## Required first read

Before planning, coding, reviewing, or deploying any change, read:

1. This file.
2. [`docs/HERMES_BUILDATHON_RUBRIC.md`](docs/HERMES_BUILDATHON_RUBRIC.md).
3. [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) when touching shared contracts or owned workstreams.

Every implementation decision should strengthen an observable scoring criterion below. Do not claim an integration, run, customer, output, or metric unless it can be verified live.

## Track

We are competing in **AI as Agency**.

Goal: demonstrate a managed team of agents replacing a local-presence agency end to end. A manager plans; specialists execute; structured artifacts carry context; the manager reviews and requests revisions; exceptions escalate; a non-engineer operates the workflow; the final result ships to a real public URL.

## Max-points quick reference

| Priority | Parameter | Max | L5 evidence judges must see |
| --- | --- | ---: | --- |
| 1 | Real output | 80 | 85%+ success across 3+ repeated end-to-end runs on live surfaces, with exception-only escalation. Each extra autonomous live task during judging adds 20 overflow points. |
| 2 | Observability | 28 | Production-grade run debugging: agent trace tree, inputs/outputs, tools, tokens, cost, latency, filters, run diff, search, and real failure/cost alerts. |
| 3 | Agent organization | 20 | Manager creates or adjusts specialists dynamically, plans for the specific request, delegates, reviews, revises, and receives concrete blocker escalations. |
| 4 | Evaluation | 20 | Failed real runs become versioned eval cases automatically; prompts/agents are versioned; measurable quality improves across versions. |
| 5 | Memory/handoffs | 8 | Every specialist receives current-job context, relevant business history, and agency policies. Stable artifact/item IDs survive all handoffs. |
| 6 | Cost/latency | 4 | A representative full task finishes under 1 minute **and** under $0.10, proven by traces. The worse measure controls the score. |
| 7 | Management UI | 4 | A non-engineer creates a new agent role, assigns tools and guardrails, and runs it unassisted in under 10 minutes. |

Base maximum: **164 points**, plus uncapped real-output overflow.

## Highest-value build order

1. Protect the live end-to-end path: intake → manager plan → specialists → review/revision → approval by exception → published site.
2. Make three repeatable real runs succeed and retain their artifacts and traces.
3. Make the Control Room tell the complete story without terminal access.
4. Make Linkup visibly load-bearing for live menu discovery and testimonial evidence.
5. Add fixed eval cases for menu completeness, conflicting prices, translation direction, ambiguous review matching, exact quotes, and insufficient evidence.
6. Capture real failures as new eval cases and show improvement across prompt/agent versions.
7. Add dynamic/ephemeral role creation only after the live workflow is reliable.

## Architecture requirements

- The Agency Manager owns request-specific planning, delegation, review, revision, and escalation.
- Specialists have narrow roles and write structured, versioned artifacts.
- Handoffs use artifact IDs and stable domain IDs, not lossy prose summaries.
- External capabilities go through the typed tool registry.
- Every tool call, model call, review, revision, artifact write, escalation, and publish action emits a persisted trace.
- Research-derived claims and testimonials retain citations and stable source URLs.
- Direct testimonials must be exact, short quotations. Never synthesize, silently edit, merge, or present a translation as verbatim.
- Menu truth comes from discovered authoritative sources; search rank and reviews do not override owner/official evidence.
- Translation is direction-aware per field: preserve the source language verbatim and generate the missing English or Spanish counterpart.
- Human review should be exception-based. Low confidence, conflicting evidence, unsupported claims, and publish actions are valid escalation points.
- Demo or fixture data must be visibly labeled and never presented as live provider success.

## Partner power-ups

Each verified integration is worth **+25 points**:

- Convex: real application state in the live dashboard.
- Linkup: live search doing essential menu/testimonial work; show code and a live query.
- Cloudflare: live Pages/Worker functionality and dashboard.
- ElevenLabs: voice input performs real work in the product.
- Dodo: real live checkout, not configuration alone.
- Wispr Flow: 500+ dictated words with stats evidence.

Do not spend core-flow reliability to chase a power-up. An integration counts only when a mentor can trigger and verify it live.

## Definition of done

A change is not done until it:

- passes relevant type checks/builds/evals;
- preserves or improves the live end-to-end path;
- emits enough structured evidence to debug and demonstrate it;
- handles empty, error, uncertain, and conflicting states honestly;
- updates contracts, fixtures, operator UI, and documentation when its output shape changes;
- can be explained in terms of the rubric parameter it improves.

When handing off work, state which rubric parameter moved, what live evidence proves it, and what remains between the current state and L5.
