
import type { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

export function loadSqliteVec(db: DatabaseSync): void {
    db.enableLoadExtension(true);
    sqliteVec.load(db);
    db.enableLoadExtension(false); // Disable after loading for security
}
