import { describe, expect, it } from "vitest";
import { KDF_MIN } from "@deepkey/config";
import { VaultEngine, MemoryVaultStore, generateSecret } from "./index.js";

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
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toHaveLength(32);
  });
});
