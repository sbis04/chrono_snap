export const MAX_POINTS = 5000;
export const DECAY = 0.15;

/** Points = max(0, floor(5000 · e^(−0.15 · |actual − guess|))) */
export function scoreGuess(actualYear: number, guessedYear: number): number {
  const delta = Math.abs(actualYear - guessedYear);
  return Math.max(0, Math.floor(MAX_POINTS * Math.exp(-DECAY * delta)));
}
