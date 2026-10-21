"use client";

import { Component, type ReactNode } from "react";

import type { BoundCopy } from "@/lib/screening/copy";

import styles from "./guide.module.css";

/**
 * Keeps a failure inside one guidance layer: the layer says that something did not load and offers Retry, and the
 * workspace under it carries on. A download that failed is the usual cause; Retry renders the layer again.
 */
export class GuidanceBoundary extends Component<
  { copy: BoundCopy; children: ReactNode },
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
        <button type="button" onClick={() => this.setState({ failed: false })}>
          {LAYOUT.retry}
        </button>
      </div>
    );
  }
}
