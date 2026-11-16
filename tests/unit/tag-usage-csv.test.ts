import { describe, expect, it } from "vitest";
import { csvCell, tagUsageCSV } from "../../src/lib/tag-usage-csv";
describe("spreadsheet-safe complete tag usage CSV", () => {
  it("quotes unicode, multiline and embedded quote content", () => {
    expect(csvCell('雪, "title"\r\nline')).toBe('"雪, ""title""\r\nline"');
  });
  it("neutralizes formula prefixes even behind whitespace and invisible controls", () => {
    for (const prefix of [
      "",
      " ",
      "\t",
      "\r\n",
      "\u0000\u001f",
      "\u0085",
      "\ufeff",
      "\u200b",
    ]) {
      for (const formula of ["=1+1", "+cmd", "-1", "@SUM(A1)"])
        expect(csvCell(prefix + formula)).toBe("\"'" + prefix + formula + '"');
    }
    expect(csvCell("ordinary - text")).toBe('"ordinary - text"');
  });
  it("keeps the capture and review identity for an unused definition", () => {
    const csv = tagUsageCSV({
      tagId: "original",
      tagName: "Unused",
      tagRevision: 1,
      capturedAt: "2030-01-01T00:00:00Z",
      impactDigest: "a".repeat(64),
      rows: [],
      activeCount: 0,
      trashCount: 0,
    });
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain(
      '"' + "a".repeat(64) + '","2030-01-01T00:00:00Z","original","Unused"',
    );
  });
});
