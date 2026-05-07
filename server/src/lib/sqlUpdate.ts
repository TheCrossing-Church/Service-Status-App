// Build a SET clause from a partial update payload.
// Fields whose value is `undefined` are skipped (i.e. the column is not
// touched). `null` is preserved and used to explicitly clear the column.
export function buildUpdateSet(
  fields: Record<string, unknown>,
  startIndex = 1,
): { setClause: string; params: unknown[]; touched: boolean } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key} = $${i++}`);
    params.push(value);
  }
  return {
    setClause: parts.join(", "),
    params,
    touched: parts.length > 0,
  };
}
