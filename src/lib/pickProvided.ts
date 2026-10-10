// Zod's .partial() still applies a field's .default() when the field is
// absent, so a partial update schema built from an insert schema would write
// those defaults on every update (e.g. reset a member's stage to 'Newbie' when
// only the photo changed). Keep only the keys the caller actually sent.

export function pickProvided<T extends Record<string, unknown>>(
  parsed: T,
  input: object,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(input, key)),
  ) as Partial<T>
}
