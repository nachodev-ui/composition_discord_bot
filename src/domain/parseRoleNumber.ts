const MAX_ROLE_NUMBER_DIGITS = 3;

export function parseRoleNumber(content: string): number | null {
  const trimmed = content.trim();
  const pattern = new RegExp(`^\\d{1,${MAX_ROLE_NUMBER_DIGITS}}$`);

  if (!pattern.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
