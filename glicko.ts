import { readFileSync, writeFileSync } from "fs";
import { Player, Glicko2, playerMatch } from "glicko2.ts";

const BONUS_PER_RANK = 20;
const BASE_RATING = 1500;
// @ts-ignore
const ranking = new Glicko2({
	// tau : "Reasonable choices are between 0.3 and 1.2, though the system should
	//        be tested to decide which value results in greatest predictive accuracy"
	tau: 0.5,
	// rating : default rating
	rating: BASE_RATING,
	//rd : Default rating deviation
	//     small number = good confidence on the rating accuracy
	rd: 200,
	//vol : Default volatility (expected fluctuation on the player rating)
	vol: 0.06,
});
// ratings.js
interface RiichiPlayer {
  p: Player;
  n: number; // games played
  t: number; // total adjusted score
}

interface GamePlayer {
	id: string;
	score: number;
	adj: number;
	rank: number;
}

const rankList = ["E1", "E2", "E3", "M1", "M2", "M3", "S1", "S2", "S3"];

let playerSeeds: Map<string, number> = new Map();
const file = readFileSync("./data/ranks.json", "utf-8");
const seeds: Record<string, string> = JSON.parse(file);
console.log(seeds);

let players: Map<string, RiichiPlayer> = new Map();

function getPlayer(id: string): RiichiPlayer {
	if (!players.has(id)) {
		const bonus = (rankList.indexOf(seeds[id]) + 1) * BONUS_PER_RANK;
		const player = ranking.makePlayer(BASE_RATING + bonus);
        players.set(id, {p: player, n: 0, t: 0})
		console.log(`created player ${id} with elo ${BASE_RATING + bonus}`);
	}
	return players.get(id)!;
}

function glickoMethod(game: GamePlayer[]) {
	//creates 6 individual games where
	//1st gets 1.00 against 4th
	//Other scores are determined by (1 + (diff / (1st vs 4th diff))) * 0.5
	let bigDiff = game[0].adj - game[3].adj;

	const matches: playerMatch[] = [];

	for (var i = 0; i < 4; i++) {
		for (var j = i + 1; j < 4; j++) {
			matches.push([
				getPlayer(game[i].id).p,
				getPlayer(game[j].id).p,
				(1 + (game[i].adj - game[j].adj) / bigDiff) * 0.5,
			]);
		}
	}
    ranking.updateRatings(matches)
}

function updateRatings(game: GamePlayer[]) {
	glickoMethod(game);
}

function updateGame(game: GamePlayer[]): void {
	// 1) Sort by raw score descending
	game.sort((a, b) => b.score - a.score);

    game.forEach(player => {
        const pl = getPlayer(player.id)
        pl.n += 1;
        pl.t += player.adj;
    })

	updateRatings(game);
	console.log(
		game.map(
			(p, i) =>
				`${p.id}: ${(p.adj / 1000).toFixed(1)} : ${getPlayer(p.id).p.getRating()}`
		)
	);
}

function runSeason(allGames: GamePlayer[][]) {
	allGames.forEach(updateGame);
	return [...players.entries()]
		.map(([id, {p, n, t}]) => ({
			id,
			elo: +p.getRating().toFixed(1),
			games: n,
			totalAdj: t,
			averageAdj: t / n,
		}))
		.sort((a, b) => b.elo - a.elo);
}

const raw = readFileSync("./data/adjusted.json", "utf8");
const games: GamePlayer[][] = JSON.parse(raw);

const results = runSeason(games);

// Save results as text file
// Don't include less than 10 games
const filteredResults = results.filter(({ games }) => games >= 5);
const output = filteredResults
	.map(({ id, elo, games, totalAdj }) => `${id}: ${elo} (${games} games) ${totalAdj}`)
	.join("\n");

writeFileSync("./ratings3.txt", output, "utf8");
