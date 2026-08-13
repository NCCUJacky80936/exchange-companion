import assert from "node:assert/strict";
import test from "node:test";
import { limitSidebarNote, notebookCharacterCount, SIDEBAR_NOTE_LIMIT } from "../app/lib/personalization";

test("limits a completed Chinese notebook note to 27 characters", () => {
  const value = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十";
  const limited = limitSidebarNote(value);
  assert.equal(notebookCharacterCount(limited), SIDEBAR_NOTE_LIMIT);
  assert.equal(limited, Array.from(value).slice(0, 27).join(""));
});

test("counts a surrogate-pair emoji as one visible character", () => {
  assert.equal(notebookCharacterCount("交換出發😀"), 5);
});
