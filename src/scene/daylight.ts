/**
 * How "night" it is at local time `date`, from 0 (full day) to 1 (full night),
 * with an hour-and-a-half dawn (05:00-06:30) and dusk (17:30-19:00).
 */
export function nightFactor(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const ramp = (from: number, to: number) => Math.min(1, Math.max(0, (h - from) / (to - from)));
  if (h < 12) return 1 - ramp(5, 6.5);
  return ramp(17.5, 19);
}
