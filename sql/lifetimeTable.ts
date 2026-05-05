import * as fs from "fs";
import * as path from "path";
import * as sqlite3 from "sqlite3";

const dbPath = path.join(__dirname, "Combined.sql");
const outputPath = path.join(__dirname, "LifetimePlayerTable.txt");
const maxDiscordMessageLength = 1900;

type PlayerRow = {
    id_player: string;
    score_raw_total: number;
    score_adj_total: number;
    rank_total: number;
    game_total: number;
};

function all<T>(db: sqlite3.Database, sql: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows as T[]);
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

function formatScore(score: number): string {
    const value = score / 1000;
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function formatPlayer(row: PlayerRow, index: number): string {
    const averageAdj = row.score_adj_total / row.game_total;
    const averageRank = row.rank_total / row.game_total;

    return [
        String(index + 1).padStart(3),
        `<@${row.id_player}>`.padEnd(24),
        String(row.game_total).padStart(3),
        formatScore(row.score_adj_total).padStart(8),
        formatScore(averageAdj).padStart(7),
        averageRank.toFixed(2).padStart(5),
    ].join("  ");
}

function chunkLines(lines: string[]): string[] {
    const chunks: string[] = [];
    let current = "";

    for (const line of lines) {
        const next = current.length === 0 ? line : `${current}\n${line}`;

        if (next.length > maxDiscordMessageLength) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }

    if (current.length > 0) {
        chunks.push(current);
    }

    return chunks;
}

async function printLifetimeTable(): Promise<void> {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Missing ${dbPath}. Run npx ts-node .\\sql\\combine.ts first.`);
    }

    const db = new sqlite3.Database(dbPath);

    try {
        const players = await all<PlayerRow>(
            db,
            `
            SELECT
                id_player,
                score_raw_total,
                score_adj_total,
                rank_total,
                game_total
            FROM DataPlayer
            ORDER BY score_adj_total DESC, game_total DESC, id_player ASC
            `
        );

        const lines = players.map(formatPlayer);
        const chunks = chunkLines(lines);
        const output = chunks.join("\n\n");

        fs.writeFileSync(outputPath, output, "utf8");
        console.log(output);
        console.log(`\nWrote ${players.length} players to ${outputPath}`);
    } finally {
        await close(db);
    }
}

printLifetimeTable().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
