/**
 * Stream-friendly buffer for incremental reasoning ("thinking") deltas.
 *
 * Reasoning content arrives from the model as a sequence of chunks. The TUI
 * wants to render those chunks as a single live block, then commit the entire
 * block to the transcript exactly once when the model transitions to either
 * regular content output, a tool call, or end-of-turn. Without this batching
 * the transcript fills up with N tiny "thinking" panels per turn — what the
 * user reported as fragmented reasoning.
 *
 * `ThinkingBuffer` is a tiny state container that owns the in-flight string
 * and exposes:
 *   - `append(delta)`: accumulate a partial reasoning chunk
 *   - `peek()`: read the current accumulated text (for live UI rendering)
 *   - `flush()`: drain the buffer and return whatever was collected, ready to
 *     be committed to the transcript as a single message
 *
 * This module has no React or Ink dependencies, which makes it trivial to
 * unit-test deterministically.
 */
export class ThinkingBuffer {
  private buffer = '';

  append(delta: string): void {
    if (!delta) return;
    this.buffer += delta;
  }

  peek(): string {
    return this.buffer;
  }

  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  flush(): string | undefined {
    if (!this.buffer) return undefined;
    const out = this.buffer.trim();
    this.buffer = '';
    return out.length > 0 ? out : undefined;
  }
}
