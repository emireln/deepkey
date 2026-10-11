import fs from "node:fs";
import path from "node:path";

// Every run starts from an empty data directory. Accounts, sessions, and login limits live in SQLite, so
// leftovers from an earlier run would change what the tests see.
export default function setup(): void {
  fs.rmSync(path.resolve("tmp-test-data"), { recursive: true, force: true });
}
