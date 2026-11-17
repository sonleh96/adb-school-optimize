/**
 * The homepage's small drawings, one beside each of the three notes on how the list is made, in the tool's own mark
 * language (lib/screening/marks.ts): the ringed mark for a range of ranks, the navy of the marks, the paper inside
 * them. Each pictures what its note already says, so each is hidden from screen readers and holds no words.
 */
import { MAIN_SHARES } from "@/lib/home/copy";
import { MARK_PAPER_HEX, RAMP_HEX, RANGE_RING_HEX } from "@/lib/screening/marks";

const NAVY = RAMP_HEX[0];
const NAVY_2 = RAMP_HEX[2];
const LIGHT = "#7f9fd2";
const TRACK = "#d9dee8";

interface MotifProps {
  className?: string;
}

/** The ringed mark of a range of ranks. */
function RangeRing({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={MARK_PAPER_HEX} stroke={RANGE_RING_HEX} strokeWidth={2} />
      <circle cx={x} cy={y} r={3} fill={RANGE_RING_HEX} />
    </g>
  );
}

/** A missing figure as a range: the ringed mark between the highest and the lowest rank the school could take. */
export function RangeMotif({ className }: MotifProps) {
  return (
    <svg className={className} viewBox="0 0 160 40" aria-hidden="true" focusable="false">
      <path d="M8,20H152" stroke={TRACK} strokeWidth={2} strokeLinecap="round" />
      <path d="M44,20H116" stroke={NAVY_2} strokeWidth={6} strokeLinecap="round" opacity={0.35} />
      <path d="M44,10V30M116,10V30" stroke={NAVY} strokeWidth={2} strokeLinecap="round" />
      <RangeRing x={80} y={20} />
    </svg>
  );
}

/**
 * The main list's parts as blocks as wide as their weights (school need, district context, the four smaller parts),
 * and the urgency rating set apart in a dashed outline: left out.
 */
export function LeftOutMotif({ className }: MotifProps) {
  const span = 112;
  const gap = 2;
  const shares = Object.values(MAIN_SHARES);
  const blocks = shares.map((share, i) => {
    const x = 8 + shares.slice(0, i).reduce((sum, s) => sum + s * span + gap, 0);
    return { x, width: share * span, fill: i === 0 ? NAVY : i === 1 ? NAVY_2 : LIGHT };
  });
  return (
    <svg className={className} viewBox="0 0 160 40" aria-hidden="true" focusable="false">
      {blocks.map((b) => (
        <rect key={b.x} x={b.x} y={13} width={b.width} height={14} rx={2.5} fill={b.fill} />
      ))}
      <rect
        x={134}
        y={13}
        width={18}
        height={14}
        rx={2.5}
        fill="none"
        stroke={RANGE_RING_HEX}
        strokeWidth={1.5}
        strokeDasharray="3 2.5"
      />
    </svg>
  );
}

/** Four runs in five: four filled marks and one open, for schools that stayed in the top 20 in most runs. */
export function RunsMotif({ className }: MotifProps) {
  return (
    <svg className={className} viewBox="0 0 160 40" aria-hidden="true" focusable="false">
      {[0, 1, 2, 3, 4].map((i) => (
        <rect
          key={i}
          x={9 + i * 29}
          y={9}
          width={22}
          height={22}
          rx={6}
          fill={i < 4 ? NAVY : MARK_PAPER_HEX}
          stroke={i < 4 ? NAVY : RANGE_RING_HEX}
          strokeWidth={1.5}
          strokeDasharray={i < 4 ? undefined : "3 3"}
        />
      ))}
    </svg>
  );
}
