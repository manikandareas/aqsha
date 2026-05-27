export function env(key: string) {
  const value = process.env[key]?.trim();
  return value || null;
}
