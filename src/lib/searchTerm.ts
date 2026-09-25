// User search text is interpolated into PostgREST filters such as
// `.or('name.ilike.%term%,email.ilike.%term%')`. Commas, parentheses and quotes
// would let the text add or break filter clauses, and % * \ are ilike pattern
// characters. Replace them with spaces so the text only ever matches literally.

export function toSafeSearchTerm(input: string): string {
  return input.replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim()
}
