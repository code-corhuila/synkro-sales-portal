// Defends the generated workbook against formula injection: a cell that
// starts with one of these characters can be read as the start of a formula
// by some spreadsheet application. A leading apostrophe forces the cell to
// stay literal text, the same mitigation CSV exports use. Applied as defence
// in depth: this code never constructs an ExcelJS `{ formula: ... }` cell,
// and a genuine xlsx string cell is not executed as a formula the way an
// untyped CSV cell can be, but the written value is sanitized regardless.
const FORMULA_PREFIX = /^[=+\-@\t\r]/

export function safeText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value
}
