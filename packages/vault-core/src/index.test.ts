import { describe, expect, it } from "vitest";
import { KDF_MIN } from "@deepkey/config";
import { inspectBackup, MemoryVaultStore, VaultEngine, generateSecret, randomUuid } from "./index.js";

const PASS = "test-master-password-ok";
const kdf = { ...KDF_MIN, version: 0x13 };

async function ready() {
  const store = new MemoryVaultStore();
  const vault = new VaultEngine(store);
  await vault.create(PASS, "Dev", { kdf });
  return { store, vault };
}

describe("vault-core", () => {
  it("creates, locks, and unlocks a vault", async () => {
    const { vault } = await ready();
    await vault.createItem({ type: "api_key", name: "OPENAI_API_KEY", fields: { value: "sk-test" } });
    expect(vault.items()).toHaveLength(1);
    vault.lock();
    expect(vault.unlocked).toBe(false);
    await vault.unlock(PASS);
    expect(vault.items()[0]?.name).toBe("OPENAI_API_KEY");
    expect(vault.items()[0]?.fields.value).toBe("sk-test");
  });

  it("edits, histories, trashes, and restores", async () => {
    const { vault } = await ready();
    const item = await vault.createItem({ type: "token", name: "token", fields: { value: "a" } });
    await vault.updateItem(item.id, { fields: { value: "b" } });
    expect(vault.revisions(item.id).length).toBe(1);
    expect(vault.revisions(item.id)[0]?.changedFields).toContain("fields");
    const revisionId = vault.revisions(item.id)[0]!.id;
    await vault.restoreRevision(item.id, revisionId);
    expect(vault.getItem(item.id)?.fields.value).toBe("a");
    await vault.trashItem(item.id);
    expect(vault.trashItems()).toHaveLength(1);
    await vault.restoreItem(item.id);
    expect(vault.getItem(item.id)?.deletedAt).toBeNull();
  });

  it("imports and exports env files without silent overwrite", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const env = await vault.createEnvironment(project.id, "Development");
    await vault.createItem({
      type: "env_var",
      name: "EXISTING",
      projectId: project.id,
      environmentId: env.id,
      fields: { value: "one" },
    });
    const source = "EXISTING=two\nNEW=fresh\n";
    const preview = vault.previewEnvImport(project.id, env.id, source);
    expect(preview.created.map((e) => e.key)).toEqual(["NEW"]);
    expect(preview.changed.map((c) => c.key)).toEqual(["EXISTING"]);
    await vault.applyEnvImport(project.id, env.id, source, [
      { key: "EXISTING", action: "keep" },
      { key: "NEW", action: "create" },
    ]);
    expect(vault.envItems(project.id, env.id).find((i) => i.name === "EXISTING")?.fields.value).toBe("one");
    expect(vault.envItems(project.id, env.id).find((i) => i.name === "NEW")?.fields.value).toBe("fresh");
    const exported = vault.exportEnv(project.id, env.id);
    expect(exported).toContain("EXISTING=one");
    expect(exported).toContain("NEW=fresh");
  });

  it("changes the master password by rewrapping the DEK", async () => {
    const { vault } = await ready();
    await vault.createItem({ type: "api_key", name: "k", fields: { value: "v" } });
    await vault.changeMasterPassword(PASS, "new-master-password-ok");
    vault.lock();
    await vault.unlock("new-master-password-ok");
    expect(vault.items()[0]?.fields.value).toBe("v");
  });

  it("roundtrips encrypted backups", async () => {
    const { vault } = await ready();
    await vault.createItem({ type: "secure_note", name: "note", notes: "secret text" });
    const backup = await vault.exportBackup();
    const store2 = new MemoryVaultStore();
    const vault2 = new VaultEngine(store2);
    await vault2.importBackup(backup);
    await vault2.unlock(PASS);
    expect(vault2.items()[0]?.notes).toBe("secret text");
    const info = inspectBackup(backup);
    expect(info.records).toBeGreaterThan(0);
    expect(info.displayName).toBe("Dev");
  });

  it("rejects a tampered backup", async () => {
    const { vault } = await ready();
    const backup = await vault.exportBackup();
    const bad = { ...backup, magic: "NOPE" };
    await expect(vault.importBackup(bad)).rejects.toThrow();
  });

  it("generates secrets locally", () => {
    const a = generateSecret({ kind: "uuid", length: 36, uppercase: true, lowercase: true, numbers: true, symbols: false, avoidAmbiguous: false });
    const b = generateSecret({ kind: "password", length: 32, uppercase: true, lowercase: true, numbers: true, symbols: true, avoidAmbiguous: true });
    const phrase = generateSecret({ kind: "passphrase", length: 5, uppercase: false, lowercase: true, numbers: false, symbols: false, avoidAmbiguous: false });
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toHaveLength(32);
    expect(phrase.split("-")).toHaveLength(5);
  });

  it("diffs two environments and exports compose yaml", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const left = await vault.createEnvironment(project.id, "Staging");
    const right = await vault.createEnvironment(project.id, "Production");
    await vault.createItem({ type: "env_var", name: "SHARED", projectId: project.id, environmentId: left.id, fields: { value: "one" } });
    await vault.createItem({ type: "env_var", name: "SHARED", projectId: project.id, environmentId: right.id, fields: { value: "two" } });
    await vault.createItem({ type: "env_var", name: "ONLY_LEFT", projectId: project.id, environmentId: left.id, fields: { value: "x" } });
    await vault.createItem({ type: "env_var", name: "ONLY_RIGHT", projectId: project.id, environmentId: right.id, fields: { value: "y" } });
    const diff = vault.diffEnvironments(project.id, left.id, right.id);
    expect(diff.find((row) => row.key === "SHARED")?.status).toBe("changed");
    expect(diff.find((row) => row.key === "ONLY_LEFT")?.status).toBe("removed");
    expect(diff.find((row) => row.key === "ONLY_RIGHT")?.status).toBe("added");
    const yaml = vault.exportEnv(project.id, right.id, "compose");
    expect(yaml).toContain("environment:");
    expect(yaml).toContain("SHARED");
    expect(vault.verifyMasterPassword(PASS)).toBe(true);
    expect(vault.verifyMasterPassword("nope-nope-nope-nope")).toBe(false);
  });

  it("applies settings so history and trash retention actually change", async () => {
    const { vault } = await ready();
    vault.applySettings({
      ...vault.appSettings,
      security: { ...vault.appSettings.security, historyLimit: 1, trashRetentionDays: 0 },
    });
    const item = await vault.createItem({ type: "token", name: "token", fields: { value: "a" } });
    await vault.updateItem(item.id, { fields: { value: "b" } });
    await vault.updateItem(item.id, { fields: { value: "c" } });
    expect(vault.revisions(item.id).length).toBe(1);
    await vault.trashItem(item.id);
    await vault.purgeExpiredTrash();
    expect(vault.trashItems()).toHaveLength(1);
  });

  it("wipe needs the master password and clears the store", async () => {
    const { vault, store } = await ready();
    await vault.createItem({ type: "api_key", name: "k", fields: { value: "v" } });
    await expect(vault.wipe("wrong-password-xx")).rejects.toThrow();
    expect(await store.getHeader()).not.toBeNull();
    await vault.wipe(PASS);
    expect(await store.getHeader()).toBeNull();
    expect(await store.listRecords()).toHaveLength(0);
    expect(vault.unlocked).toBe(false);
  });

  it("makes RFC 4122 v4 ids without relying on crypto.randomUUID", () => {
    const ids = Array.from({ length: 50 }, () => randomUuid());
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("restores a deleted project with the environments and items deleted along with it", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const env = await vault.createEnvironment(project.id, "Development");
    const item = await vault.createItem({
      type: "env_var",
      name: "A",
      projectId: project.id,
      environmentId: env.id,
      fields: { value: "1" },
    });
    await vault.deleteProject(project.id);
    expect(vault.projects().map((p) => p.id)).not.toContain(project.id);
    expect(vault.trashProjects().map((p) => p.id)).toEqual([project.id]);

    await vault.restoreProject(project.id);
    expect(vault.projects().map((p) => p.id)).toContain(project.id);
    expect(vault.environments(project.id).map((e) => e.id)).toEqual([env.id]);
    expect(vault.getItem(item.id)?.deletedAt).toBeNull();
    expect(vault.trashProjects()).toHaveLength(0);
  });

  it("keeps an item restored on its own when its project is purged", async () => {
    const { store, vault } = await ready();
    const project = await vault.createProject("App");
    const item = await vault.createItem({ type: "token", name: "keep me", projectId: project.id, fields: { value: "v" } });
    await vault.deleteProject(project.id);
    await vault.restoreItem(item.id);

    await vault.deleteProjectPermanently(project.id);

    expect(vault.getItem(item.id)?.name).toBe("keep me");
    expect(vault.getItem(item.id)?.projectId).toBeNull();
    expect((await store.listRecords()).map((r) => r.id)).not.toContain(project.id);
  });

  it("empties deleted projects from the trash and leaves no records behind", async () => {
    const { store, vault } = await ready();
    const project = await vault.createProject("App");
    const env = await vault.createEnvironment(project.id, "Development");
    await vault.createItem({ type: "token", name: "gone", projectId: project.id, environmentId: env.id, fields: { value: "v" } });
    await vault.deleteProject(project.id);

    await vault.emptyTrash();

    expect(vault.trashProjects()).toHaveLength(0);
    const ids = (await store.listRecords()).map((r) => r.id);
    expect(ids).not.toContain(project.id);
    expect(ids).not.toContain(env.id);
  });

  it("archived projects leave the lists and can be brought back", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("Old");
    await vault.updateProject(project.id, { archived: true });
    expect(vault.projects().map((p) => p.id)).not.toContain(project.id);
    expect(vault.allProjects().filter((p) => p.archived).map((p) => p.id)).toEqual([project.id]);

    await vault.updateProject(project.id, { archived: false });
    expect(vault.projects().map((p) => p.id)).toContain(project.id);
  });

  it("stays locked when a stored record cannot be read", async () => {
    const { store, vault } = await ready();
    const item = await vault.createItem({ type: "token", name: "t", fields: { value: "v" } });
    const record = (await store.listRecords()).find((r) => r.id === item.id)!;
    const c = record.ciphertext;
    await store.putRecord({ ...record, ciphertext: (c[0] === "A" ? "B" : "A") + c.slice(1) });
    vault.lock();
    await expect(vault.unlock(PASS)).rejects.toThrow("integrity");
    expect(vault.unlocked).toBe(false);
    expect(vault.vaultHeader).toBeNull();
  });

  it("rejects ciphertext moved from one row to another", async () => {
    const { store, vault } = await ready();
    const first = await vault.createItem({ type: "token", name: "first", fields: { value: "1" } });
    const second = await vault.createItem({ type: "token", name: "second", fields: { value: "2" } });
    const records = await store.listRecords();
    const a = records.find((r) => r.id === first.id)!;
    const b = records.find((r) => r.id === second.id)!;
    await store.putRecord({ ...a, nonce: b.nonce, ciphertext: b.ciphertext, cryptoVersion: b.cryptoVersion });
    await store.putRecord({ ...b, nonce: a.nonce, ciphertext: a.ciphertext, cryptoVersion: a.cryptoVersion });
    vault.lock();
    await expect(vault.unlock(PASS)).rejects.toThrow("integrity");
  });

  it("keeps environment sort orders unique after a deletion", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const dev = await vault.createEnvironment(project.id, "Development");
    const staging = await vault.createEnvironment(project.id, "Staging");
    await vault.createEnvironment(project.id, "Production");
    await vault.deleteEnvironment(staging.id);
    await vault.createEnvironment(project.id, "QA");
    const orders = vault.environments(project.id).map((e) => e.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
    expect(vault.environments(project.id)[0]?.id).toBe(dev.id);
  });

  it("finds accented names when the query has no accent", async () => {
    const { vault } = await ready();
    await vault.createItem({ type: "token", name: "Naïve token", fields: { value: "v" } });
    expect(vault.search("naive").map((h) => h.title)).toEqual(["Naïve token"]);
    expect(vault.search("NAÏVE").map((h) => h.title)).toEqual(["Naïve token"]);
  });

  it("uses the last value when an env key repeats, in preview, import, and raw save", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const env = await vault.createEnvironment(project.id, "Development");
    const source = "TOKEN=first\nTOKEN=second\n";

    const preview = vault.previewEnvImport(project.id, env.id, source);
    expect(preview.created.map((e) => [e.key, e.value])).toEqual([["TOKEN", "second"]]);

    await vault.applyEnvImport(project.id, env.id, source, [{ key: "TOKEN", action: "create" }]);
    expect(vault.envItems(project.id, env.id).map((i) => [i.name, i.fields.value])).toEqual([["TOKEN", "second"]]);

    // NEWKEY does not exist yet, so a repeated key used to create two items with the same name.
    await vault.replaceEnvFromRaw(project.id, env.id, "TOKEN=second\nNEWKEY=third\nNEWKEY=fourth\n");
    const after = vault.envItems(project.id, env.id);
    expect(after.map((i) => [i.name, i.fields.value])).toEqual([
      ["NEWKEY", "fourth"],
      ["TOKEN", "second"],
    ]);
  });

  it("gives a duplicated file item its own copy of the file", async () => {
    const { vault } = await ready();
    const original = await vault.createItem({ type: "file", name: "cert", attachmentName: "a.pem" });
    await vault.putFile(original.id, "a.pem", "text/plain", new TextEncoder().encode("first"));
    const copy = await vault.duplicateItem(original.id);
    expect(copy.attachmentId).not.toBe(original.attachmentId);

    await vault.putFile(original.id, "a.pem", "text/plain", new TextEncoder().encode("second"));
    await vault.deletePermanent(original.id);

    const file = await vault.readFile(copy.id);
    expect(new TextDecoder().decode(file.bytes)).toBe("first");
  });

  it("copies files when a project is duplicated", async () => {
    const { vault } = await ready();
    const project = await vault.createProject("App");
    const env = await vault.createEnvironment(project.id, "Development");
    const item = await vault.createItem({ type: "file", name: "key", projectId: project.id, environmentId: env.id });
    await vault.putFile(item.id, "key.txt", "text/plain", new TextEncoder().encode("secret-bytes"));

    const copy = await vault.duplicateProject(project.id);
    const copied = vault.items().find((i) => i.projectId === copy.id);
    expect(copied?.attachmentId).toBeTruthy();
    expect(copied?.attachmentId).not.toBe(item.attachmentId);
    expect(new TextDecoder().decode((await vault.readFile(copied!.id)).bytes)).toBe("secret-bytes");
  });

  it("restoring a revision keeps the file the item has now", async () => {
    const { vault } = await ready();
    const item = await vault.createItem({ type: "file", name: "doc" });
    await vault.putFile(item.id, "a.txt", "text/plain", new TextEncoder().encode("old"));
    await vault.updateItem(item.id, { name: "doc renamed" });
    const revisionId = vault.revisions(item.id)[0]!.id;
    await vault.putFile(item.id, "b.txt", "text/plain", new TextEncoder().encode("new"));

    await vault.restoreRevision(item.id, revisionId);

    expect(vault.getItem(item.id)?.name).toBe("doc");
    expect(new TextDecoder().decode((await vault.readFile(item.id)).bytes)).toBe("new");
  });
});
