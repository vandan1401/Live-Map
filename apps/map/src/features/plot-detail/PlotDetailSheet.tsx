import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { motion, useDragControls, type PanInfo } from "framer-motion";
import { loadPlotDetail, type PlotDetail } from "../../lib/colony/plotDetail.ts";
import { applyPlotTransition } from "../../lib/plot-status/applyPlotTransition.ts";
import { fetchPlotHistory } from "../../lib/db/plotHistory.ts";
import type { PlotStatus } from "../../lib/db/types.ts";
import { PlotDetailContent } from "./PlotDetailContent.tsx";
import { PlotStatusActions } from "./PlotStatusActions.tsx";

interface Props {
  client: SupabaseClient | null;
  colonyId: string;
  svgId: string;
  onDismiss: () => void;
  // Lets ColonyMap update the SVG's data-status attribute (D-004: status is a DOM
  // attribute, never written into the SVG file itself) the moment a write succeeds,
  // without re-fetching every plot's status.
  onPlotStatusChange: (svgId: string, newStatus: PlotStatus) => void;
  // Threaded down from App.tsx's non-null state, not read from localStorage here — a
  // `?? "unknown"` fallback would let a write be attributed to nobody, and D-016/
  // tier-1.md are explicit that a forged/placeholder actor turns plot_history's evidence
  // into a claim (this was a real /review finding, not a hypothetical).
  actor: string;
}

// Drag distance (px) past which a release counts as a deliberate gesture rather than
// a bounce — tuned for a thumb drag on a phone, not a mouse.
const DRAG_THRESHOLD = 80;
// Below DRAG_THRESHOLD but past this, a downward release still counts as "collapse" —
// otherwise a small downward wobble while expanded leaves the sheet stuck open.
const COLLAPSE_THRESHOLD = 20;

export function PlotDetailSheet({
  client,
  colonyId,
  svgId,
  onDismiss,
  onPlotStatusChange,
  actor,
}: Props) {
  const [detail, setDetail] = useState<PlotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Drag starts only from the handle (dragListener={false} + onPointerDown below) —
  // otherwise the drag gesture on the whole sheet swallows a finger-scroll over the
  // field list, and content taller than the collapsed 42% becomes unreachable on a
  // phone, the actual target device (spec/03).
  const dragControls = useDragControls();
  // Framer Motion doesn't suppress the native click that follows a drag release, and
  // the handle is both the drag initiator and the expand/collapse toggle — without
  // this, a mouse drag past DRAG_THRESHOLD sets `expanded` and the trailing click on
  // the same handle immediately flips it back.
  const didDrag = useRef(false);

  useEffect(() => {
    setDetail(null);
    setError(null);
    setExpanded(false);
    setConflictMessage(null);
    if (!client) {
      setError("Not connected to the database.");
      return;
    }
    let cancelled = false;
    loadPlotDetail(client, colonyId, svgId)
      .then((result) => {
        if (cancelled) return;
        if (result) setDetail(result);
        else setError("This plot has no data yet.");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load this plot.");
      });
    return () => {
      cancelled = true;
    };
  }, [client, colonyId, svgId]);

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    didDrag.current = true;
    if (info.offset.y > DRAG_THRESHOLD) {
      onDismiss();
    } else if (info.offset.y < -DRAG_THRESHOLD) {
      setExpanded(true);
    } else if (info.offset.y > COLLAPSE_THRESHOLD) {
      setExpanded(false);
    }
  };

  const handleToggleClick = () => {
    if (didDrag.current) {
      didDrag.current = false;
      return;
    }
    setExpanded((value) => !value);
  };

  const handleChangeStatus = async (toStatus: PlotStatus) => {
    if (!client || !detail) return;
    setSaving(true);
    setConflictMessage(null);
    try {
      const result = await applyPlotTransition(client, {
        plotId: detail.plot.id,
        fromStatus: detail.plot.status,
        toStatus,
        expectedVersion: detail.plot.version,
        actor,
      });
      if (result.ok) {
        const history = await fetchPlotHistory(client, detail.plot.id);
        setDetail({ plot: result.plot, history });
        onPlotStatusChange(svgId, result.plot.status);
      } else if (result.reason === "conflict") {
        setConflictMessage(`${result.winnerName} changed this — refresh to see the latest.`);
      } else {
        // illegal_transition — PlotStatusActions only offers legal next statuses and
        // gates Undo the same way, so this is an unexpected mismatch, not a user error.
        setError("That change is no longer valid — refresh and try again.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save this change.");
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = () => {
    if (!detail || detail.history.length < 2) return;
    void handleChangeStatus(detail.history[1].status);
  };

  const handleRefresh = () => {
    if (!client) return;
    setConflictMessage(null);
    loadPlotDetail(client, colonyId, svgId)
      .then((result) => {
        if (result) setDetail(result);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Could not refresh this plot.");
      });
  };

  return (
    <motion.div
      className={`plot-detail-sheet ${expanded ? "is-expanded" : ""}`}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 32, stiffness: 320 }}
    >
      <button
        type="button"
        className="plot-detail-sheet-handle"
        aria-label={expanded ? "Collapse plot details" : "Expand plot details"}
        onClick={handleToggleClick}
        onPointerDown={(event) => dragControls.start(event)}
      />
      {error && <p className="plot-detail-error">{error}</p>}
      {!error && !detail && <p className="plot-detail-loading">Loading…</p>}
      {conflictMessage && (
        <p className="plot-detail-conflict">
          {conflictMessage}{" "}
          <button type="button" className="plot-detail-refresh" onClick={handleRefresh}>
            Refresh
          </button>
        </p>
      )}
      {detail && (
        <>
          <PlotDetailContent {...detail} />
          <PlotStatusActions
            plot={detail.plot}
            history={detail.history}
            actor={actor}
            saving={saving}
            onChangeStatus={(status) => void handleChangeStatus(status)}
            onUndo={handleUndo}
          />
        </>
      )}
    </motion.div>
  );
}
