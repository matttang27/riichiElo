import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';

const dbNames = ['F24', 'S25', 'W25'];
const outputDb = 'Combined.sql';

function copyTableStructureAndData(sourceDb: string, destDb: sqlite3.Database, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const src = new sqlite3.Database(sourceDb);
        src.serialize(() => {
            src.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tableName], (err, row) => {
                const tableRow = row as { sql: string } | undefined;
                if (err || !tableRow) {
                    src.close();
                    return reject(err || new Error('Table not found'));
                }
                destDb.run(tableRow.sql, [], (err2) => {
                    if (err2 && !/already exists/.test(err2.message)) {
                        src.close();
                        return reject(err2);
                    }
                    src.all(`SELECT * FROM ${tableName}`, (err3, rows) => {
                        const dataRows = rows as Record<string, any>[];
                        if (err3) {
                            src.close();
                            return reject(err3);
                        }
                        if (dataRows.length > 0) {
                            const columns = Object.keys(dataRows[0]);
                            const placeholders = columns.map(() => '?').join(',');
                            if (tableName === 'DataPlayer') {
                                // For DataPlayer, merge on conflict by summing numeric attributes
                                dataRows.forEach(row => {
                                    const id_player = row['id_player'];
                                    destDb.get(`SELECT * FROM DataPlayer WHERE id_player = ?`, [id_player], (err, existingRowRaw) => {
                                        const existingRow = existingRowRaw as Record<string, any> | undefined;
                                        const rowObj = row as Record<string, any>;
                                        if (err) {
                                            // If error, just try insert
                                            insertPlayer();
                                            return;
                                        }
                                        if (existingRow) {
                                            // Merge: sum numeric attributes
                                            const merged: Record<string, any> = { ...existingRow };
                                            for (const col of columns) {
                                                if (col === 'id_player') continue;
                                                const val1 = Number(existingRow[col]);
                                                const val2 = Number(rowObj[col]);
                                                if (!isNaN(val1) && !isNaN(val2)) {
                                                    merged[col] = val1 + val2;
                                                } else {
                                                    merged[col] = rowObj[col] ?? existingRow[col];
                                                }
                                            }
                                            // Build update statement
                                            const setClause = columns.filter(c => c !== 'id_player').map(c => `${c} = ?`).join(', ');
                                            const updateVals = columns.filter(c => c !== 'id_player').map(c => merged[c]);
                                            destDb.run(`UPDATE DataPlayer SET ${setClause} WHERE id_player = ?`, [...updateVals, id_player]);
                                        } else {
                                            insertPlayer();
                                        }
                                        function insertPlayer() {
                                            const insertStmt = destDb.prepare(`INSERT INTO DataPlayer (${columns.join(',')}) VALUES (${placeholders})`);
                                            insertStmt.run(columns.map(col => rowObj[col]));
                                            insertStmt.finalize();
                                        }
                                    });
                                });
                            } else {
                                const stmt = destDb.prepare(`INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`);
                                dataRows.forEach(row => {
                                    stmt.run(columns.map(col => row[col]));
                                });
                                stmt.finalize();
                            }
                        }
                        src.close();
                        resolve();
                    });
                });
            });
        });
    });
}

async function combineDatabases() {
    if (fs.existsSync(outputDb)) fs.unlinkSync(outputDb);
    const destDb = new sqlite3.Database(outputDb);
    let tableCreated = false;
    for (const dbName of dbNames) {
        const dbPath = `./${dbName}.sql`;
        if (!fs.existsSync(dbPath)) {
            console.log(`File not found: ${dbPath}`);
            continue;
        }
        const src = new sqlite3.Database(dbPath);
        await new Promise<void>((resolve, reject) => {
            src.all(`SELECT name FROM sqlite_master WHERE type='table'`, async (err, tables) => {
                if (err) {
                    src.close();
                    return reject(err);
                }
                const tableList = tables as { name: string }[];
                for (const t of tableList) {
                    if (!tableCreated) {
                        await copyTableStructureAndData(dbPath, destDb, t.name);
                        tableCreated = true;
                    } else {
                        await copyTableStructureAndData(dbPath, destDb, t.name);
                    }
                }
                src.close();
                resolve();
            });
        });
    }
    destDb.close();
    console.log('Databases combined into', outputDb);
}

combineDatabases().catch(console.error);
