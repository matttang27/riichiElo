const fs = require('fs');

// Note that a lot of text was manually changed, this is just a helper
// fixed.json contains the cleaned up data.

//Filter + Clean removes messages that do not have 4 '@' characters and removes "(edited)" from the messages
function filter() {
	const raw = fs.readFileSync("./original.json", "utf8");
	const data = JSON.parse(raw);

	const atCountSummary = {};
	data.forEach((str) => {
		const count = (str.match(/@/g) || []).length;
		atCountSummary[count] = (atCountSummary[count] || 0) + 1;
	});
	console.log(atCountSummary);

	// Remove strings that do not have 4 '@' characters
	const filteredData = data.filter((str) => {
		const count = (str.match(/@/g) || []).length;
		return count === 4;
	});

	fs.writeFileSync("./filtered.json", JSON.stringify(cleanedData, null, 2), "utf8");

	return filteredData;
}

function clean(path) {
	const raw = fs.readFileSync(path, "utf8");
	const filteredData = JSON.parse(raw);
	const cleanedData = filteredData.map((str) => str.replace(/\(edited\)/g, ""));

	fs.writeFileSync("./cleaned.json", JSON.stringify(cleanedData, null, 2), "utf8");
}

/**
 * To be a valid game, each string must have 4 players, with no space between the '@' and the name.
 * Each player must have a score, which can be an integer or a float.
 * @param {string[]} games
 */
function stringsToObject(games) {
	const parsed = games.map((game, index) => {
		const obj = {};
		game
			.split("\n") // one line per player
			.forEach((line) => {
				// capture name (no leading "@") and score (int or float)
				const match = line.match(/^@(.+?)\s+([+-]?\d+(?:\.\d+)?)/u);
				if (!match) {
					console.log(`Skipping line ${index + 1}: "${line}"`); // Debugging output
					return;
				} // skip lines that don't match
				const [, rawName, rawScore] = match;
				const name = rawName.trim();
				const score = rawScore.includes(".")
					? parseFloat(rawScore)
					: parseInt(rawScore, 10);
				obj[name] = score;
			});
		return obj;
	});

	return parsed;
}

// Converts the strings to objects, counting how many times each player appears
function convert() {
	const raw = fs.readFileSync("./filtered.json", "utf8");
	const data = JSON.parse(raw);
	const counts = {};

	let games = stringsToObject(data);

	//count how many times each player appears
	games.forEach((game) => {
		Object.keys(game).forEach((name) => {
			counts[name] = (counts[name] || 0) + 1;
		});
	});

	fs.writeFileSync("./converted.json", JSON.stringify(games, null, 2), "utf8");
}

// Multiplies float scores by 1000.
// If the sum of scores is not 100000, adjusts the scores evenly so that they sum to 100000.
function fix() {
	const raw = fs.readFileSync("./converted.json", "utf8");
	const games = JSON.parse(raw);

	//for each game, check if scores sum up to 100 or 100000. If they sum up to 100, multiply by 1000. If they do not sum up, print the game and sum
	games.forEach((game, index) => {
		// make sure placement order does not change after adjustments
		const originalOrder = Object.keys(game).sort((a, b) => game[b] - game[a]);
		console.log(`Game ${index + 1}:`, game);
		let sum = Object.values(game).reduce((acc, score) => acc + score, 0);
		sum = Number(sum.toFixed(10));
		console.log(`Sum: ${sum}`);
		if (sum < 200) {
			Object.keys(game).forEach((name) => {
				game[name] *= 1000;
			});
			console.log(`Game ${index + 1} summed to ${sum}, multiplying scores by 1000.`);
			sum *= 1000;
			console.log(game);
		}

		if (sum > 100000) {
			// If the sum is over 100000, adjust the scores:
			// error = sum - 100000;
			// remove error / 4 from each player (rounded down to nearest 100)
			// remaning subtract from last place
			const error = sum - 100000;
			const adjustment = Math.floor(error / 4 / 100) * 100; // Round down to nearest 100
			const lastPlace = Object.keys(game).reduce((a, b) => (game[a] < game[b] ? a : b));
			Object.keys(game).forEach((name) => {
				if (name === lastPlace) {
					game[name] -= error - adjustment * 3; // Last place gets the remaining error
				} else {
					game[name] -= adjustment;
				}
			});
			console.log(
				`Game ${index + 1} summed to ${sum}, adjusting scores to sum to 100000.`
			);
			console.log(
				`Adjustment: ${adjustment}, ${lastPlace} gets an additional ${
					error - adjustment * 4
				}`
			);
			console.log(game);
		} else if (sum < 100000) {
			//opposite of above, add error / 4 to each player (rounded down to nearest 100) and give the remaining to first place
			const error = 100000 - sum;
			const adjustment = Math.floor(error / 4 / 100) * 100; // Round down to nearest 100
			const firstPlace = Object.keys(game).reduce((a, b) => (game[a] > game[b] ? a : b));
			Object.keys(game).forEach((name) => {
				if (name === firstPlace) {
					game[name] += error - adjustment * 3; // First place gets the remaining error
				} else {
					game[name] += adjustment;
				}
			});
			console.log(
				`Game ${index + 1} summed to ${sum}, adjusting scores to sum to 100000.`
			);
			console.log(
				`Adjustment: ${adjustment}, ${firstPlace} gets an additional ${
					error - adjustment * 4
				}`
			);
			console.log(game);
		}

		// Ensure the order of players remains consistent with the original order
		const adjustedOrder = Object.keys(game).sort((a, b) => game[b] - game[a]);
		if (JSON.stringify(originalOrder) !== JSON.stringify(adjustedOrder)) {
			console.warn(`Order changed in game ${index + 1}:`, {
				originalOrder,
				adjustedOrder,
			});
		}
	});

	fs.writeFileSync("./fixed.json", JSON.stringify(games, null, 2), "utf8");
}

