# Prompt 01 — natural-language intake

You own Calle AI's nontechnical job-assignment experience in `src/features/intake/**`.

Read `docs/WORKSTREAMS.md`, `src/lib/agency-contract.ts`, and `convex/README.md` first. Extend the existing project. Do not reinitialize Vite, edit Convex, modify the Worker, modify `src/public/**`, or rewrite `src/main.tsx`.

Build a polished natural-language agency intake with:

- one large brief field: “What should Calle AI create for this business?”
- example briefs for Yucatasia and Chely's
- optional source URLs and image upload UI
- optional voice-brief recorder calling the existing Worker transcription endpoint
- structured-brief review showing business, location, category, languages, deliverables, source strategy, and guardrails
- editable corrections followed by a distinct “Launch agency job” action
- loading, provider-unavailable, validation, and successful-launch states

This is job assignment, not chat. Do not show message bubbles, an assistant transcript, or consumer conversation.

Use the existing backend contracts. When a live Convex provider is absent, expose a typed mock adapter inside your directory. Do not duplicate canonical public-site types.

Export one mountable entry component from `src/features/intake/index.ts` and document its required props/providers. Include focused tests for NL submission, brief correction, and launch gating if the current test stack supports them without replacing project tooling.

Acceptance:

- a nontechnical operator can assign and confirm a job without documentation
- launch is impossible until the structured brief is reviewed
- voice transcript becomes brief input rather than a chat
- `npm run typecheck` and `npm run build` pass
- only files in your owned directory and additive documentation are changed
