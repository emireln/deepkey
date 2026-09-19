import { Plus } from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { parseEnv } from "@deepkey/env-parser";
import type { EnvExportFormat, EnvImportDecision } from "@deepkey/types";
import { Button, EmptyState, Field, Input, SecretField, Select, Textarea } from "../components/controls.js";
import { Dialog, PasswordPrompt, useToast } from "../components/feedback.js";
import { t } from "../i18n/index.js";
import { bytesFromText } from "../lib/format.js";
import { usePlatform } from "../platform/context.js";
import { useVault } from "../state/vault.js";

const EnvEditor = lazy(() => import("../components/EnvEditor.js").then((m) => ({ default: m.EnvEditor })));

export function ProjectsScreen() {
  const { engine, refresh, tick } = useVault();
  void tick;
  const [params, setParams] = useSearchParams();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(params.get("new") === "1");
  const navigate = useNavigate();
  const projects = engine.projects();
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t("projects")}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> {t("newProject")}
        </Button>
      </div>
      {creating ? (
        <div className="card" style={{ maxWidth: 420, marginBottom: 20 }}>
          <Field label={t("name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <div className="split">
            <Button
              onClick={() => {
                setCreating(false);
                setParams({});
              }}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const p = await engine.createProject(name.trim());
                await engine.createEnvironment(p.id, "Development");
                await engine.createEnvironment(p.id, "Production");
                refresh();
                navigate(`/projects/${p.id}`);
              }}
              disabled={!name.trim()}
            >
              {t("create")}
            </Button>
          </div>
        </div>
      ) : null}
      {projects.length ? (
        <div className="list">
          {projects.map((p) => (
            <div
              key={p.id}
              className="list-row"
              role="button"
              tabIndex={0}
              style={{ gridTemplateColumns: "1fr auto" }}
              onClick={() => navigate(`/projects/${p.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/projects/${p.id}`);
                }
              }}
            >
              <span>{p.name}</span>
              <span className="cell-muted">{engine.environments(p.id).map((e) => e.name).join(" · ")}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t("noProjects")} actions={<Button variant="primary" onClick={() => setCreating(true)}>{t("newProject")}</Button>} />
      )}
    </div>
  );
}

export function ProjectDetailScreen() {
  const { id } = useParams();
  const { engine, refresh, copySecret, settings } = useVault();
  const navigate = useNavigate();
  const project = id ? engine.getProject(id) : null;
  const [envId, setEnvId] = useState(engine.environments(id ?? "")[0]?.id ?? "");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const [newEnv, setNewEnv] = useState("");
  const [confirm, setConfirm] = useState(false);
  if (!project) return <p>{t("errorGeneric")}</p>;
  const vars = envId ? engine.envItems(project.id, envId) : [];
  return (
    <div>
      <button className="back" type="button" onClick={() => navigate("/projects")}>
        {t("back")}
      </button>
      <div className="page-head">
        {renaming ? (
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <h1 className="page-title">{project.name}</h1>
        )}
        <div className="split">
          {renaming ? (
            <Button
              variant="primary"
              onClick={async () => {
                await engine.updateProject(project.id, { name });
                setRenaming(false);
                refresh();
              }}
            >
              {t("save")}
            </Button>
          ) : (
            <Button onClick={() => setRenaming(true)}>{t("rename")}</Button>
          )}
          <Button
            onClick={async () => {
              const copy = await engine.duplicateProject(project.id);
              refresh();
              navigate(`/projects/${copy.id}`);
            }}
          >
            {t("duplicate")}
          </Button>
          <Button
            onClick={async () => {
              await engine.updateProject(project.id, { archived: true });
              refresh();
              navigate("/projects");
            }}
          >
            {t("archive")}
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            {t("delete")}
          </Button>
        </div>
      </div>
      {project.description ? <p className="page-sub">{project.description}</p> : null}
      <div className="toolbar">
        <Select value={envId} onChange={(e) => setEnvId(e.target.value)}>
          {engine.environments(project.id).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <Input placeholder={t("createEnv")} value={newEnv} onChange={(e) => setNewEnv(e.target.value)} style={{ maxWidth: 200 }} />
        <Button
          disabled={!newEnv.trim()}
          onClick={async () => {
            const env = await engine.createEnvironment(project.id, newEnv.trim());
            setNewEnv("");
            setEnvId(env.id);
            refresh();
          }}
        >
          {t("createEnv")}
        </Button>
        <Button variant="primary" onClick={() => navigate(`/new?type=env_var&project=${project.id}&env=${envId}`)}>
          {t("addVariable")}
        </Button>
      </div>
      {vars.length ? (
        <div className="list">
          {vars.map((item) => (
            <div key={item.id} className="list-row" style={{ gridTemplateColumns: "1fr 1.4fr auto" }}>
              <button type="button" className="btn ghost" style={{ justifyContent: "flex-start" }} onClick={() => navigate(`/vault/${item.id}`)}>
                {item.name}
              </button>
              <SecretField value={item.fields.value ?? ""} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} />
              <span />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t("noSecrets")} actions={<Button variant="primary" onClick={() => navigate(`/new?type=env_var&project=${project.id}&env=${envId}`)}>{t("addVariable")}</Button>} />
      )}
      {confirm ? (
        <Dialog
          title={t("confirmDelete")}
          body={t("confirmDeleteSub")}
          confirm={t("delete")}
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await engine.deleteProject(project.id);
            refresh();
            navigate("/projects");
          }}
        />
      ) : null}
    </div>
  );
}

