import { useEffect, useState } from "react";
import { AgencyIntake, QuickIntake } from "./features/intake";
import { ControlRoom, mockControlRoomAdapter } from "./features/control-room";
import { platformConfig } from "./lib/platform";
import { ConnectedPublicSite } from "./public/ConnectedPublicSite";
import { createLiveControlAdapter, createLiveIntakeAdapter } from "./lib/liveAgency";
import { DevEvalLab, MenuEvalLab } from "./features/evals";
import "./app.css";

type Route =
  | { kind: "quick" }
  | { kind: "advanced" }
  | { kind: "control"; jobId?: string }
  | { kind: "evals" }
  | { kind: "dev-evals" }
  | { kind: "site"; slug: string };

function readRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const site = path.match(/^\/b\/([^/]+)$/);
  if (site) return { kind: "site", slug: decodeURIComponent(site[1]) };
  const job = path.match(/^\/jobs\/([^/]+)$/);
  if (job) return { kind: "control", jobId: decodeURIComponent(job[1]) };
  if (path === "/jobs") return { kind: "control" };
  if (path === "/advanced") return { kind: "advanced" };
  if (path === "/evals/dev") return { kind: "dev-evals" };
  if (path === "/evals") return { kind: "evals" };
  return { kind: "quick" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());
  const intakeAdapter = platformConfig.convexUrl ? createLiveIntakeAdapter(platformConfig.convexUrl) : undefined;
  const controlAdapter = platformConfig.convexUrl ? createLiveControlAdapter(platformConfig.convexUrl) : mockControlRoomAdapter;

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setRoute(readRoute());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (route.kind === "site") return <ConnectedPublicSite slug={route.slug} convexUrl={platformConfig.convexUrl} />;

  return (
    <div className="app-frame">
      <header className="app-nav">
        <button className="app-wordmark" onClick={() => navigate("/")}>
          <span>Calle</span> AI
        </button>
        <nav aria-label="Agency navigation">
          <button className={route.kind === "quick" || route.kind === "advanced" ? "active" : ""} onClick={() => navigate("/")}>New job</button>
          <button className={route.kind === "control" ? "active" : ""} onClick={() => navigate("/jobs")}>Control room</button>
          <button className={route.kind === "evals" || route.kind === "dev-evals" ? "active" : ""} onClick={() => navigate("/evals")}>Agent lab</button>
          <a href="/b/chely-s-beauty-salon">Live storefront ↗</a>
        </nav>
      </header>

      {route.kind === "quick" ? (
        <QuickIntake
          adapter={intakeAdapter}
          onAdvanced={() => navigate("/advanced")}
          onLaunched={({ jobId }) => navigate(`/jobs/${jobId}`)}
        />
      ) : route.kind === "advanced" ? (
        <AgencyIntake
          adapter={intakeAdapter}
          integrationWorkerUrl={platformConfig.integrationWorkerUrl}
          onLaunched={({ jobId }) => navigate(`/jobs/${jobId}`)}
        />
      ) : route.kind === "evals" ? (
        <MenuEvalLab />
      ) : route.kind === "dev-evals" ? (
        <DevEvalLab convexUrl={platformConfig.convexUrl} onOpenJob={(jobId) => navigate(`/jobs/${jobId}`)} />
      ) : (
        <ControlRoom adapter={controlAdapter} initialJobId={route.jobId} />
      )}
    </div>
  );
}
