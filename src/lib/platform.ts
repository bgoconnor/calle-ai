/** Browser-safe platform configuration. Do not add provider secrets here. */
export const platformConfig = {
  convexUrl: import.meta.env.VITE_CONVEX_URL as string | undefined,
  integrationWorkerUrl: import.meta.env.VITE_INTEGRATION_WORKER_URL as string | undefined,
};

export function requireConvexUrl() {
  if (!platformConfig.convexUrl) {
    throw new Error("VITE_CONVEX_URL is not configured.");
  }
  return platformConfig.convexUrl;
}
