import { Copy, DotsThree, MagnifyingGlass, PencilSimple, Plus, Star } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { ItemType, VaultItem } from "@deepkey/types";
import { ITEM_TYPES } from "@deepkey/config";
import { Button, EmptyState, Field, Input, SecretField, Select, Textarea } from "../components/controls.js";
import { Dialog } from "../components/feedback.js";
import { t } from "../i18n/index.js";
import { expiresLabel, formatDate, typeLabel } from "../lib/format.js";
import { DEFAULT_GENERATOR, generateSecret, itemSecret } from "@deepkey/vault-core";
import { usePlatform } from "../platform/context.js";
import { useVault } from "../state/vault.js";

function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function OverviewScreen() {
  const { engine, settings, tick } = useVault();
  const navigate = useNavigate();
  void tick;
  const stats = engine.stats();
  const used = engine.recentlyUsed();
  const updated = engine.recentlyUpdated();
  const expiring = engine.expiringSoon();
  const starred = engine.favorites();
  const backupDue =
    settings.backup.autoBackup &&
    (!settings.backup.lastBackupAt || Date.now() - settings.backup.lastBackupAt >= settings.backup.autoBackupHours * 60 * 60 * 1000);
  const lockLabel =
    settings.security.autoLockMs < 0 ? t("never") : settings.security.autoLockMs === 0 ? t("immediately") : t("lockedAutomatically");
  return (
    <div>
      <PageHeader title={t("overview")} sub={t("overviewSub")} />
      <div className="cards">
        <div className="card">
          <div className="card-label">{t("vaultItems")}</div>
          <div className="card-value">{stats.items}</div>
        </div>
        <div className="card">
          <div className="card-label">{t("projects")}</div>
          <div className="card-value">{stats.projects}</div>
        </div>
        <div className="card">
          <div className="card-label">{t("security")}</div>
          <div className="card-value" style={{ fontSize: 22, paddingTop: 8 }}>
            {lockLabel}
          </div>
        </div>
      </div>
      {backupDue ? (
        <div className="banner">
          <p>{t("backupDue")}</p>
          <Button variant="primary" onClick={() => navigate("/settings")}>
            {t("backupNow")}
          </Button>
        </div>
      ) : null}
      {starred.length ? (
        <section className="section">
          <h2 className="section-title">{t("favorites")}</h2>
          <ItemTable items={starred} />
        </section>
      ) : null}
      {used.length ? (
        <section className="section">
          <h2 className="section-title">{t("recentlyUsed")}</h2>
          <ItemTable items={used} />
        </section>
      ) : null}
      {updated.length ? (
        <section className="section">
          <h2 className="section-title">{t("recentlyUpdated")}</h2>
          <ItemTable items={updated} />
        </section>
      ) : null}
      {expiring.length ? (
        <section className="section">
          <h2 className="section-title">{t("expiringSoon")}</h2>
          <ItemTable items={expiring} />
        </section>
      ) : null}
      {!stats.items ? (
        <EmptyState
          title={t("noSecrets")}
          actions={
            <>
              <Link to="/new" className="btn primary">
                {t("addSecret")}
              </Link>
              <Link to="/env/import" className="btn">
                {t("importEnv")}
              </Link>
            </>
          }
        />
      ) : null}
    </div>
  );
}