export function EnvFilesScreen() {
  const { engine, tick, refresh, copySecret, settings } = useVault();
  void tick;
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [projectId, setProjectId] = useState(engine.projects()[0]?.id ?? "");
  const [envId, setEnvId] = useState("");
  const [otherEnvId, setOtherEnvId] = useState("");
  const [comparing, setComparing] = useState(params.get("compare") === "1");
  const [hideSame, setHideSame] = useState(true);
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [raw, setRaw] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [filename, setFilename] = useState(".env");
  const [exportFormat, setExportFormat] = useState<EnvExportFormat>("dotenv");
  const [pwOpen, setPwOpen] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pendingPlaintext, setPendingPlaintext] = useState<"copy" | "export" | null>(null);
  const platform = usePlatform();
  const envs = projectId ? engine.environments(projectId) : [];
  useEffect(() => {
    setEnvId(envs[0]?.id ?? "");
  }, [projectId]);
  useEffect(() => {
    if (projectId && envId) setRaw(engine.exportEnv(projectId, envId));
  }, [projectId, envId, tick]);
  useEffect(() => {
    if (!comparing) return;
    const other = envs.find((env) => env.id !== envId);
    if (other && !otherEnvId) setOtherEnvId(other.id);
  }, [comparing, envs, envId, otherEnvId]);
  const parsed = useMemo(() => parseEnv(raw), [raw]);
  const items = projectId && envId ? engine.envItems(projectId, envId) : [];
  const diff =
    comparing && projectId && envId && otherEnvId && envId !== otherEnvId
      ? engine.diffEnvironments(projectId, envId, otherEnvId)
      : [];
  const visibleDiff = hideSame ? diff.filter((row) => row.status !== "same") : diff;

  async function applyRaw() {
    if (!projectId || !envId) return;
    await engine.replaceEnvFromRaw(projectId, envId, raw);
    refresh();
    toast(t("saved"));
  }

  function payloadForFormat() {
    return engine.exportEnv(projectId, envId, exportFormat);
  }

  function exportFilename() {
    if (exportFormat === "compose") return "compose.env.yaml";
    if (exportFormat === "kubernetes") return "secret.yaml";
    return filename;
  }

  async function finishPlaintext(kind: "copy" | "export") {
    const text = payloadForFormat();
    if (kind === "copy") copySecret(text);
    else await platform.files.save(exportFilename(), bytesFromText(text), "text/plain");
    setExportOpen(false);
    setPwOpen(false);
    setPendingPlaintext(null);
  }

  function requestPlaintext(kind: "copy" | "export") {
    if (settings.security.requirePasswordForExport) {
      setPendingPlaintext(kind);
      setPwError(null);
      setPwOpen(true);
      return;
    }
    void finishPlaintext(kind);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t("envFiles")}</h1>
        <div className="split">
          <Button className={comparing ? "is-on" : ""} onClick={() => setComparing((v) => !v)}>
            {t("compareEnvs")}
          </Button>
          <Button onClick={() => navigate("/env/import")}>{t("importEnv")}</Button>
          <Button onClick={() => setExportOpen(true)}>{t("exportEnv")}</Button>
          <Button onClick={() => requestPlaintext("copy")}>{t("copyEnv")}</Button>
        </div>
      </div>
      <div className="toolbar">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {engine.projects().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={envId} onChange={(e) => setEnvId(e.target.value)}>
          {envs.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        {comparing ? (
          <Select value={otherEnvId} onChange={(e) => setOtherEnvId(e.target.value)}>
            {envs
              .filter((env) => env.id !== envId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </Select>
        ) : null}
        {!comparing ? (
          <>
            <Button className={mode === "structured" ? "is-on" : ""} onClick={() => setMode("structured")}>
              {t("structured")}
            </Button>
            <Button className={mode === "raw" ? "is-on" : ""} onClick={() => setMode("raw")}>
              {t("raw")}
            </Button>
            {mode === "raw" ? (
              <Button variant="primary" onClick={applyRaw}>
                {t("save")}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => navigate(`/new?type=env_var&project=${projectId}&env=${envId}`)}>
                {t("addVariable")}
              </Button>
            )}
          </>
        ) : (
          <Button className={hideSame ? "is-on" : ""} onClick={() => setHideSame((v) => !v)}>
            {t("hideSame")}
          </Button>
        )}
      </div>
      {comparing ? (
        visibleDiff.length ? (
          <div className="list">
            <div className="list-row list-head" style={{ gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr" }}>
              <span>{t("key")}</span>
              <span>{t("type")}</span>
              <span>{envs.find((e) => e.id === envId)?.name ?? t("environment")}</span>
              <span>{envs.find((e) => e.id === otherEnvId)?.name ?? t("environment")}</span>
            </div>
            {visibleDiff.map((row) => (
              <div key={row.key} className="list-row" style={{ gridTemplateColumns: "1.2fr 0.8fr 1fr 1fr" }}>
                <span>{row.key}</span>
                <span className={`diff-tag ${row.status}`}>
                  {row.status === "added" ? t("diffAdded") : row.status === "removed" ? t("diffRemoved") : row.status === "changed" ? t("diffChanged") : t("same")}
                </span>
                <span className="cell-muted mono">{row.left ? "••••" : "—"}</span>
                <span className="cell-muted mono">{row.right ? "••••" : "—"}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title={t("noDiff")} />
        )
      ) : (
        <>
          {parsed.duplicates.length ? (
            <p className="error-text">
              {t("duplicateKey")}: {parsed.duplicates.join(", ")}
            </p>
          ) : null}
          {mode === "raw" ? (
            <Suspense fallback={<p className="hint">{t("loading")}</p>}>
              <EnvEditor value={raw} onChange={setRaw} duplicates={parsed.duplicates} />
            </Suspense>
          ) : items.length ? (
            <div className="list">
              {items.map((item) => (
                <div key={item.id} className="list-row" style={{ gridTemplateColumns: "1fr 1.6fr auto" }}>
                  <button type="button" className="btn ghost" style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => navigate(`/vault/${item.id}`)}>
                    {item.name}
                  </button>
                  <SecretField value={item.fields.value ?? ""} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} />
                  <span />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={t("noSecrets")}
              actions={
                <>
                  <Button variant="primary" onClick={() => navigate(`/new?type=env_var&project=${projectId}&env=${envId}`)}>
                    {t("addVariable")}
                  </Button>
                  <Button onClick={() => navigate("/env/import")}>{t("importEnv")}</Button>
                </>
              }
            />
          )}
        </>
      )}
      {exportOpen ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setExportOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>{t("confirmExport")}</h2>
            <p>{t("plaintextWarning")}</p>
            <Field label={t("exportFormat")}>
              <Select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as EnvExportFormat)}>
                <option value="dotenv">{t("formatDotenv")}</option>
                <option value="compose">{t("formatCompose")}</option>
                <option value="kubernetes">{t("formatKubernetes")}</option>
              </Select>
            </Field>
            {exportFormat === "dotenv" ? (
              <Field label="Filename">
                <Select value={filename} onChange={(e) => setFilename(e.target.value)}>
                  <option>.env</option>
                  <option>.env.local</option>
                  <option>.env.development</option>
                  <option>.env.production</option>
                </Select>
              </Field>
            ) : null}
            <div className="dialog-actions">
              <Button onClick={() => setExportOpen(false)}>{t("cancel")}</Button>
              <Button variant="primary" onClick={() => requestPlaintext("export")}>
                {t("export")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {pwOpen ? (
        <PasswordPrompt
          title={t("confirmExport")}
          body={t("confirmPasswordExport")}
          confirm={t("export")}
          error={pwError}
          onCancel={() => {
            setPwOpen(false);
            setPendingPlaintext(null);
          }}
          onConfirm={async (password) => {
            if (!engine.verifyMasterPassword(password)) {
              setPwError(t("wrongPassword"));
              return;
            }
            if (pendingPlaintext) await finishPlaintext(pendingPlaintext);
          }}
        />
      ) : null}
    </div>
  );
}

export function EnvImportScreen() {
  const { engine, refresh } = useVault();
  const platform = usePlatform();
  const toast = useToast();
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [projectId, setProjectId] = useState(engine.projects()[0]?.id ?? "");
  const [envId, setEnvId] = useState(engine.environments(engine.projects()[0]?.id ?? "")[0]?.id ?? "");
  const [mode, setMode] = useState<"skip" | "replace" | "keep" | "review">("review");
  const preview = projectId && envId && source ? engine.previewEnvImport(projectId, envId, source) : null;
  const [decisions, setDecisions] = useState<Record<string, EnvImportDecision["action"]>>({});

  useEffect(() => {
    if (!preview) return;
    const next: Record<string, EnvImportDecision["action"]> = {};
    for (const e of preview.created) next[e.key] = "create";
    for (const e of preview.existing) next[e.key] = mode === "skip" ? "skip" : "keep";
    for (const e of preview.changed) next[e.key] = mode === "replace" ? "replace" : mode === "keep" || mode === "skip" ? "keep" : "replace";
    setDecisions(next);
  }, [source, mode, projectId, envId]);

  return (
    <div>
      <button className="back" type="button" onClick={() => navigate("/env")}>
        {t("back")}
      </button>
      <h1 className="page-title">{t("importEnv")}</h1>
      <div className="toolbar">
        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {engine.projects().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={envId} onChange={(e) => setEnvId(e.target.value)}>
          {engine.environments(projectId).map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <div
        className="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) setSource(await file.text());
        }}
      >
        <p>{t("dropEnv")}</p>
        <Button
          onClick={async () => {
            const file = await platform.files.open([{ name: "env", extensions: ["env", "local", "development", "production", "txt"] }]);
            if (file) setSource(new TextDecoder().decode(file.bytes));
          }}
        >
          {t("browse")}
        </Button>
      </div>
      {source ? <Textarea mono value={source} onChange={(e) => setSource(e.target.value)} style={{ marginTop: 16, minHeight: 180 }} /> : null}
      {preview ? (
        <>
          <p className="page-sub" style={{ marginTop: 20 }}>
            {preview.created.length} {t("newVars")} · {preview.existing.length} {t("existingVars")} · {preview.changed.length} {t("changedVars")}
          </p>
          <div className="split" style={{ marginBottom: 12 }}>
            <Button onClick={() => setMode("skip")}>{t("skipDuplicates")}</Button>
            <Button onClick={() => setMode("replace")}>{t("replace")}</Button>
            <Button onClick={() => setMode("keep")}>{t("keepExisting")}</Button>
            <Button onClick={() => setMode("review")}>{t("review")}</Button>
          </div>
          {mode === "review" ? (
            <div className="list">
              {Object.keys(decisions).map((key) => (
                <div key={key} className="list-row" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>{key}</span>
                  <Select
                    value={decisions[key]}
                    onChange={(e) => setDecisions((d) => ({ ...d, [key]: e.target.value as EnvImportDecision["action"] }))}
                  >
                    <option value="create">{t("create")}</option>
                    <option value="replace">{t("replace")}</option>
                    <option value="keep">{t("keep")}</option>
                    <option value="skip">{t("skip")}</option>
                  </Select>
                </div>
              ))}
            </div>
          ) : null}
          <Button
            variant="primary"
            style={{ marginTop: 16 }}
            onClick={async () => {
              await engine.applyEnvImport(
                projectId,
                envId,
                source,
                Object.entries(decisions).map(([key, action]) => ({ key, action })),
              );
              refresh();
              toast(t("imported"));
              navigate("/env");
            }}
          >
            {t("importEnv")}
          </Button>
        </>
      ) : null}
    </div>
  );
}
