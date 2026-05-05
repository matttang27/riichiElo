import * as fs from "fs";
import * as path from "path";
import * as sqlite3 from "sqlite3";

const dbPath = path.join(__dirname, "Combined.sql");
const outputPath = path.join(__dirname, "LifetimeProgressionSimulation.txt");

const rules = {
    participationPoints: 0,
    adjustedScoreDivisor: 1000,
    opponentDifficultyPriorGames: 20,
    ranks: [
        { name: "Novice", threshold: 0, placementBonus: [20, 10, 0, -10] },
        { name: "Adept", threshold: 100, placementBonus: [20, 10, 0, -20] },
        { name: "Expert", threshold: 300, placementBonus: [20, 10, 0, -30] },
        { name: "Master", threshold: 600, placementBonus: [20, 10, 0, -35] },
        { name: "Saint", threshold: 1000, placementBonus: [20, 10, 0, -40] },
        { name: "Celestial", threshold: 1500, placementBonus: [20, 10, 0, -45] },
    ],
};

type GameRow = {
    id_game: string;
    date: number;
    id_player_1: string;
    id_player_2: string;
    id_player_3: string;
    id_player_4: string;
    score_raw_1: number;
    score_raw_2: number;
    score_raw_3: number;
    score_raw_4: number;
    score_adj_1: number;
    score_adj_2: number;
    score_adj_3: number;
    score_adj_4: number;
};

type PlayerState = {
    id: string;
    rank: number;
    points: number;
    floor: number;
    games: number;
    totalAdjustedScore: number;
    totalPlacement: number;
    promotions: number;
};

type GameResult = {
    id: string;
    rawScore: number;
    adjustedScore: number;
    placement: number;
};

