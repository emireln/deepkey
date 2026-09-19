import { ArrowsClockwise, Check, Copy, Vault } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { DEFAULT_GENERATOR, generateSecret } from "@deepkey/vault-core";
import { scorePassword } from "@deepkey/validation";
import { Button, Checkbox, Field, Input, Select, Textarea } from "../components/controls.js";
import { t } from "../i18n/index.js";
import { useVault } from "../state/vault.js";
import { useNavigate } from "react-router-dom";
import type { GeneratorOptions } from "@deepkey/types";

export function GeneratorScreen() {
  const { copySecret, engine, refresh } = useVault();
  const navigate = useNavigate();
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [value, setValue] = useState(() => generateSecret(DEFAULT_GENERATOR));
  const [copied, setCopied] = useState(false);

  const preview = useMemo(() => {
    try {
      return generateSecret(opts);
    } catch {
      return value;
    }
  }, [opts, value]);

  function regen(next = opts) {
    try {
      setValue(generateSecret(next));
    } catch {
      setValue(preview);
    }
  }

  function updateOpts(patch: Partial<GeneratorOptions>) {
    const next = { ...opts, ...patch };
    setOpts(next);
    regen(next);
  }

  async function handleCopy() {
    await copySecret(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const score = opts.kind === "password" || opts.kind === "passphrase" ? scorePassword(value) : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t("generator")}</h1>
          <p className="page-sub">Generate cryptographically secure passwords, passphrases, and tokens.</p>
        </div>
      </div>
      <div className="grid-2" style={{ marginTop: 24, gap: 24, alignItems: "stretch" }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Field label={t("type")}>
            <Select
              value={opts.kind}
              onChange={(e) => {
                const kind = e.target.value as GeneratorOptions["kind"];
                updateOpts({
                  kind,
                  length: kind === "passphrase" ? 6 : opts.kind === "passphrase" ? 24 : opts.length,
                });
              }}
            >
              <option value="password">Password</option>
              <option value="passphrase">{t("passphrase")}</option>
              <option value="token">API Token</option>
              <option value="hex">Hex</option>
              <option value="base64">Base64</option>
              <option value="uuid">UUID</option>
            </Select>
          </Field>

          {opts.kind !== "uuid" ? (
            <Field label={opts.kind === "passphrase" ? `${t("words")}: ${opts.length}` : `${t("length")}: ${opts.length}`}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <input
                  type="range"
                  className="crop-zoom"
                  style={{ margin: 0, flex: 1 }}
                  min={opts.kind === "passphrase" ? 3 : 8}
                  max={opts.kind === "passphrase" ? 12 : 128}
                  value={opts.length}
                  onChange={(e) => updateOpts({ length: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  style={{ width: 84, textAlign: "center" }}
                  min={opts.kind === "passphrase" ? 3 : 8}
                  max={opts.kind === "passphrase" ? 12 : 256}
                  value={opts.length}
                  onChange={(e) => updateOpts({ length: Number(e.target.value) })}
                />
              </div>
            </Field>
          ) : null}

          {opts.kind === "password" ? (
            <div>
              <span className="field-label" style={{ display: "block", marginBottom: 10 }}>Options</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
                <Checkbox checked={opts.uppercase} onChange={(v) => updateOpts({ uppercase: v })} label={t("uppercase")} />
                <Checkbox checked={opts.lowercase} onChange={(v) => updateOpts({ lowercase: v })} label={t("lowercase")} />
                <Checkbox checked={opts.numbers} onChange={(v) => updateOpts({ numbers: v })} label={t("numbers")} />
                <Checkbox checked={opts.symbols} onChange={(v) => updateOpts({ symbols: v })} label={t("symbols")} />
                <div style={{ gridColumn: "1 / -1" }}>
                  <Checkbox checked={opts.avoidAmbiguous} onChange={(v) => updateOpts({ avoidAmbiguous: v })} label={t("avoidAmbiguous")} />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="field-label">{t("value")}</span>
              <span className="cell-muted" style={{ fontSize: 13 }}>{value.length} chars</span>
            </div>
            <Textarea
              mono
              readOnly
              value={value}
              rows={4}
              style={{
                minHeight: 124,
                wordBreak: "break-all",
                resize: "none",
                fontSize: 18,
                lineHeight: 1.6,
                letterSpacing: "0.03em",
                padding: "16px 18px",
                background: "var(--app-bg)",
                border: "1px solid var(--border)",
              }}
            />
            {score ? (
              <div style={{ marginTop: 14 }}>
                <div className={`strength s${score.score}`}>
                  <span />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  <span>Strength</span>
                  <span style={{ fontWeight: 700, color: score.score >= 3 ? "var(--success)" : score.score === 2 ? "var(--warning)" : "var(--danger)" }}>
                    {score.label}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="split" style={{ justifyContent: "flex-end", gap: 10 }}>
            <Button onClick={() => regen()}>
              <ArrowsClockwise size={16} weight="bold" /> {t("regenerate")}
            </Button>
            <Button onClick={handleCopy}>
              {copied ? <Check size={16} weight="bold" style={{ color: "var(--success)" }} /> : <Copy size={16} weight="bold" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const item = await engine.createItem({
                  type: opts.kind === "password" || opts.kind === "passphrase" ? "credential" : "token",
                  name: opts.kind === "passphrase" ? "Generated passphrase" : opts.kind === "password" ? "Generated password" : "Generated token",
                  fields: opts.kind === "password" || opts.kind === "passphrase" ? { password: value } : { value },
                });
                refresh();
                navigate(`/vault/${item.id}`);
              }}
            >
              <Vault size={16} weight="bold" /> {t("saveToVault")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
