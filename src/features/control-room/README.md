# Control room integration

Mount the exported component in a router or dashboard page without changing this feature:

```tsx
import { ControlRoom, mockControlRoomAdapter } from "./features/control-room";

<ControlRoom adapter={mockControlRoomAdapter} />
```

For live mode, create a `ControlRoomAdapter` in the app integration layer. It should map `agency.listJobs`, `agency.getJob`, `agency.approveArtifact`, `agency.retryTask`, and `agency.publishBusiness` from Convex into the portable types in `types.ts`, then pass it through `createLiveControlRoomAdapter`.

The live mapping must read public content from `siteVersions.content`; this control room deliberately does not render the customer site itself. It only links to `/b/:slug` once publishing succeeds.

The built-in data is visibly labelled **Demo data** and represents no live provider success. It includes an escalated low-confidence catalog artifact so judges can test targeted correction and retry.
