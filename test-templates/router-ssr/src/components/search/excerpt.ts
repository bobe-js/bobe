interface CompactExcerptOptions {
  lead?: number;
  maxLength?: number;
}

const DEFAULT_LEAD = 10;
const DEFAULT_MAX_LENGTH = 160;
const MARK_PATTERN = /<mark\b[^>]*>/i;

export function compactSearchExcerptHtml(html: string, options: CompactExcerptOptions = {}) {
  const input = html?.trim() || '';
  if (!input) return '';

  const mark = MARK_PATTERN.exec(input);
  const lead = Math.max(0, Math.floor(options.lead ?? DEFAULT_LEAD));
  const start = mark?.index == null ? 0 : Math.max(0, mark.index - lead);
  const maxLength = Math.max(1, Math.floor(options.maxLength ?? DEFAULT_MAX_LENGTH));
  const end = Math.min(input.length, start + maxLength);

  return `${start > 0 ? '...' : ''}${input.slice(start, end)}${end < input.length ? '...' : ''}`;
}
