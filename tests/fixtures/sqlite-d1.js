import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

// Real SQLite migrations, isolated in memory. Only this test adapter supplies a
// deterministic database clock. Production has no clock-control endpoint.
export function testDatabase(initial) {
  let clock = initial;
  const db = new DatabaseSync(":memory:");
  db.function("unixepoch", { varargs: true }, () => clock / 1000);
  for (const name of readdirSync(new URL("../../migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    db.exec(
      readFileSync(
        new URL("../../migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  function prepare(sql) {
    let args = [];
    const query = {
      bind(...values) {
        args = values;
        return query;
      },
      async first() {
        return db.prepare(sql).get(...args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args), success: true };
      },
      async run() {
        const r = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(r.changes) } };
      },
      sql: () => sql,
      args: () => args,
    };
    return query;
  }
  return {
    db,
    now: () => clock,
    setNow(value) {
      clock = value;
    },
    DB: {
      prepare,
      async batch(queries) {
        db.exec("BEGIN IMMEDIATE");
        try {
          const result = [];
          for (const query of queries) {
            const statement = db.prepare(query.sql());
            if (/^\s*SELECT\b/i.test(query.sql())) {
              result.push({
                success: true,
                results: statement.all(...query.args()),
              });
              continue;
            }
            const row = statement.run(...query.args());
            result.push({
              success: true,
              meta: { changes: Number(row.changes) },
            });
          }
          db.exec("COMMIT");
          return result;
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
}
