import type { Snapshot } from '../src/data/types';

/** Something that produces snapshots: the demo generator now, the Hermes collector later. */
export interface StatusSource {
  snapshot(): Snapshot;
  /** Called whenever the snapshot changes. Returns an unsubscribe function. */
  onChange(listener: (snapshot: Snapshot) => void): () => void;
  start(): void;
  stop(): void;
}
