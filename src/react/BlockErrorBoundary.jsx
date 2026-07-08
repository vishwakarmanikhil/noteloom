import { Component, Fragment } from 'react';

/**
 * Wraps a single block's rendered output so that a crash in one block (e.g.
 * a contentEditable/DOM desync throwing during React's commit phase) can't
 * take the whole document down with it — without this, an uncaught error
 * from any single block unmounts the entire root, blanking the page for a
 * problem that only ever affected one paragraph.
 *
 * Recovery is a full remount, not a permanent fallback message: the DOM
 * subtree that threw may be in a state React no longer trusts, so the only
 * sound way back is to throw it away and rebuild fresh from the current
 * store state, which is unaffected (the store is a separate source of
 * truth from the DOM). Bumping `nonce` and keying a Fragment on it forces
 * exactly that remount with zero extra DOM nodes. Recovery happens on the
 * next microtask so React finishes unwinding the failed commit first.
 */
export class BlockErrorBoundary extends Component {
  state = { hasError: false, nonce: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.error('[block-editor] a block failed to render; recovering by remounting it:', error, info);
    }
    this.props.onError?.(error, info);
    queueMicrotask(() => this.setState((s) => ({ hasError: false, nonce: s.nonce + 1 })));
  }

  render() {
    if (this.state.hasError) return null; // one brief frame while recovery is queued
    return <Fragment key={this.state.nonce}>{this.props.children}</Fragment>;
  }
}
