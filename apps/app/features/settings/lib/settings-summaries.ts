export function usagePercentage(current: { creditsUsed: number; creditsLimit: number }) {
  return Math.min(
    100,
    Math.round((current.creditsUsed / Math.max(1, current.creditsLimit)) * 100),
  );
}
