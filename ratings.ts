import { readFile, writeFile } from "fs/promises";

// ratings.js
const BASE_RATING = 1500;
const MIN_MULTIPLIER = 0.2;
const ADJ_CONSTANT = 40; // Used in adjustment calculation

interface Player {
  r: number; // rating
  n: number; // games played
  t: number; // total adjusted score
}

interface GamePlayer {
  id: string;
  score: number;
  adj: number;
  rank: number;
}

function convertGame(game: GamePlayer[]): void {
  // ...implement as needed...
}

let players: Map<string, Player> = new Map();

function updateRatings(game: GamePlayer[]): void {
  // ...implement as needed...
}

function getPlayer(id: string): Player {
  if (!players.has(id)) {
    players.set(id, { r: BASE_RATING, n: 0, t: 0 });
  }
  return players.get(id)!;
}

function updateGame(game: GamePlayer[]): void {
  // 1) Sort by raw score descending
  game.sort((a, b) => b.score - a.score);

  // 2) Pre-compute table average rating
  const Rs = game.map(p => getPlayer(p.id).r);
  const tableAvg = Rs.reduce((a, b) => a + b, 0) / Rs.length;
  const seededAvg = Math.max(1500, tableAvg);

  // 3) For each player, compute ΔR via your formula
  game.forEach(p => {
    const pl = getPlayer(p.id);

    // “number of games” BEFORE this one
    const g = pl.n;

    // multiplier = max(1 – 0.002·g, 0.2)
    const multiplier = Math.max(1 - 0.05 * g, MIN_MULTIPLIER);

    // adjustment = (seededAvg – playerRating) / 40
    const adjustment = (seededAvg - pl.r) / ADJ_CONSTANT;

    // adjusted_score is your p.adj (e.g. score–25k+uma)
    // change = multiplier * (adjusted_score/1000 + adjustment)
    const change = multiplier * (p.adj / 1000 + adjustment);

    // apply
    pl.r += change;
    pl.n += 1;
    pl.t += p.adj;
  });
}

function runSeason(allGames: GamePlayer[][]) {
  allGames.forEach(updateGame);
  return [...players.entries()]
    .map(([id, { r, n, t }]) => ({ id, elo: +r.toFixed(1), games: n, totalAdj: t, averageAdj: t / n }))
    .sort((a, b) => b.elo - a.elo);
}

(async () => {
  const raw = await readFile("./adjusted.json", "utf8");
  const games: GamePlayer[][] = JSON.parse(raw);

  games.forEach((game) => {
    game.forEach((player) => {
      const { id, adj } = player;
      if (!players.has(id)) {
        players.set(id, { r: BASE_RATING, n: 0, t: 0 });
      }
      const pl = players.get(id)!;
      pl.t += adj;
    });
  });

  const results = runSeason(games);

  // Save results as text file
  // Don't include less than 10 games
  const filteredResults = results.filter(({ games }) => games >= 10);
  const output = filteredResults.map(({ id, elo, games, totalAdj }) => `${id}: ${elo} (${games} games) ${totalAdj}`).join('\n');
  await writeFile("./ratings.txt", output, "utf8");
})();