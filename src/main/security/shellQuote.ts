/**
 * POSIX single-quote a shell argument. Wraps the value in single quotes and
 * escapes any embedded single quote as `'\''`, so it is always safe to
 * splice into a `sh -c` string regardless of content (tech.md section 5.3).
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