export function ItemTable({ items }: { items: VaultItem[] }) {
  const { engine, copySecret, refresh } = useVault();
  const navigate = useNavigate();
  return (
    <div className="list">
      <div className="list-row list-head">
        <span>{t("name")}</span>
        <span>{t("type")}</span>
        <span>{t("project")}</span>
        <span>{t("environment")}</span>
        <span>{t("updated")}</span>
        <span />
      </div>
      {items.map((item) => {
        const project = item.projectId ? engine.getProject(item.projectId) : null;
        const env = item.environmentId ? engine.getEnvironment(item.environmentId) : null;
        return (
          <div
            key={item.id}
            className="list-row"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/vault/${item.id}`)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate(`/vault/${item.id}`);
              }
            }}
          >
            <span className="item-name" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {item.favorite ? <Star size={14} weight="fill" style={{ color: "#e9a72e", flexShrink: 0 }} /> : null}
              <span>{item.name}</span>
            </span>
            <span className="cell-muted">{typeLabel(item.type)}</span>
            <span className="cell-muted">{project?.name ?? "—"}</span>
            <span className="cell-muted">{env?.name ?? "—"}</span>
            <span className="cell-muted">{formatDate(item.updatedAt)}</span>
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              {itemSecret(item) ? (
                <Button
                  variant="icon"
                  aria-label={t("copy")}
                  onClick={() => copySecret(itemSecret(item) ?? "")}
                >
                  <Copy size={16} />
                </Button>
              ) : null}
              <Button
                variant="icon"
                aria-label={t("favorite")}
                onClick={async () => {
                  await engine.updateItem(item.id, { favorite: !item.favorite }, false);
                  refresh();
                }}
              >
                <Star size={16} weight={item.favorite ? "fill" : "regular"} style={item.favorite ? { color: "#e9a72e" } : undefined} />
              </Button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function VaultListScreen({ filterType }: { filterType?: ItemType | ItemType[] }) {
  const { engine, tick } = useVault();
  void tick;
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [project, setProject] = useState("all");
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState("updated");
  const allowed = filterType ? (Array.isArray(filterType) ? filterType : [filterType]) : null;
  const items = useMemo(() => {
    let list = engine.items();
    if (allowed) list = list.filter((i) => allowed.includes(i.type));
    if (type !== "all") list = list.filter((i) => i.type === type);
    if (project !== "all") list = list.filter((i) => i.projectId === project);
    if (favOnly) list = list.filter((i) => i.favorite);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(n) ||
          i.tags.join(" ").toLowerCase().includes(n) ||
          i.description.toLowerCase().includes(n),
      );
    }
    list.sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt - a.updatedAt));
    return list;
  }, [engine, q, type, project, favOnly, sort, allowed, tick]);

  const title =
    allowed?.length === 1 && allowed[0] === "secure_note"
      ? t("notes")
      : allowed?.length === 1 && allowed[0] === "file"
        ? t("files")
        : allowed
          ? t("secrets")
          : t("vault");
  const newPath = allowed?.length === 1 && allowed[0] === "secure_note" ? "/notes/new" : "/new";

  return (
    <div>
      <PageHeader
        title={title}
        actions={
          <Button variant="primary" onClick={() => navigate(newPath)}>
            <Plus size={16} /> {t("newSecret")}
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search">
          <MagnifyingGlass size={18} weight="bold" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} />
        </label>
        {!allowed ? (
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label={t("filterType")}>
            <option value="all">{t("allTypes")}</option>
            {ITEM_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {typeLabel(ty)}
              </option>
            ))}
          </Select>
        ) : null}
        <Select value={project} onChange={(e) => setProject(e.target.value)} aria-label={t("project")}>
          <option value="all">{t("allProjects")}</option>
          {engine.projects().map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button className={favOnly ? "is-on" : ""} onClick={() => setFavOnly((v) => !v)}>
          {t("favorites")}
        </Button>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t("sort")}>
          <option value="updated">{t("updatedNewest")}</option>
          <option value="name">{t("nameAz")}</option>
        </Select>
      </div>
      {items.length ? (
        <ItemTable items={items} />
      ) : (
        <EmptyState
          title={t("noSecrets")}
          actions={
            <>
              <Button variant="primary" onClick={() => navigate(newPath)}>
                {t("addSecret")}
              </Button>
              <Button onClick={() => navigate("/env/import")}>{t("importEnv")}</Button>
            </>
          }
        />
      )}
    </div>
  );
}

export function ItemDetailScreen() {
  const { id } = useParams();
  const { engine, settings, copySecret, refresh } = useVault();
  const platform = usePlatform();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const item = id ? engine.getItem(id) : null;
  useEffect(() => {
    if (item && !item.deletedAt) void engine.touchItem(item.id);
  }, [id]);
  if (!item || item.deletedAt) {
    return (
      <div>
        <button className="back" type="button" onClick={() => navigate(-1)}>
          {t("back")}
        </button>
        <p>{t("errorGeneric")}</p>
      </div>
    );
  }
  const project = item.projectId ? engine.getProject(item.projectId) : null;
  const env = item.environmentId ? engine.getEnvironment(item.environmentId) : null;
  const history = engine.revisions(item.id);
  const exp = item.expiresAt ? expiresLabel(item.expiresAt) : null;
  return (
    <div>
      <button className="back" type="button" onClick={() => navigate(-1)}>
        {t("back")}
      </button>
      <PageHeader
        title={item.name}
        actions={
          <div className="split">
            <Button
              variant="icon"
              aria-label={t("favorite")}
              onClick={async () => {
                await engine.updateItem(item.id, { favorite: !item.favorite }, false);
                refresh();
              }}
            >
              <Star size={18} weight={item.favorite ? "fill" : "regular"} style={item.favorite ? { color: "#e9a72e" } : undefined} />
            </Button>
            <div ref={menuRef} style={{ position: "relative" }}>
              <Button variant="icon" aria-label={t("more")} onClick={() => setMenu((v) => !v)}>
                <DotsThree size={18} />
              </Button>
              {menu ? (
                <div className="menu">
                  <button
                    type="button"
                    onClick={async () => {
                      const copy = await engine.duplicateItem(item.id);
                      refresh();
                      navigate(`/vault/${copy.id}`);
                    }}
                  >
                    {t("duplicate")}
                  </button>
                  <button type="button" onClick={() => navigate(`/vault/${item.id}/edit`)}>
                    {t("move")}
                  </button>
                  <button type="button" onClick={() => setConfirm(true)}>
                    {t("delete")}
                  </button>
                </div>
              ) : null}
            </div>
            <Button onClick={() => navigate(`/vault/${item.id}/edit`)}>
              <PencilSimple size={16} /> {t("edit")}
            </Button>
          </div>
        }
      />
      <div className="details">
        <div className="detail-block">
          <div className="detail-k">{t("type")}</div>
          <div className="detail-v">{typeLabel(item.type)}</div>
        </div>
        {item.fields.value !== undefined ? (
          <div className="detail-block">
            <SecretField value={item.fields.value} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} label={t("value")} />
          </div>
        ) : null}
        {item.fields.username ? (
          <div className="detail-block">
            <div className="detail-k">{t("username")}</div>
            <div className="detail-v">{item.fields.username}</div>
          </div>
        ) : null}
        {item.fields.password ? (
          <div className="detail-block">
            <SecretField value={item.fields.password} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} label={t("password")} />
          </div>
        ) : null}
        {item.fields.url ? (
          <div className="detail-block">
            <div className="detail-k">{t("url")}</div>
            <div className="detail-v">{item.fields.url}</div>
          </div>
        ) : null}
        {item.fields.privateKey ? (
          <div className="detail-block">
            <SecretField value={item.fields.privateKey} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} label={t("privateKey")} />
          </div>
        ) : null}
        {item.fields.certificate ? (
          <div className="detail-block">
            <SecretField value={item.fields.certificate} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} label={t("certificate")} />
          </div>
        ) : null}
        {item.customFields.map((f) => (
          <div className="detail-block" key={f.id}>
            {f.secret ? (
              <SecretField value={f.value} readOnly revealMs={settings.security.revealMs} onCopy={copySecret} label={f.label} />
            ) : (
              <>
                <div className="detail-k">{f.label}</div>
                <div className="detail-v">{f.value}</div>
              </>
            )}
          </div>
        ))}
        <div className="detail-block">
          <div className="detail-k">{t("project")}</div>
          <div className="detail-v">{project?.name ?? "—"}</div>
        </div>
        <div className="detail-block">
          <div className="detail-k">{t("environment")}</div>
          <div className="detail-v">{env?.name ?? "—"}</div>
        </div>
        <div className="detail-block">
          <div className="detail-k">{t("created")}</div>
          <div className="detail-v">{formatDate(item.createdAt)}</div>
        </div>
        <div className="detail-block">
          <div className="detail-k">{t("updated")}</div>
          <div className="detail-v">{formatDate(item.updatedAt)}</div>
        </div>
        {exp ? (
          <div className="detail-block">
            <div className="detail-k">{t("expiration")}</div>
            <div className={`detail-v ${exp.warn ? "badge-warn" : ""}`}>{exp.text}</div>
          </div>
        ) : null}
        {item.attachmentId ? (
          <div className="detail-block">
            <div className="detail-k">{t("files")}</div>
            <div className="detail-v">{item.attachmentName}</div>
            <Button
              style={{ marginTop: 12 }}
              onClick={async () => {
                const file = await engine.readFile(item.id);
                await platform.files.save(file.name, file.bytes, file.mime);
              }}
            >
              {t("download")}
            </Button>
            <p className="hint" style={{ marginTop: 8 }}>{t("plaintextWarning")}</p>
          </div>
        ) : null}
        {item.notes ? (
          <div className="detail-block">
            <div className="detail-k">{t("notesLabel")}</div>
            <div className="note-body">{item.notes}</div>
          </div>
        ) : null}
        {history.length ? (
          <div className="detail-block">
            <div className="detail-k">{t("history")}</div>
            {history.map((rev) => (
              <div key={rev.id} className="split" style={{ justifyContent: "space-between", padding: "8px 0" }}>
                <span>
                  {formatDate(rev.createdAt)} · {rev.changedFields.join(", ")}
                </span>
                <Button
                  onClick={async () => {
                    await engine.restoreRevision(item.id, rev.id);
                    refresh();
                  }}
                >
                  {t("restore")}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {confirm ? (
        <Dialog
          title={t("confirmDelete")}
          body={t("confirmDeleteSub")}
          confirm={t("delete")}
          danger
          onCancel={() => setConfirm(false)}
          onConfirm={async () => {
            await engine.trashItem(item.id);
            refresh();
            navigate("/vault");
          }}
        />
      ) : null}
    </div>
  );
}

const TEMPLATES: { id: string; type: ItemType; title: string; sub: string }[] = [
  { id: "api_key", type: "api_key", title: "API Key", sub: "Name and secret value" },
  { id: "token", type: "token", title: "Access Token", sub: "Bearer or API token" },
  { id: "credential", type: "credential", title: "Username + Password", sub: "Login pair" },
  { id: "database", type: "database", title: "Database Credential", sub: "Connection details" },
  { id: "connection_string", type: "database", title: "Connection String", sub: "Single URI" },
  { id: "webhook", type: "webhook", title: "Webhook Secret", sub: "Endpoint signing secret" },
  { id: "ssh_key", type: "ssh_key", title: "SSH Private Key", sub: "PEM or OpenSSH" },
  { id: "certificate", type: "certificate", title: "Certificate", sub: "PEM certificate" },
  { id: "custom", type: "custom", title: "Custom Secret", sub: "Your own fields" },
];

export function NewSecretScreen({ editId }: { editId?: string }) {
  const { engine, refresh } = useVault();
  const navigate = useNavigate();
  const existing = editId ? engine.getItem(editId) : null;
  const [template, setTemplate] = useState(existing?.type ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [value, setValue] = useState(existing?.fields.value ?? "");
  const [username, setUsername] = useState(existing?.fields.username ?? "");
  const [password, setPassword] = useState(existing?.fields.password ?? "");
  const [url, setUrl] = useState(existing?.fields.url ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [tags, setTags] = useState(existing?.tags.join(", ") ?? "");
  const [projectId, setProjectId] = useState(existing?.projectId ?? engine.appSettings.ui.defaultProjectId ?? engine.projects()[0]?.id ?? "");
  const [environmentId, setEnvironmentId] = useState(existing?.environmentId ?? "");
  const [expires, setExpires] = useState(existing?.expiresAt ? new Date(existing.expiresAt).toISOString().slice(0, 10) : "");
  const [host, setHost] = useState(existing?.fields.host ?? "");
  const [port, setPort] = useState(existing?.fields.port ?? "");
  const [database, setDatabase] = useState(existing?.fields.database ?? "");
  const [privateKey, setPrivateKey] = useState(existing?.fields.privateKey ?? "");
  const [certificate, setCertificate] = useState(existing?.fields.certificate ?? "");
  const [customLabel, setCustomLabel] = useState("");
  const [customValue, setCustomValue] = useState("");
  const type = (TEMPLATES.find((x) => x.id === template)?.type ?? template) as ItemType | "";
  const envs = projectId ? engine.environments(projectId) : [];

  async function save() {
    if (!type || !name.trim()) return;
    const fields: Record<string, string> = {};
    if (["api_key", "token", "webhook", "env_var", "custom"].includes(type) || template === "connection_string") fields.value = value;
    if (type === "credential" || type === "database") {
      fields.username = username;
      fields.password = password;
    }
    if (url) fields.url = url;
    if (type === "database" && template !== "connection_string") {
      fields.host = host;
      fields.port = port;
      fields.database = database;
    }
    if (type === "ssh_key") fields.privateKey = privateKey;
    if (type === "certificate") fields.certificate = certificate;
    const customFields = customLabel ? [{ id: crypto.randomUUID(), label: customLabel, value: customValue, secret: true }] : existing?.customFields ?? [];
    const payload = {
      type,
      name: name.trim(),
      fields,
      notes,
      description,
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
      projectId: projectId || null,
      environmentId: environmentId || null,
      expiresAt: expires ? new Date(expires).getTime() : null,
      customFields,
    };
    if (existing) {
      await engine.updateItem(existing.id, payload);
      refresh();
      navigate(`/vault/${existing.id}`);
    } else {
      const item = await engine.createItem(payload);
      refresh();
      navigate(`/vault/${item.id}`);
    }
  }

  return (
    <div>
      <button className="back" type="button" onClick={() => navigate(-1)}>
        {t("back")}
      </button>
      <PageHeader title={existing ? t("edit") : t("newSecret")} />
      {!template ? (
        <>
          <p className="page-sub">{t("chooseType")}</p>
          <div className="templates">
            {TEMPLATES.map((tpl) => (
              <button key={tpl.id} type="button" className="template" onClick={() => setTemplate(tpl.id)}>
                <b>{tpl.title}</b>
                <span>{tpl.sub}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ maxWidth: 640 }}>
          <Field label={t("name")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          {["api_key", "token", "webhook"].includes(type) || template === "connection_string" ? (
            <Field label={t("value")}>
              <Textarea mono value={value} onChange={(e) => setValue(e.target.value)} />
              <div className="split" style={{ marginTop: 8 }}>
                <Button onClick={() => setValue(generateSecret(DEFAULT_GENERATOR))}>{t("generate")}</Button>
              </div>
            </Field>
          ) : null}
          {type === "credential" || (type === "database" && template !== "connection_string") ? (
            <>
              <Field label={t("username")}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field label={t("password")}>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="split" style={{ marginTop: 8 }}>
                  <Button onClick={() => setPassword(generateSecret(DEFAULT_GENERATOR))}>{t("generate")}</Button>
                </div>
              </Field>
            </>
          ) : null}
          {type === "database" && template !== "connection_string" ? (
            <div className="grid-2">
              <Field label={t("host")}>
                <Input value={host} onChange={(e) => setHost(e.target.value)} />
              </Field>
              <Field label={t("port")}>
                <Input value={port} onChange={(e) => setPort(e.target.value)} />
              </Field>
              <div style={{ gridColumn: "1 / -1" }}>
                <Field label={t("database")}>
                  <Input value={database} onChange={(e) => setDatabase(e.target.value)} />
                </Field>
              </div>
            </div>
          ) : null}
          {type === "ssh_key" ? (
            <Field label={t("privateKey")}>
              <Textarea mono value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} />
            </Field>
          ) : null}
          {type === "certificate" ? (
            <Field label={t("certificate")}>
              <Textarea mono value={certificate} onChange={(e) => setCertificate(e.target.value)} />
            </Field>
          ) : null}
          {type === "webhook" || type === "api_key" || type === "credential" ? (
            <Field label={t("url")}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          ) : null}
          {type === "custom" ? (
            <div className="grid-2">
              <Field label="Field">
                <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} />
              </Field>
              <Field label={t("value")}>
                <Input value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
              </Field>
            </div>
          ) : null}
          <div className="grid-2">
            <Field label={t("project")}>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t("none")}</option>
                {engine.projects().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("environment")}>
              <Select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)}>
                <option value="">{t("none")}</option>
                {envs.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t("description")}>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t("tags")}>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <Field label={t("expiration")}>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <Field label={t("notesLabel")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="split">
            <Button onClick={() => (existing ? navigate(-1) : setTemplate(""))}>{t("back")}</Button>
            <Button variant="primary" onClick={save}>
              {t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
