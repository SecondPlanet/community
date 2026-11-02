/**
 * RAG 检索工具: 分词.
 *
 * 策略:
 * - 中文字符拆 char / 2-char bigram, 英文按 word 切 (小写化)
 * - 过滤长度 < 2 的 token (避免 "的 / 是 / a / I" 之类噪声)
 * - 最多 5 个 token
 *
 * MySQL 8 默认 collation 是 utf8mb4_0900_ai_ci, Prisma `contains` 自带 case-insensitive,
 * 不需要再 wrap LOWER(). 任务里的 "ILIKE" 指概念上的 case-insensitive match, 这里用
 * Prisma `contains` 等价实现.
 */

export function tokenize(input: string): string[] {
  if (!input) return [];
  const cleaned = input
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

  const tokens: string[] = [];
  // 1) 英文 word: 连续 a-z 0-9
  const enMatches = cleaned.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const w of enMatches) tokens.push(w);
  // 2) 中文: 拆 2+ 连续 CJK
  const zhMatches = cleaned.match(/[一-鿿]{2,}/g) ?? [];
  for (const seg of zhMatches) {
    if (seg.length === 2 || seg.length === 3) {
      // 短: 整体保留 (长度 >= 2, 不被过滤)
      tokens.push(seg);
    } else if (seg.length === 4) {
      // 4 字: 整体 + 2 字 bigram, 提升子串命中
      tokens.push(seg);
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    } else {
      // 长串只拆 bigram, 避免 token 过多
      for (let i = 0; i < seg.length - 1; i++) {
        tokens.push(seg.slice(i, i + 2));
      }
    }
  }
  // 3) 去重保序, 过滤长度 < 2
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.slice(0, 5);
}
