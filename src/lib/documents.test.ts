import { describe, expect, it } from "vitest";
import { chunkText, normalizeDocumentText } from "@/lib/documents";

describe("chunkText", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkText(" \n  ")).toEqual([]);
  });

  it("normalizes whitespace and keeps chunk sizes bounded", () => {
    const chunks = chunkText("alpha   beta\n gamma delta", 12, 3);
    expect(chunks.map(({ content }) => content)).toEqual(["alpha beta", "eta gamma", "mma delta"]);
    expect(chunks.every(({ content }) => content.length <= 12)).toBe(true);
    expect(chunks.map(({ index }) => index)).toEqual([0, 1, 2]);
  });

  it("rejects invalid overlap values", () => {
    expect(() => chunkText("text", 10, 10)).toThrow(RangeError);
  });
});

describe("normalizeDocumentText", () => {
  it("removes null bytes and normalizes line endings", () => {
    expect(normalizeDocumentText(" one\r\ntwo\0 ")).toBe("one\ntwo");
  });
});