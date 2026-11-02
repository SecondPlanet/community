/**
 * cn — className 拼接小工具
 *
 * 避免装 clsx,够用即可。规则:
 *   - 跳过 falsy:false / null / undefined / ''
 *   - 数字保留(react 会忽略 key warning)
 *   - 不去重(留给你自己排)
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>;

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i && i !== 0) continue;
    if (typeof i === 'string' || typeof i === 'number') {
      out.push(String(i));
    } else if (typeof i === 'object') {
      for (const [k, v] of Object.entries(i)) {
        if (v) out.push(k);
      }
    }
  }
  return out.join(' ');
}
