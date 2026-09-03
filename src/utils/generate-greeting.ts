/** 時刻に応じた挨拶（Phase 1 仕様 §6）。副作用のない純粋関数。 */
export function generateGreeting(hour: number = new Date().getHours()): string {
  if (hour < 4) return "おつかれさまです";
  if (hour < 11) return "おはようございます";
  if (hour < 18) return "こんにちは";
  return "こんばんは";
}
