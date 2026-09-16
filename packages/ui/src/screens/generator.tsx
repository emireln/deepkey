import { useMemo, useState } from "react";
import { DEFAULT_GENERATOR, generateSecret } from "@deepkey/vault-core";
import { Button, Checkbox, Field, Input, Select } from "../components/controls.js";
import { t } from "../i18n/index.js";
import { useVault } from "../state/vault.js";
import { useNavigate } from "react-router-dom";
import type { GeneratorOptions } from "@deepkey/types";

export function GeneratorScreen() {
  const { copySecret, engine, refresh } = useVault();
  const navigate = useNavigate();
  const [opts, setOpts] = useState<GeneratorOptions>(DEFAULT_GENERATOR);
  const [value, setValue] = useState(() => generateSecret(DEFAULT_GENERATOR));
  const preview = useMemo(() => {
    try {
      return generateSecret(opts);
    } catch {
      return value;
    }
  }, [opts]);

  return (
    <div>
      <h1 className="page-title">{t("generator")}</h1>
      <div className="grid-2" style={{ marginTop: 24, maxWidth: 760 }}>
        <div className="card">
          <Field label={t("type")}>
            <Select
              value={opts.kind}
              onChange={(e) => setOpts({ ...opts, kind: e.target.value as GeneratorOptions["kind"] })}
            >
              <option value="password">Password</option>
              <option value="token">API Token</option>
              <option value="hex">Hex</option>
              <option value="base64">Base64</option>
              <option value="uuid">UUID</option>
            </Select>
          </Field>
          {opts.kind !== "uuid" ? (
            <Field label={t("length")}>
              <Input
                type="number"
                min={8}
                max={256}
                value={opts.length}
                onChange={(e) => setOpts({ ...opts, length: Number(e.target.value) })}
              />
            </Field>
          ) : null}
          {opts.kind === "password" ? (
            <>
              <Checkbox checked={opts.uppercase} onChange={(v) => setOpts({ ...opts, uppercase: v })} label={t("uppercase")} />
              <Checkbox checked={opts.lowercase} onChange={(v) => setOpts({ ...opts, lowercase: v })} label={t("lowercase")} />
              <Checkbox checked={opts.numbers} onChange={(v) => setOpts({ ...opts, numbers: v })} label={t("numbers")} />
              <Checkbox checked={opts.symbols} onChange={(v) => setOpts({ ...opts, symbols: v })} label={t("symbols")} />
              <Checkbox checked={opts.avoidAmbiguous} onChange={(v) => setOpts({ ...opts, avoidAmbiguous: v })} label={t("avoidAmbiguous")} />
            </>
          ) : null}
        </div>
        <div className="card">
          <Field label={t("value")}>
            <Input mono readOnly value={value} />
          </Field>
          <div className="split">
            <Button
              onClick={() => {
                try {
                  setValue(generateSecret(opts));
                } catch {
                  setValue(preview);
                }
              }}
            >
              {t("regenerate")}
            </Button>
            <Button onClick={() => copySecret(value)}>{t("copy")}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                const item = await engine.createItem({
                  type: opts.kind === "password" ? "credential" : "token",
                  name: opts.kind === "password" ? "Generated password" : "Generated token",
                  fields: opts.kind === "password" ? { password: value } : { value },
                });
                refresh();
                navigate(`/vault/${item.id}`);
              }}
            >
              {t("saveToVault")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
