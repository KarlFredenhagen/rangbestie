// Multiplayer-Elo fuer eine "Ringerl"-Runde (eine Platzierung mit N Spielern).
// Jeder Spieler wird virtuell gegen jeden anderen Teilnehmer der Runde verglichen:
// besserer Platz = "Sieg" (1), schlechterer Platz = "Niederlage" (0).
// Die Elo-Aenderung eines Spielers ist die Summe der Abweichungen zwischen
// tatsaechlichem und erwartetem Ergebnis ueber alle (N-1) virtuellen Duelle,
// bewusst OHNE Mittelung durch die Spielerzahl: wer unter mehr Mitspielern gewinnt,
// hat mehr virtuelle Duelle gewonnen und bekommt dadurch mehr Punkte als bei einer
// kleinen Runde. Bei nur 2 Spielern entspricht das exakt klassischem 1-gegen-1-Elo.
const DEFAULT_K = 16;

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// ranking: Array von Spieler-IDs, Index 0 = 1. Platz, Index 1 = 2. Platz, ...
// ratings: Map/Object von Spieler-ID -> aktuelles Elo
// Gibt eine Map von Spieler-ID -> { delta, newRating, expected, actual } zurueck.
function computeEloUpdates(ranking, ratings, kFactor = DEFAULT_K) {
  const rankIndex = new Map(ranking.map((id, idx) => [id, idx]));
  const results = new Map();

  for (const idA of ranking) {
    const ratingA = ratings[idA];
    let expected = 0;
    let actual = 0;

    for (const idB of ranking) {
      if (idA === idB) continue;
      const ratingB = ratings[idB];
      expected += expectedScore(ratingA, ratingB);
      actual += rankIndex.get(idA) < rankIndex.get(idB) ? 1 : 0;
    }

    const delta = kFactor * (actual - expected);
    const roundedDelta = Math.round(delta);
    results.set(idA, {
      delta: roundedDelta,
      newRating: ratingA + roundedDelta,
      expected,
      actual,
    });
  }

  return results;
}

module.exports = { computeEloUpdates, expectedScore, DEFAULT_K };
