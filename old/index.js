const { readFile, writeFile } = require("fs/promises");

const BASE_RATING = 1500;

/*
Tenhou's Elo Rating System:

multiplier = max(1 - 0.002 * (number of games), 0.2)
bonus = [15,5,-5,-15]
adjustment = (max(1500,table average rating) - player's rating) / 40
change = multiplier * (bonus + adjustment)

*/
( async () => {
    const raw = await readFile("./original.json", "utf8");
    const data = JSON.parse(raw);

    
})();