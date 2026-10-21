"use client";

import { Component, type ComponentType, type ReactNode, Suspense, lazy, useState } from "react";

import type { BoundCopy } from "@/lib/screening/copy";

import styles from "./guide.module.css";

/**
 * Keeps a failure inside one guidance layer: the layer says that something did not load and offers Retry, and the
 * workspace under it carries on. A download that failed is the usual cause; Retry calls `onRetry`, then renders the
 * layer again.
 */
export class GuidanceBoundary extends Component<
  { copy: BoundCopy; onRetry?: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const { LAYOUT } = this.props.copy;
    return (
      <div className={styles.boundary} role="alert" data-guidance="">
        <p>{LAYOUT.loadFailed}</p>
        <button
          type="button"
          onClick={() => {
            this.props.onRetry?.();
            this.setState({ failed: false });
          }}
        >
          {LAYOUT.retry}
        </button>
      </div>
    );
  }
}

/**
 * A guidance layer whose code downloads the first time it opens. A failed download shows the boundary's Retry, and
 * Retry asks for the code again with a fresh `import()`: a lazy component keeps a failed load for good, so each try
 * gets a new one.
 */
export function LazyLayer<P extends object>({
  load,
  loading,
  copy,
  props,
}: {
  load: () => Promise<{ default: ComponentType<P> }>;
  loading: ReactNode;
  copy: BoundCopy;
  props: P;
}) {
  const [Layer, setLayer] = useState(() => lazy(load));
  return (
    <GuidanceBoundary copy={copy} onRetry={() => setLayer(() => lazy(load))}>
      <Suspense fallback={loading}>
        <Layer {...props} />
      </Suspense>
    </GuidanceBoundary>
  );
}
