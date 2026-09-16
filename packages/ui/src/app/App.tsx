import type { ReactNode } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { ToastHost } from "../components/feedback.js";
import { Titlebar } from "../components/Titlebar.js";
import { PlatformContext } from "../platform/context.js";
import type { PlatformAdapter } from "../platform/types.js";
import { DesktopOnboarding, LockScreen, WebAuth, WebVaultSetup } from "../screens/auth.js";
import { GeneratorScreen } from "../screens/generator.js";
import { FilesManagerScreen, NotesCreateScreen, TrashScreen } from "../screens/misc.js";
import { EnvFilesScreen, EnvImportScreen, ProjectDetailScreen, ProjectsScreen } from "../screens/projects-env.js";
import { AboutScreen, ProfileScreen, SecurityScreen, SettingsScreen } from "../screens/settings.js";
import { ItemDetailScreen, NewSecretScreen, OverviewScreen, VaultListScreen } from "../screens/vault.js";
import { VaultProvider, useVault } from "../state/vault.js";
import { AppShell } from "./Shell.js";

function Gate({ children }: { children: ReactNode }) {
  const { ready, hasVault, unlocked } = useVault();
  if (!ready) {
    return (
      <div className="auth-screen">
        <Titlebar />
      </div>
    );
  }
  if (!hasVault) return <>{children}</>;
  if (!unlocked) return <LockScreen />;
  return <>{children}</>;
}

function RoutesInner() {
  const { hasVault, unlocked } = useVault();
  return (
    <Routes>
      <Route path="/lock" element={hasVault && !unlocked ? <LockScreen /> : <Navigate to="/overview" replace />} />
      <Route path="/setup" element={!hasVault ? <DesktopOnboarding /> : <Navigate to="/overview" replace />} />
      <Route path="/setup-vault" element={!hasVault ? <WebVaultSetup /> : <Navigate to="/overview" replace />} />
      <Route element={<AppShell />}>
        <Route path="/overview" element={<OverviewScreen />} />
        <Route path="/vault" element={<VaultListScreen />} />
        <Route path="/vault/:id" element={<ItemDetailScreen />} />
        <Route path="/vault/:id/edit" element={<EditSecret />} />
        <Route path="/secrets" element={<VaultListScreen filterType={["api_key", "token", "credential", "database", "ssh_key", "certificate", "webhook", "custom"]} />} />
        <Route path="/notes" element={<VaultListScreen filterType="secure_note" />} />
        <Route path="/notes/new" element={<NotesCreateScreen />} />
        <Route path="/files" element={<FilesManagerScreen />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/projects/:id" element={<ProjectDetailScreen />} />
        <Route path="/env" element={<EnvFilesScreen />} />
        <Route path="/env/import" element={<EnvImportScreen />} />
        <Route path="/generator" element={<GeneratorScreen />} />
        <Route path="/trash" element={<TrashScreen />} />
        <Route path="/security" element={<SecurityScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="/about" element={<AboutScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/new" element={<NewSecretScreen />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  );
}

function EditSecret() {
  const { id } = useParams();
  return <NewSecretScreen editId={id} />;
}

function Root({ platform, authed }: { platform: PlatformAdapter; authed: boolean }) {
  const Router = platform.kind === "desktop" ? HashRouter : BrowserRouter;
  if (platform.kind === "web" && !authed) {
    return (
      <Router>
        <WebAuth />
      </Router>
    );
  }
  return (
    <Router>
      <VaultProvider>
        <Boot platform={platform} />
      </VaultProvider>
    </Router>
  );
}

function Boot({ platform }: { platform: PlatformAdapter }) {
  const { ready, hasVault } = useVault();
  if (!ready) return <div className="auth-screen" />;
  if (!hasVault) {
    return platform.kind === "web" ? <WebVaultSetup /> : <DesktopOnboarding />;
  }
  return <RoutesInner />;
}

void Gate;

export function DeepKeyApp({ platform, authed = true }: { platform: PlatformAdapter; authed?: boolean }) {
  return (
    <PlatformContext.Provider value={platform}>
      <ToastHost>
        <Root platform={platform} authed={authed} />
      </ToastHost>
    </PlatformContext.Provider>
  );
}
