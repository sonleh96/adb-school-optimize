export const SCORE_LEGEND_STOPS = [
  { label: "Low", color: "#0f3d8a" },
  { label: "Lower middle", color: "#4f7fc6" },
  { label: "Midpoint", color: "#9bb8e8" },
  { label: "Upper middle", color: "#f0b57a" },
  { label: "High", color: "#b8611b" },
] as const;

export function scoreToColor(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "#94a3b8";
  if (value >= 0.8) return "#b8611b";
  if (value >= 0.6) return "#f0b57a";
  if (value >= 0.4) return "#9bb8e8";
  if (value >= 0.2) return "#4f7fc6";
  return "#0f3d8a";
}

export function scoreToPillStyle(value?: number | null): { background: string; color: string; borderColor: string } {
  const color = scoreToColor(value);
  return {
    background: `${color}26`,
    color: value != null && !Number.isNaN(value) && value >= 0.4 && value < 0.8 ? "#1f2937" : color,
    borderColor: `${color}4d`,
  };
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
