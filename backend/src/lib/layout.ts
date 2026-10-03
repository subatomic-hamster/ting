// Textract returns each table cell as its own LINE. The treatment-plan parser wants one row per line, so
// lines whose vertical centers overlap are joined left to right.

export interface PlacedLine {
  text: string;
  top: number;
  left: number;
  height: number;
}

export function rowsToText(lines: PlacedLine[]): string {
  const sorted = [...lines].sort((a, b) => a.top + a.height / 2 - (b.top + b.height / 2));
  const rows: { center: number; height: number; cells: PlacedLine[] }[] = [];
  for (const line of sorted) {
    const center = line.top + line.height / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(center - row.center) < Math.min(row.height, line.height) / 2) {
      row.cells.push(line);
      row.center = row.cells.reduce((s, c) => s + c.top + c.height / 2, 0) / row.cells.length;
    } else {
      rows.push({ center, height: line.height, cells: [line] });
    }
  }
  return rows.map((r) => r.cells.sort((a, b) => a.left - b.left).map((c) => c.text).join('   ')).join('\n');
}
