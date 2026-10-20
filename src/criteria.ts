/**
 * Mastery and test criteria.
 * Training default is 17/18 (Arntzen & Lian, 2010).
 * Jon's test rule is the first integer strictly above 95% of N (plan G3).
 * The literature test rule reported alongside it is 17/18 of N.
 */

export function requiredCorrect(blockSize: number, numerator: number, denominator: number): number {
  if (blockSize <= 0) return 0;
  if (denominator <= 0) throw new Error('Nevneren i mestringskriteriet må være større enn 0.');
  return Math.ceil((blockSize * numerator) / denominator);
}

export function meetsMastery(
  correct: number,
  blockSize: number,
  numerator: number,
  denominator: number,
): boolean {
  return correct >= requiredCorrect(blockSize, numerator, denominator);
}

/** First integer strictly above 0.95 × N. */
export function jonTestRequired(n: number): number {
  if (n <= 0) return 0;
  return Math.floor(n * 0.95) + 1;
}

/** Smallest k with k/N ≥ 17/18. */
export function literatureRequired(n: number): number {
  if (n <= 0) return 0;
  return Math.ceil((n * 17) / 18);
}

/**
 * How many trials in a block receive programmed positive feedback.
 * 75% of 18 is 13.5 and rounds to 14. 0% and 100% are exact.
 */
export function feedbackCount(blockSize: number, percent: number): number {
  if (blockSize <= 0 || percent <= 0) return 0;
  if (percent >= 100) return blockSize;
  return Math.round((blockSize * percent) / 100);
}

export function formatRatio(correct: number, total: number): string {
  if (total <= 0) return '0/0';
  const pct = (correct / total) * 100;
  const rounded = Math.round(pct * 10) / 10;
  return `${correct}/${total} (${rounded} %)`;
}
