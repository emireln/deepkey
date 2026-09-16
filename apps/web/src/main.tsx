import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DeepKeyApp, LoadingScreen } from "@deepkey/ui";
import { createWebPlatform } from "./platform.js";

const platform = createWebPlatform();

function Root() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    platform.auth!.me().then((user) => setAuthed(Boolean(user)));
  }, []);
  if (authed === null) return <LoadingScreen />;
  return <DeepKeyApp platform={platform} authed={authed} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
