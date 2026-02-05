import * as sqliteVec from "sqlite-vec";
export function loadSqliteVec(db) {
    db.enableLoadExtension(true);
    sqliteVec.load(db);
    db.enableLoadExtension(false); // Disable after loading for security
}
//# sourceMappingURL=sqlite-vec.js.map