type PlayerGame = {
    gameId: string;
    adjustedScore: number;
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

function rankFloor(rank: number): number {
    return rules.ranks[rank - 1]?.threshold ?? rules.ranks[rules.ranks.length - 1].threshold;
}

function rankForPoints(points: number): number {
    let rank = 1;

    for (let i = 0; i < rules.ranks.length; i++) {
        if (points >= rules.ranks[i].threshold) {
            rank = i + 1;
        }
    }

    return rank;
}

function getPlayer(players: Map<string, PlayerState>, id: string): PlayerState {
    let player = players.get(id);

    if (!player) {
        player = {
            id,
            rank: 1,
            points: 0,
            floor: 0,
            games: 0,
            totalAdjustedScore: 0,
            totalPlacement: 0,
            promotions: 0,
        };
        players.set(id, player);
    }

    return player;
}

function rankName(rank: number): string {
    return rules.ranks[rank - 1]?.name ?? rules.ranks[rules.ranks.length - 1].name;
}

function gameResults(game: GameRow): GameResult[] {
    const results = [
        { id: game.id_player_1, rawScore: game.score_raw_1, adjustedScore: game.score_adj_1, placement: 0 },
        { id: game.id_player_2, rawScore: game.score_raw_2, adjustedScore: game.score_adj_2, placement: 0 },
        { id: game.id_player_3, rawScore: game.score_raw_3, adjustedScore: game.score_adj_3, placement: 0 },
        { id: game.id_player_4, rawScore: game.score_raw_4, adjustedScore: game.score_adj_4, placement: 0 },
    ];

    return results
        .sort((a, b) => b.rawScore - a.rawScore)
        .map((result, index) => ({ ...result, placement: index + 1 }));
}

function applyGame(player: PlayerState, result: GameResult): void {
    const currentRank = player.rank;
    const performancePoints = result.adjustedScore / rules.adjustedScoreDivisor;
    const placementBonus = rules.ranks[currentRank - 1].placementBonus[result.placement - 1];
    const delta = rules.participationPoints + performancePoints + placementBonus;

    player.games += 1;
    player.totalAdjustedScore += result.adjustedScore;
    player.totalPlacement += result.placement;
    player.points = Math.max(player.floor, player.points + delta);

    const nextRank = rankForPoints(player.points);
    if (nextRank > player.rank) {
        player.rank = nextRank;
        player.floor = rankFloor(nextRank);
        player.promotions += 1;
    }
}

function formatScore(score: number): string {
    return `${score >= 0 ? "+" : ""}${score.toFixed(1)}`;
}

function formatOptionalScore(score: number | null | undefined): string {
    if (score == null) {
        return "N/A";
    }

    return formatScore(score);
}

function calculateOpponentDifficulty(games: GameRow[]): Map<string, number | null> {
    const gamePlayerIds = new Map<string, Set<string>>();
    const playerGames = new Map<string, PlayerGame[]>();
    let clubAdjustedScoreTotal = 0;
    let clubPlayerGameCount = 0;

    for (const game of games) {
        const players = gameResults(game);
        gamePlayerIds.set(game.id_game, new Set(players.map((player) => player.id)));

        for (const player of players) {
            clubAdjustedScoreTotal += player.adjustedScore;
            clubPlayerGameCount += 1;

            const existingGames = playerGames.get(player.id) ?? [];
            existingGames.push({ gameId: game.id_game, adjustedScore: player.adjustedScore });
            playerGames.set(player.id, existingGames);
        }
    }

    const clubAverageAdjustedScore =
        clubPlayerGameCount === 0 ? 0 : clubAdjustedScoreTotal / clubPlayerGameCount / 1000;
    const pairAverageCache = new Map<string, number | null>();

    function opponentAverageExcludingPlayer(playerId: string, opponentId: string): number | null {
        const cacheKey = `${playerId}:${opponentId}`;
        if (pairAverageCache.has(cacheKey)) {
            return pairAverageCache.get(cacheKey) ?? null;
        }

        const opponentGames = playerGames.get(opponentId) ?? [];
        const eligibleGames = opponentGames.filter((game) => !gamePlayerIds.get(game.gameId)?.has(playerId));

        if (eligibleGames.length === 0) {
            pairAverageCache.set(cacheKey, null);
            return null;
        }

        const observedAverage =
            eligibleGames.reduce((sum, game) => sum + game.adjustedScore, 0) /
            eligibleGames.length /
            1000;
        const smoothedAverage =
            (eligibleGames.length * observedAverage +
                rules.opponentDifficultyPriorGames * clubAverageAdjustedScore) /
            (eligibleGames.length + rules.opponentDifficultyPriorGames);

        pairAverageCache.set(cacheKey, smoothedAverage);
        return smoothedAverage;
    }

    const opponentDifficultyByPlayer = new Map<string, number | null>();

    for (const [playerId, gamesForPlayer] of playerGames.entries()) {
        let total = 0;
        let count = 0;

        for (const game of gamesForPlayer) {
            const opponents = [...(gamePlayerIds.get(game.gameId) ?? [])].filter((id) => id !== playerId);

            for (const opponentId of opponents) {
                const opponentAverage = opponentAverageExcludingPlayer(playerId, opponentId);

                if (opponentAverage != null) {
                    total += opponentAverage;
                    count += 1;
                }
            }
        }

        opponentDifficultyByPlayer.set(playerId, count === 0 ? null : total / count);
    }

    return opponentDifficultyByPlayer;
}

function formatPlayer(
    player: PlayerState,
    index: number,
    opponentDifficultyByPlayer: Map<string, number | null>
): string {
    const averageAdjustedScore = player.totalAdjustedScore / player.games / 1000;
    const averagePlacement = player.totalPlacement / player.games;
    const opponentDifficulty = opponentDifficultyByPlayer.get(player.id);

    return [
        String(index + 1).padStart(3),
        `<@${player.id}>`.padEnd(24),
        rankName(player.rank).padEnd(9),
        player.points.toFixed(1).padStart(7),
        String(player.games).padStart(3),
        formatScore(averageAdjustedScore).padStart(7),
        averagePlacement.toFixed(2).padStart(5),
        formatOptionalScore(opponentDifficulty).padStart(7),
    ].join("  ");
}

async function simulateLifetime(): Promise<void> {
    if (!fs.existsSync(dbPath)) {
        throw new Error(`Missing ${dbPath}. Run npx ts-node .\\sql\\combine.ts first.`);
    }

    const db = new sqlite3.Database(dbPath);

    try {
        const games = await all<GameRow>(
            db,
            `
            SELECT
                id_game,
                date,
                id_player_1,
                id_player_2,
                id_player_3,
                id_player_4,
                score_raw_1,
                score_raw_2,
                score_raw_3,
                score_raw_4,
                score_adj_1,
                score_adj_2,
                score_adj_3,
                score_adj_4
            FROM DataGame
            ORDER BY date ASC, id_game ASC
            `
        );

        const players = new Map<string, PlayerState>();
        const opponentDifficultyByPlayer = calculateOpponentDifficulty(games);

        for (const game of games) {
            for (const result of gameResults(game)) {
                applyGame(getPlayer(players, result.id), result);
            }
        }

        const rankedPlayers = [...players.values()].sort((a, b) => {
            if (b.rank !== a.rank) return b.rank - a.rank;
            if (b.points !== a.points) return b.points - a.points;
            return b.games - a.games;
        });

        const lines = [
            " #  player                    rank          pts   g  avgAdj  avgPl   oppAvg",
            ...rankedPlayers.map((player, index) =>
                formatPlayer(player, index, opponentDifficultyByPlayer)
            ),
        ];

        const output = lines.join("\n");
        fs.writeFileSync(outputPath, output, "utf8");
        console.log(output);
        console.log(`\nSimulated ${games.length} games for ${rankedPlayers.length} players.`);
        console.log(`Wrote ${outputPath}`);
    } finally {
        await close(db);
    }
}

simulateLifetime().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
