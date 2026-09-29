import assert from "node:assert/strict";
import test from "node:test";
import { parseSidecar } from "./chapters.js";

test("parses and sorts sidecar chapter entries", () => {
  assert.deepEqual(parseSidecar([
    { title: "Second", start: 12, end: 20 },
    { name: "Opening", startSeconds: 0, endSeconds: 12 },
  ]), [
    { title: "Opening", start: 0, end: 12 },
    { title: "Second", start: 12, end: 20 },
  ]);
});

test("accepts a chapters object and supplies a missing title", () => {
  assert.deepEqual(parseSidecar({ chapters: [{ startTime: "4.5" }] }), [
    { title: "Chapter 1", start: 4.5 },
  ]);
});

test("rejects malformed chapter data", () => {
  assert.throws(() => parseSidecar({ chapters: "invalid" }), /must be a JSON array/);
  assert.throws(() => parseSidecar([{ title: "Bad", start: -1 }]), /Invalid start\/end time/);
  assert.throws(() => parseSidecar([{ title: "Bad", start: 8, end: 7 }]), /Invalid start\/end time/);
});
