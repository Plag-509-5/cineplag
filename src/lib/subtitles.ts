export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export function parseSrtTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const normalized = timeStr.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    const minutes = parseFloat(parts[0]) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return parseFloat(timeStr) || 0;
}

export function parseSrt(srtContent: string): SubtitleCue[] {
  if (!srtContent) return [];
  const normalized = srtContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const blocks = normalized.split(/\n\n+/);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    const lines = block.split("\n");
    if (lines.length < 2) continue;

    // Time line is usually line 1 (or line 0 if no index number)
    let timeLineIndex = lines[0].includes("-->") ? 0 : 1;
    if (!lines[timeLineIndex] || !lines[timeLineIndex].includes("-->")) {
      timeLineIndex = lines.findIndex((l) => l.includes("-->"));
      if (timeLineIndex === -1) continue;
    }

    const timeLine = lines[timeLineIndex];
    const [startRaw, endRaw] = timeLine.split("-->").map((s) => s.trim());
    const start = parseSrtTimeToSeconds(startRaw);
    const end = parseSrtTimeToSeconds(endRaw);

    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines
      .join("\n")
      .replace(/<[^>]*>/g, "") // strip html formatting tags
      .trim();

    if (text && end > start) {
      cues.push({
        id: `cue-${i}`,
        start,
        end,
        text,
      });
    }
  }

  return cues;
}
