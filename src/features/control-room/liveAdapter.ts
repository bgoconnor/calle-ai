import type { ControlRoomAdapter } from "./types";

/**
 * Keeps Convex generated API imports out of this feature. Mounting code supplies
 * the typed query/mutation bridge, allowing this UI to work before Convex is configured.
 */
export const createLiveControlRoomAdapter = (adapter: ControlRoomAdapter): ControlRoomAdapter => ({ ...adapter, mode: "live" });
