import { getWorkspaceContext } from "../context/workspaceContext";
import { getPreparationDatabase } from "../database/preparationDatabase";

/** Table names are a closed service-owned union, never request/model arguments. */
export type PreparationTable =
  | "preparations"
  | "preparation_documents"
  | "preparation_sources"
  | "preparation_assets"
  | "preparation_proposals"
  | "preparation_tasks";
const owner = () => getWorkspaceContext().userId;
const decode = <T>(row: unknown): T | undefined =>
  row ? (JSON.parse((row as { data: string }).data) as T) : undefined;
export const preparationRepository = {
  transaction<T>(action: () => T): T {
    return getPreparationDatabase().transaction(action)();
  },
  get<T>(table: PreparationTable, id: string): T | undefined {
    return decode<T>(
      getPreparationDatabase()
        .prepare(`SELECT data FROM ${table} WHERE id=? AND owner_id=?`)
        .get(id, owner()),
    );
  },
  list<T>(table: PreparationTable, preparationId?: string): T[] {
    const rows =
      preparationId === undefined
        ? getPreparationDatabase()
            .prepare(
              `SELECT data FROM ${table} WHERE owner_id=? ORDER BY rowid DESC`,
            )
            .all(owner())
        : getPreparationDatabase()
            .prepare(
              `SELECT data FROM ${table} WHERE owner_id=? AND preparation_id=? ORDER BY rowid`,
            )
            .all(owner(), preparationId);
    return rows.map((row) => decode<T>(row)!);
  },
  put<T extends { id: string }>(
    table: PreparationTable,
    record: T,
    preparationId?: string,
  ) {
    if (table === "preparations")
      getPreparationDatabase()
        .prepare(
          "INSERT INTO preparations(id,owner_id,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE owner_id=excluded.owner_id",
        )
        .run(record.id, owner(), JSON.stringify(record));
    else
      getPreparationDatabase()
        .prepare(
          `INSERT INTO ${table}(id,preparation_id,owner_id,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE owner_id=excluded.owner_id`,
        )
        .run(record.id, preparationId, owner(), JSON.stringify(record));
    return record;
  },
  remove(table: PreparationTable, id: string) {
    getPreparationDatabase()
      .prepare(`DELETE FROM ${table} WHERE id=? AND owner_id=?`)
      .run(id, owner());
  },
  addRevision<T extends { id: string; revision: number }>(record: T) {
    getPreparationDatabase()
      .prepare(
        "INSERT INTO preparation_revisions(document_id,revision,owner_id,data) VALUES(?,?,?,?)",
      )
      .run(record.id, record.revision, owner(), JSON.stringify(record));
  },
  getRevision<T>(id: string, revision: number): T | undefined {
    return decode<T>(
      getPreparationDatabase()
        .prepare(
          "SELECT data FROM preparation_revisions WHERE document_id=? AND revision=? AND owner_id=?",
        )
        .get(id, revision, owner()),
    );
  },
  revisions<T>(id: string): T[] {
    return getPreparationDatabase()
      .prepare(
        "SELECT data FROM preparation_revisions WHERE document_id=? AND owner_id=? ORDER BY revision DESC",
      )
      .all(id, owner())
      .map((row) => decode<T>(row)!);
  },
  operation(id: string): { fingerprint: string; result: string } | undefined {
    return getPreparationDatabase()
      .prepare(
        "SELECT fingerprint,result FROM preparation_operations WHERE owner_id=? AND id=?",
      )
      .get(owner(), id) as { fingerprint: string; result: string } | undefined;
  },
  saveOperation(id: string, fingerprint: string, result: unknown) {
    getPreparationDatabase()
      .prepare("INSERT INTO preparation_operations VALUES(?,?,?,?)")
      .run(owner(), id, fingerprint, JSON.stringify(result));
  },
  setting<T>(name: string): T | undefined {
    return decode<T>(
      getPreparationDatabase()
        .prepare(
          "SELECT data FROM preparation_settings WHERE owner_id=? AND name=?",
        )
        .get(owner(), name),
    );
  },
  setSetting(name: string, value: unknown) {
    getPreparationDatabase()
      .prepare(
        "INSERT INTO preparation_settings VALUES(?,?,?) ON CONFLICT(owner_id,name) DO UPDATE SET data=excluded.data",
      )
      .run(owner(), name, JSON.stringify(value));
  },
  session<T>(id: string): T | undefined {
    return decode<T>(
      getPreparationDatabase()
        .prepare(
          "SELECT data FROM preparation_sessions WHERE owner_id=? AND session_id=?",
        )
        .get(owner(), id),
    );
  },
  sessions<T>(preparationId: string): T[] {
    return getPreparationDatabase()
      .prepare(
        "SELECT data FROM preparation_sessions WHERE owner_id=? AND preparation_id=? ORDER BY rowid DESC",
      )
      .all(owner(), preparationId)
      .map((row) => decode<T>(row)!);
  },
  setSession(id: string, preparationId: string, value: unknown) {
    getPreparationDatabase()
      .prepare(
        "INSERT INTO preparation_sessions VALUES(?,?,?,?) ON CONFLICT(owner_id,session_id) DO UPDATE SET preparation_id=excluded.preparation_id,data=excluded.data",
      )
      .run(owner(), id, preparationId, JSON.stringify(value));
  },
};
