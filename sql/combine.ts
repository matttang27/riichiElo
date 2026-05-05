import * as fs from "fs";
import * as path from "path";
import * as sqlite3 from "sqlite3";

const sqlDir = __dirname;
const outputFile = "Combined.sql";
const outputPath = path.join(sqlDir, outputFile);

type SqliteRow = Record<string, unknown>;

function quoteIdent(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function all<T = SqliteRow>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T[]);
        });
    });
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<number> {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this.changes ?? 0);
        });
    });
}

function close(db: sqlite3.Database): Promise<void> {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function createSchemaFrom(sourcePath: string, dest: sqlite3.Database): Promise<void> {
    const source = new sqlite3.Database(sourcePath);
    try {
        const schemaRows = await all<{ sql: string }>(
            source,
            `
            SELECT sql
            FROM sqlite_master
            WHERE sql IS NOT NULL
              AND type IN ('table', 'index', 'trigger', 'view')
              AND name NOT LIKE 'sqlite_%'
            ORDER BY CASE type
                WHEN 'table' THEN 1
                WHEN 'index' THEN 2
                WHEN 'trigger' THEN 3
                WHEN 'view' THEN 4
                ELSE 5
            END
            `
        );

        for (const row of schemaRows) {
            await run(dest, row.sql);
        }
    } finally {
        await close(source);
    }
}

async function getTables(db: sqlite3.Database): Promise<string[]> {
    const rows = await all<{ name: string }>(
        db,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    return rows.map((row) => row.name);
}

async function copyRows(sourcePath: string, dest: sqlite3.Database): Promise<Record<string, number>> {
    const source = new sqlite3.Database(sourcePath);
    const insertedByTable: Record<string, number> = {};

    try {
        const tables = await getTables(source);

        for (const table of tables) {
            const rows = await all(source, `SELECT * FROM ${quoteIdent(table)}`);
            insertedByTable[table] = 0;

            if (rows.length === 0) {
                continue;
            }

            const columns = Object.keys(rows[0]);
            const columnList = columns.map(quoteIdent).join(", ");
            const placeholders = columns.map(() => "?").join(", ");

            let insertSql: string;
            if (table === "DataPlayer" && columns.includes("id_player")) {
                const updates = columns
                    .filter((column) => column !== "id_player")
                    .map((column) => `${quoteIdent(column)} = ${quoteIdent(table)}.${quoteIdent(column)} + excluded.${quoteIdent(column)}`)
                    .join(", ");

                insertSql = `
                    INSERT INTO ${quoteIdent(table)} (${columnList})
                    VALUES (${placeholders})
                    ON CONFLICT(${quoteIdent("id_player")}) DO UPDATE SET ${updates}
                `;
            } else {
                insertSql = `
                    INSERT OR IGNORE INTO ${quoteIdent(table)} (${columnList})
                    VALUES (${placeholders})
                `;
            }

            for (const row of rows) {
                insertedByTable[table] += await run(
                    dest,
                    insertSql,
                    columns.map((column) => row[column])
                );
            }
        }
    } finally {
        await close(source);
    }

    return insertedByTable;
}

async function combineDatabases(): Promise<void> {
    const inputFiles = fs
        .readdirSync(sqlDir)
        .filter((file) => file.endsWith(".sql") && file !== outputFile)
        .sort();

    if (inputFiles.length === 0) {
        throw new Error(`No .sql files found in ${sqlDir}`);
    }

    if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
    }

    const dest = new sqlite3.Database(outputPath);

    try {
        await createSchemaFrom(path.join(sqlDir, inputFiles[0]), dest);
        await run(dest, "BEGIN TRANSACTION");

        for (const file of inputFiles) {
            const insertedByTable = await copyRows(path.join(sqlDir, file), dest);
            const summary = Object.entries(insertedByTable)
                .map(([table, count]) => `${table}: ${count}`)
                .join(", ");
            console.log(`${file} -> ${summary}`);
        }

        await run(dest, "COMMIT");
    } catch (err) {
        try {
            await run(dest, "ROLLBACK");
        } catch {
            // Ignore rollback errors so the original error is reported.
        }
        throw err;
    } finally {
        await close(dest);
    }

    console.log(`Combined ${inputFiles.length} databases into ${outputPath}`);
}

combineDatabases().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
