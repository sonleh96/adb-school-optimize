/**
 * A rule's share of an input, as the method details write it beside the input: "0.60" when two decimals are exact,
 * otherwise the fraction the API states ("12/19"), so no share is shown rounded.
 */
export interface Share {
  readonly component: string;
  readonly fraction: string;
  readonly value: number;
}

export function shareText(share: Share): string {
  const hundredths = share.value * 100;
  return Math.abs(hundredths - Math.round(hundredths)) < 1e-9 ? share.value.toFixed(2) : share.fraction;
}

/** The shares as one line: "N 0.60 · A 0.15 · ...". */
export const sharesLine = (shares: readonly Share[]): string =>
  shares.map((s) => `${s.component} ${shareText(s)}`).join(" · ");
