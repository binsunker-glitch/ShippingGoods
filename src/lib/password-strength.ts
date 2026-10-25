/** Lightweight, purely client-side password strength indicator. */
export function passwordStrength(plain: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  let score = 0;
  if (plain.length >= 10) score += 1;
  if (plain.length >= 14) score += 1;
  if (/[A-Z]/.test(plain) && /[a-z]/.test(plain)) score += 1;
  if (/\d/.test(plain) && /[^\w\s]/.test(plain)) score += 1;

  const labels = ["ضعيفة جداً", "ضعيفة", "متوسطة", "جيدة", "قوية"];
  const bounded = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { score: bounded, label: labels[bounded] };
}
