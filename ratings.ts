import { readFileSync, writeFileSync } from "fs";

// ratings.js
const BASE_RATING = 1500;
const MIN_MULTIPLIER = 0.2;
const ADJ_CONSTANT = 20; // Used in adjustment calculation
const MULTIPLIER_PER_GAME = 0;

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

const rankList = ['E1','E2','E3','M1','M2','M3','S1','S2','S3']

let playerSeeds: Map<string, number> = new Map()
const file = readFileSync("./data/ranks.json", "utf-8")
const seeds: Record<string, string> = JSON.parse(file);
console.log(seeds);

let players: Map<string, Player> = new Map();



function getPlayer(id: string): Player {
  if (!players.has(id)) {
    const bonus = (rankList.indexOf(seeds[id]) + 1) * 40;
    players.set(id, { r: BASE_RATING + bonus, n: 0, t: 0 });
  }
  return players.get(id)!;
}

getPlayer('Koga')
getPlayer('Michael')
getPlayer('eporijewqr')

function updateRatings(game: GamePlayer[]): number[] {
  //insert your formula here:

  const tableAvg = game.reduce((acc, player) => acc + getPlayer(player.id).r, 0) / 4
  const seededAvg = Math.max(1500, tableAvg);

  
  return game.map(p => {
    const pl = getPlayer(p.id);
    // multiplier = max(1 – 0.002·g, 0.2)
    const multiplier = Math.max(1 - MULTIPLIER_PER_GAME * pl.n, MIN_MULTIPLIER);

    // adjustment = (seededAvg – playerRating) / 40
    const adjustment = (seededAvg - pl.r) / ADJ_CONSTANT;

    // adjusted_score is your p.adj (e.g. score–25k+uma)
    // change = multiplier * (adjusted_score/1000 + adjustment)
    const change = multiplier * (p.adj / 1000 + adjustment);

    pl.r += change;
    pl.n += 1;
    pl.t += p.adj;

    return change
  })
  
}

function updateGame(game: GamePlayer[]): void {
  // 1) Sort by raw score descending
  game.sort((a, b) => b.score - a.score);

  let changes = updateRatings(game);
  console.log(game.map((p,i) => `${p.id}: ${(p.adj / 1000).toFixed(1)} : ${changes[i]} : ${getPlayer(p.id).r}`))
}

function runSeason(allGames: GamePlayer[][]) {
  allGames.forEach(updateGame);
  return [...players.entries()]
    .map(([id, { r, n, t }]) => ({ id, elo: +r.toFixed(1), games: n, totalAdj: t, averageAdj: t / n }))
    .sort((a, b) => b.elo - a.elo);
}

const raw = readFileSync("./data/adjusted.json", "utf8");
const games: GamePlayer[][] = JSON.parse(raw);

games.forEach((game) => {
  game.forEach((player) => {
    const { id, adj } = player;
    if (!players.has(id)) {
      players.set(id, { r: BASE_RATING, n: 0, t: 0 });
    }
    const pl = players.get(id)!;
  });
});

const results = runSeason(games);

// Save results as text file
// Don't include less than 10 games
const filteredResults = results.filter(({ games }) => games >= 10);
const output = filteredResults.map(({ id, elo, games, totalAdj }) => `${id}: ${elo} (${games} games) ${totalAdj}`).join('\n');

writeFileSync("./ratings3.txt", output, "utf8");
