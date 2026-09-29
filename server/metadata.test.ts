import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenLibraryMetadata } from "./metadata.js";

test("parses Open Library book metadata and cover art", () => {
  assert.deepEqual(parseOpenLibraryMetadata({
    docs: [{
      title: "The Example Book",
      author_name: ["A. Author", 123, "B. Author"],
      first_publish_year: 1998,
      cover_i: 12345,
      subject: ["Fantasy", "Adventure"],
      description: { value: "A longer book description." },
      key: "/works/OL123W",
    }],
  }), {
    title: "The Example Book",
    authors: ["A. Author", "B. Author"],
    description: "A longer book description.",
    firstPublished: 1998,
    coverUrl: "https://covers.openlibrary.org/b/id/12345-L.jpg",
    sourceUrl: "https://openlibrary.org/works/OL123W",
    subjects: ["Fantasy", "Adventure"],
    source: "Open Library",
  });
});

test("uses the first sentence when a full description is unavailable", () => {
  assert.equal(parseOpenLibraryMetadata({ docs: [{ title: "A Book", first_sentence: ["It begins."] }] })?.description, "It begins.");
});

test("returns no metadata when Open Library has no matching result", () => {
  assert.equal(parseOpenLibraryMetadata({ docs: [] }), null);
});

test("rejects malformed Open Library responses", () => {
  assert.throws(() => parseOpenLibraryMetadata({}), /invalid search response/);
});
