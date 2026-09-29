export interface ChapterData {
  title: string;
  start: number;
  end?: number;
}

export function parseSidecar(value: unknown): ChapterData[] {
  const rows = Array.isArray(value) ? value : typeof value === "object" && value !== null && "chapters" in value ? (value as { chapters: unknown }).chapters : null;
  if (!Array.isArray(rows)) throw new Error("Chapter sidecar must be a JSON array or an object with a chapters array.");
  return rows.map((row, index) => {
    if (typeof row !== "object" || row === null) throw new Error(`Invalid chapter entry ${index + 1}.`);
    const chapter = row as Record<string, unknown>;
    const title = typeof chapter.title === "string" ? chapter.title : typeof chapter.name === "string" ? chapter.name : `Chapter ${index + 1}`;
    const startValue = chapter.start ?? chapter.startTime ?? chapter.startSeconds;
    const endValue = chapter.end ?? chapter.endTime ?? chapter.endSeconds;
    const start = typeof startValue === "number" ? startValue : Number(startValue);
    const end = endValue == null ? undefined : typeof endValue === "number" ? endValue : Number(endValue);
    if (!Number.isFinite(start) || start < 0 || (end !== undefined && (!Number.isFinite(end) || end <= start))) {
      throw new Error(`Invalid start/end time for chapter ${index + 1}.`);
    }
    return { title, start, ...(end === undefined ? {} : { end }) };
  }).sort((a, b) => a.start - b.start);
}
