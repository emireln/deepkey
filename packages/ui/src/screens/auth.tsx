import { useEffect, useState } from "react";
import { AUTO_LOCK_OPTIONS, CLIPBOARD_TIMEOUTS } from "@deepkey/config";
import { scorePassword } from "@deepkey/validation";
import { Logo } from "../components/Logo.js";
import { LoadingScreen } from "../components/LoadingScreen.js";
import { Button, Checkbox, Field, Input, Select } from "../components/controls.js";
import { t } from "../i18n/index.js";
import { useVault } from "../state/vault.js";
import { usePlatform } from "../platform/context.js";
import { DEFAULT_APP_SETTINGS } from "@deepkey/types";

export function DesktopOnboarding() {
  const { createVault, busy, error, settings, saveSettings } = useVault();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const strength = scorePassword(password, [name]);
  const mismatch = confirm.length > 0 && password !== confirm;

  if (busy) return <LoadingScreen />;

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {step === 0 ? (
          <>
            <h1>{t("createVault")}</h1>
            <p>{t("createVaultSub")}</p>
            <Field label={t("displayName")}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label={t("masterPassword")}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className={`strength s${strength.score}`}>
                <span style={{ width: `${(strength.score + 1) * 20}%` }} />
              </div>
              <p className="hint">{strength.hints[0] ?? strength.label}</p>
            </Field>
            <Field label={t("confirmPassword")}>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <p className="hint">{t("forgotWarning")}</p>
            {mismatch ? <p className="error-text">Passwords do not match.</p> : null}
            <div className="split" style={{ marginTop: 20, justifyContent: "flex-end" }}>
              <Button
                variant="primary"
                disabled={!name.trim() || password.length < 12 || password !== confirm}
                onClick={() => setStep(1)}
              >
                {t("next")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <h1>{t("securityPrefs")}</h1>
            <Field label={t("autoLock")}>
              <Select
                value={String(settings.security.autoLockMs)}
                onChange={(e) =>
                  saveSettings({
                    ...settings,
                    security: { ...settings.security, autoLockMs: Number(e.target.value) },
                  })
                }
              >
                {AUTO_LOCK_OPTIONS.map((o) => (
                  <option key={o.id} value={o.ms}>
                    {o.id === "never" ? t("never") : o.id === "immediate" ? t("immediately") : o.id}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("clipboardClear")}>
              <Select
                value={String(settings.security.clipboardTimeoutMs)}
                onChange={(e) =>
                  saveSettings({
                    ...settings,
                    security: { ...settings.security, clipboardTimeoutMs: Number(e.target.value) },
                  })
                }
              >
                {CLIPBOARD_TIMEOUTS.map((o) => (
                  <option key={o.id} value={o.ms}>
                    {o.id === "never" ? t("never") : o.id}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox
              checked={settings.security.lockOnSleep}
              onChange={(v) => saveSettings({ ...settings, security: { ...settings.security, lockOnSleep: v } })}
              label={t("lockOnSleep")}
            />
            <Checkbox
              checked={settings.security.privacyMode}
              onChange={(v) => saveSettings({ ...settings, security: { ...settings.security, privacyMode: v } })}
              label={t("privacyMode")}
            />
            {error ? <p className="error-text">{error}</p> : null}
            <div className="split" style={{ marginTop: 20, justifyContent: "space-between" }}>
              <Button onClick={() => setStep(0)}>{t("back")}</Button>
              <Button variant="primary" disabled={busy} onClick={() => createVault(password, name.trim())}>
                {busy ? t("saving") : t("createVaultAction")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function WebAuth() {
  const platform = usePlatform();
  const [setup, setSetup] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platform.auth?.needsSetup().then(setSetup);
  }, [platform]);

  if (setup === null || busy) return <LoadingScreen />;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (setup) await platform.auth!.setup(username, password);
      else await platform.auth!.login(username, password);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{setup ? t("setupTitle") : t("authTitle")}</h1>
        <p>{setup ? t("setupSub") : t("authSub")}</p>
        <Field label={t("emailUsername")}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </Field>
        <Field label={t("authPassword")}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        {error ? <p className="error-text">{error}</p> : null}
        <Button variant="primary" disabled={busy || username.length < 3 || password.length < 10} onClick={submit}>
          {setup ? t("continue") : t("unlock")}
        </Button>
      </div>
    </div>
  );
}

export function WebVaultSetup() {
  const { createVault, busy, error } = useVault();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const strength = scorePassword(password, [name]);
  if (busy) return <LoadingScreen />;
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{t("vaultPassTitle")}</h1>
        <p>{t("vaultPassSub")}</p>
        <Field label={t("displayName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("masterPassword")}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className={`strength s${strength.score}`}>
            <span style={{ width: `${(strength.score + 1) * 20}%` }} />
          </div>
        </Field>
        <Field label={t("confirmPassword")}>
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <p className="hint">{t("forgotWarning")}</p>
        {error ? <p className="error-text">{error}</p> : null}
        <Button
          variant="primary"
          disabled={busy || !name.trim() || password.length < 12 || password !== confirm}
          onClick={() => createVault(password, name.trim())}
        >
          {t("createVaultAction")}
        </Button>
      </div>
    </div>
  );
}

export function LockScreen() {
  const { unlock, unlockOs, busy, error } = useVault();
  const platform = usePlatform();
  const [password, setPassword] = useState("");
  const [osAvail, setOsAvail] = useState(false);
  useEffect(() => {
    platform.osUnlock?.available().then(setOsAvail);
  }, [platform]);
  if (busy) return <LoadingScreen />;
  return (
    <div className="lock-screen">
      <div className="auth-card">
        <div className="lock-brand">
          <Logo size={36} />
          <span className="brand-word">{t("app")}</span>
        </div>
        <h1>{t("vaultLocked")}</h1>
        <Field label={t("masterPassword")}>
          <Input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") unlock(password);
            }}
          />
        </Field>
        {error ? <p className="error-text">{error}</p> : null}
        <Button variant="primary" disabled={busy || !password} onClick={() => unlock(password)}>
          {busy ? t("unlocking") : t("unlock")}
        </Button>
        {osAvail ? (
          <Button style={{ marginTop: 10, width: "100%" }} onClick={() => unlockOs()}>
            {t("unlockBiometric")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

void DEFAULT_APP_SETTINGS;
