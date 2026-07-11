# Intake UI integration

Mount `AgencyIntake` from `src/features/intake` in the application router. It is intentionally independent of routing and Convex providers.

```tsx
<AgencyIntake
  adapter={convexIntakeAdapter}
  integrationWorkerUrl={platformConfig.integrationWorkerUrl}
  onLaunched={({ jobId }) => navigate(`/jobs/${jobId}`)}
/>
```

The caller supplies an `IntakeAdapter`: `createDraft` should call `agency.createJob`, `updateDraft` should call `agency.updateBrief`, and `launch` should call `agency.launchDeterministicRun` (or the live manager action when available). When omitted, the feature uses a typed deterministic mock adapter.

Voice recording calls `POST {integrationWorkerUrl}/v1/voice-brief/transcribe` and appends the returned transcript to the natural-language assignment. The current Worker only persists voice artifacts when supplied a `jobId`; the intake run intentionally transcribes before job creation, so wiring a post-create artifact persistence action is an optional backend enhancement rather than a UI requirement.
