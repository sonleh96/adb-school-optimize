export function scoreToColor(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "#94a3b8";
  if (value >= 0.75) return "#b42318";
  if (value >= 0.6) return "#d97706";
  if (value >= 0.45) return "#0f766e";
  return "#3b82f6";
}

export function scaleValue(value: number | null | undefined, min: number, max: number): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (min === max) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function choroplethColor(normalized: number): string {
  const clamped = Math.max(0, Math.min(1, normalized));
  if (clamped > 0.85) return "#6f1d1b";
  if (clamped > 0.65) return "#bb3e03";
  if (clamped > 0.45) return "#ca6702";
  if (clamped > 0.25) return "#0a9396";
  return "#94d2bd";
}
