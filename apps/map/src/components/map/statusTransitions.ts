// The 400ms status fade, which used to be one line of CSS (`transition: fill 400ms`) and
// now has to be driven by hand. spec/05 calls this "the moment a realtime change feels
// multiplayer rather than like a page reload" — it is worth the effort, so it survives the
// move to canvas rather than being quietly dropped.
//
// A bulk load must NOT animate. 675 plots arriving at once was 675 simultaneous
// transitions, which is exactly what colony-theme.css's .no-transition rule existed to
// suppress; here that is simply "do not register a transition for a bulk apply".
export const STATUS_TRANSITION_MS = 400;

// ease-out, matching the CSS rule this replaces.
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export class StatusTransitions {
  private readonly starts = new Map<string, number>();

  start(svgId: string, now: number): void {
    this.starts.set(svgId, now);
  }

  /** Progress per plot, 0..1. A plot with no entry is settled and is not included. */
  progress(now: number): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, started] of this.starts) {
      const t = (now - started) / STATUS_TRANSITION_MS;
      if (t >= 1) {
        this.starts.delete(id);
        continue;
      }
      out.set(id, easeOut(Math.max(t, 0)));
    }
    return out;
  }

  get active(): boolean {
    return this.starts.size > 0;
  }

  clear(): void {
    this.starts.clear();
  }
}
