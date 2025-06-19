const { readFile, writeFile } = require("fs/promises");

// ratings.js
const BASE_RATING = 1500;
const MIN_MULTIPLIER = 0.2;
const ADJ_CONSTANT = 40; // Used in adjustment calculation

/**
 * @typedef {Object} Player
 * @property {number} rating - Player's current rating
 * @property {number} gamesPlayed - Number of games played
 * @property {number} totalAdj - Total adjusted score
 * @property {number} totalRank - Sum of ranks
 */

/**
 * @typedef {Object} GamePlayer
 * @property {string} id - Player's ID
 * @property {number} score - Player's score
 * @property {number} adj - Player's adjusted score
 * @property {number} rank - Player's rank in the game
 */

function convertGame(game) {
    
}
/**
 * @type {Map<string, Player>}
 */
let players = new Map();

/**
 * @param {Array<{ player: Player, score: number, adj: number, rank: number }} game 
 * Updates the ratings of players based on the game results.
 */
function updateRatings(game) {
    
}

function getPlayer(id) {
  if (!players.has(id)) {
    players.set(id, { r: BASE_RATING, n: 0, t: 0 });
  }
  return players.get(id);
}

/**
 * 
 * @param {Array<{ id: string, score: number, adj: number }>} game 
 */
function updateGame(game) {
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
    pl.t += p.adj; // total adjusted score
  });
}

function runSeason(allGames) {
  allGames.forEach(updateGame);
  return [...ratings.entries()]
    .map(([id, { r, n, t }]) => ({ id, elo: +r.toFixed(1), games: n, totalAdj: t, averageAdj: t / n }))
    .sort((a, b) => b.elo - a.elo);
}


(async () => {
    const raw = await readFile("./adjusted.json", "utf8");
    /*
    [
  [
    {
      "id": "Paul",
      "score": 40100,
      "adj": 30100
    },
    {
      "id": "Andy",
      "score": 29000,
      "adj": 9000
    },
    {
      "id": "yzsan",
      "score": 15800,
      "adj": -14200
    },
    {
      "id": "Rocraft_ (Eric)",
      "score": 15100,
      "adj": -24900
    }
  ],
  [
    {
      "id": "NoobWind",
      "score": 40900,
      "adj": 30900
    },
    {
      "id": "Paul",
      "score": 24500,
      "adj": 4500
    },
    {
      "id": "Zeliang",
      "score": 18500,
      "adj": -11500
    },
    {
      "id": "Andy",
      "score": 16100,
      "adj": -23900
    }
]]
    */
    /**
     * @type {Array<Array<{ id: string, score: number, adj: number }>>}
     */
    const games = JSON.parse(raw);
    
    games.forEach((game) => {
        game.forEach((player) => {
            const { id, adj } = player;
            if (!players.has(id)) {
                players.set(id, { r: BASE_RATING, n: 0, totalAdj: 0 });
            }
            const pl = players.get(id);
            pl.totalAdj += adj;
        });
    });

    const results = runSeason(games);

    

    // Save results as text file
    // Don't include less than 10 games
    const filteredResults = results.filter(({ games }) => games >= 10);
    const output = filteredResults.map(({ id, elo, games, totalAdj }) => `${id}: ${elo} (${games} games) ${totalAdj}`).join('\n');
    await writeFile("./ratings.txt", output, "utf8");


})();