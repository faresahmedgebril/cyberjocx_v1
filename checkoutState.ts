export function isDebitSuccessful(affectedRows: number): boolean {
  return Number.isFinite(affectedRows) && affectedRows === 1;
}