//add uma and rank
function adjust() {
	const raw = fs.readFileSync("./fixed.json", "utf8");

	const games = JSON.parse(raw);

	//make sure every game has sum of 100000
	games.forEach((game, index) => {
		let sum = Object.values(game).reduce((acc, score) => acc + score, 0);
		sum = Number(sum.toFixed(10));
		if (sum !== 100000) {
			console.warn(`Game ${index + 1} does not sum to 100000: ${sum}`);
		}
	});

	const uma = [15, 5, -5, -15];
	const starting_score = 25000;

	let adjustedGames = games.map((game) => {
		let playerNames = Object.keys(game);
		let players = [
			{
				id: playerNames[0],
				score: Number(game[playerNames[0]]),
				adj: Number(game[playerNames[0]]),
			},
			{
				id: playerNames[1],
				score: Number(game[playerNames[1]]),
				adj: Number(game[playerNames[1]]),
			},
			{
				id: playerNames[2],
				score: Number(game[playerNames[2]]),
				adj: Number(game[playerNames[2]]),
			},
			{
				id: playerNames[3],
				score: Number(game[playerNames[3]]),
				adj: Number(game[playerNames[3]]),
			},
		];

		players.sort((a, b) => b.score - a.score);
		players.forEach((player, index) => {
			player.rank = index + 1; // Assign ranks based on sorted order
			player.adj = player.score; // Initialize adjusted score to raw score
		});

		//allocating uma, splitting if needed (big brain technique used ngl)
		for (let i = 0; i < players.length; i++) {
			let currentUma = uma[i];
			let tiedCount = 1;
			for (let j = i + 1; j < players.length; j++) {
				if (players[j].score == players[i].score) {
					currentUma += uma[j];
					tiedCount++;
				} else {
					break;
				}
			}
			for (let j = 0; j < tiedCount; j++) {
				players[i + j].adj += (currentUma * 1000) / tiedCount;
			}
			i += tiedCount - 1; // skip over tied players
		}

		// subtract starting score from adjusted scores
		players.forEach((player) => {
			player.adj -= starting_score;
		});
		return players;
	});

	console.log(adjustedGames);

	fs.writeFileSync("./adjusted.json", JSON.stringify(adjustedGames, null, 2), "utf8");
}

//converts the rawRanks.txt file to a rank object json
function rawToRank() {
	const lines = fs.readFileSync("./rawRanks.txt", "utf8")
		.split(/\r?\n/)
		.filter((line) => line.trim().length);

	const rankPattern = /^[A-Za-z]+\d+$/; // e.g. "E3", "M2", but NOT "5" or "123"

	const result = {};

	for (let line of lines) {
		const [rawName, rawVal] = line.split(":").map((s) => s.trim());
		if (!rawName || !rawVal) continue;

		if (rankPattern.test(rawVal)) {
			result[rawName] = rawVal;
		}
	}
	fs.writeFileSync("./ranks.json", JSON.stringify(result, null, 2), "utf8");
}

//filter()
//clean()
//convert()
//fix()
//adjust();
rawToRank();