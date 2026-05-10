import { useCallback, useEffect, useState } from "react";
import type {
  BackgroundProfile,
  ProfileCompletenessReport,
} from "../core/types.js";
import { fetchProfile, resetProfile } from "./lib/api.js";
import { ProfilePanel } from "./components/ProfilePanel.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { AnalyzePanel } from "./components/AnalyzePanel.js";

type Tab = "chat" | "analyze";

export default function App() {
  const [profile, setProfile] = useState<BackgroundProfile | null>(null);
  const [completeness, setCompleteness] =
    useState<ProfileCompletenessReport | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchProfile()
      .then((res) => {
        if (cancelled) return;
        setProfile(res.profile);
        setCompleteness(res.completeness);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProfileUpdated = useCallback(
    (next: BackgroundProfile, nextCompleteness: ProfileCompletenessReport) => {
      setProfile(next);
      setCompleteness(nextCompleteness);
    },
    [],
  );

  const handleReset = useCallback(async () => {
    const res = await resetProfile();
    setProfile(res.profile);
    setCompleteness(res.completeness);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">
            Job Match Agent
          </h1>
          <p className="text-xs text-neutral-500">
            Super Duper Job Match Agent!
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {loadError && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
            Failed to load profile: {loadError}
          </div>
        )}

        {!profile || !completeness ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
            <aside className="md:col-span-4 lg:col-span-4">
              <ProfilePanel
                profile={profile}
                completeness={completeness}
                onReset={handleReset}
              />
            </aside>

            <section className="md:col-span-8 lg:col-span-8">
              <div className="mb-4 inline-flex rounded-md border border-neutral-200 bg-white p-1">
                <TabButton
                  active={activeTab === "chat"}
                  onClick={() => setActiveTab("chat")}
                >
                  Chat
                </TabButton>
                <TabButton
                  active={activeTab === "analyze"}
                  onClick={() => setActiveTab("analyze")}
                >
                  Analyze
                </TabButton>
              </div>

              {activeTab === "chat" ? (
                <ChatPanel
                  profile={profile}
                  completeness={completeness}
                  onProfileUpdated={handleProfileUpdated}
                />
              ) : (
                <AnalyzePanel completeness={completeness} />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton(props: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base = "px-4 py-1.5 text-sm rounded-md transition-colors";
  const active = "bg-neutral-900 text-white";
  const idle = "text-neutral-700 hover:bg-neutral-100";
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`${base} ${props.active ? active : idle}`}
    >
      {props.children}
    </button>
  );
}
