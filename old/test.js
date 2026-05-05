let string = "@kev -2.4\n@yzsan 28.0\n@Ryan 38.0\n@階段降りれる空丸 38.4";

let obj = {};

string.split('\n')                                 // one line per player
    .forEach(line => {
      // Unicode-aware: capture name (no leading "@") and score (int or float)
      const match = line.match(/^@(.+?)\s+([+-]?\d+(?:\.\d+)?)/u);
      if (!match) return; // skip lines that don't match
      const [, rawName, rawScore] = match;
      const name  = rawName.trim();
      const score = rawScore.includes('.') 
        ? parseFloat(rawScore) 
        : parseInt(rawScore, 10);
      obj[name] = score;
    });

console.log(obj);