import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, EmptyState, Input, Textarea } from "../components/controls.js";
import { Dialog, useToast } from "../components/feedback.js";
import { t } from "../i18n/index.js";
import { formatDate } from "../lib/format.js";
import { usePlatform } from "../platform/context.js";
import { useVault } from "../state/vault.js";

export function TrashScreen() {
  const { engine, refresh, tick } = useVault();
  void tick;
  const toast = useToast();
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [permanentId, setPermanentId] = useState<string | null>(null);
  const items = engine.trashItems();
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t("trash")}</h1>
        {items.length ? (
          <Button variant="danger" onClick={() => setEmptyOpen(true)}>
            {t("emptyTrash")}
          </Button>
        ) : null}
      </div>
      {items.length ? (
        <div className="list">
          {items.map((item) => (
            <div key={item.id} className="list-row" style={{ gridTemplateColumns: "1.4fr 1fr auto" }}>
              <span>{item.name}</span>
              <span className="cell-muted">{formatDate(item.deletedAt ?? item.updatedAt)}</span>
              <span className="row-actions">
                <Button
                  onClick={async () => {
                    await engine.restoreItem(item.id);
                    refresh();
                    toast(t("restored"));
                  }}
                >
                  {t("restore")}
                </Button>
                <Button variant="danger" onClick={() => setPermanentId(item.id)}>
                  {t("deleteForever")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title={t("noTrash")} />
      )}
      {emptyOpen ? (
        <Dialog
          title={t("emptyTrash")}
          body={t("confirmPermanentSub")}
          confirm={t("emptyTrash")}
          danger
          onCancel={() => setEmptyOpen(false)}
          onConfirm={async () => {
            await engine.emptyTrash();
            refresh();
            setEmptyOpen(false);
          }}
        />
      ) : null}
      {permanentId ? (
        <Dialog
          title={t("confirmPermanent")}
          body={t("confirmPermanentSub")}
          confirm={t("deleteForever")}
          danger
          onCancel={() => setPermanentId(null)}
          onConfirm={async () => {
            await engine.deletePermanent(permanentId);
            refresh();
            setPermanentId(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function NotesCreateScreen() {
  const { engine, refresh } = useVault();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  return (
    <div style={{ maxWidth: 720 }}>
      <button className="back" type="button" onClick={() => navigate("/notes")}>
        {t("back")}
      </button>
      <h1 className="page-title">{t("notes")}</h1>
      <div className="field">
        <Input value={title} placeholder={t("title")} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <Textarea className="note-body" rows={16} value={body} placeholder={t("body")} onChange={(e) => setBody(e.target.value)} />
      </div>
      <Button
        variant="primary"
        disabled={!title.trim()}
        onClick={async () => {
          const item = await engine.createItem({ type: "secure_note", name: title.trim(), notes: body });
          refresh();
          navigate(`/vault/${item.id}`);
        }}
      >
        {t("save")}
      </Button>
    </div>
  );
}

export function FilesManagerScreen() {
  const { engine, refresh, settings, tick } = useVault();
  void tick;
  const platform = usePlatform();
  const navigate = useNavigate();
  const items = engine.items().filter((i) => i.type === "file");
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">{t("files")}</h1>
        <Button
          variant="primary"
          onClick={async () => {
            const file = await platform.files.open();
            if (!file) return;
            if (file.bytes.byteLength > settings.security.maxAttachmentBytes) {
              window.alert(t("fileTooBig"));
              return;
            }
            const item = await engine.createItem({
              type: "file",
              name: file.name,
              attachmentName: file.name,
              attachmentMime: file.mime,
            });
            await engine.putFile(item.id, file.name, file.mime, file.bytes);
            refresh();
            navigate(`/vault/${item.id}`);
          }}
        >
          {t("files")}
        </Button>
      </div>
      {items.length ? (
        <div className="list">
          {items.map((item) => (
            <button key={item.id} type="button" className="list-row" style={{ gridTemplateColumns: "1fr auto" }} onClick={() => navigate(`/vault/${item.id}`)}>
              <span>{item.name}</span>
              <span className="cell-muted">{item.attachmentName}</span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState title={t("noFiles")} />
      )}
    </div>
  );
}
