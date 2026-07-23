import { useCallback, useMemo, useState } from "react";
import { PanResponder, type GestureResponderHandlers } from "react-native";

export type SessionPanelSize = "collapsed" | "standard" | "expanded";

const ORDER: SessionPanelSize[] = ["collapsed", "standard", "expanded"];
const SWIPE_DISTANCE = 28;
const SWIPE_VELOCITY = 0.45;

interface SessionPanelControls {
  panelSize: SessionPanelSize;
  panelGestureHandlers: GestureResponderHandlers;
  setPanelSize: (size: SessionPanelSize) => void;
  expandPanel: () => void;
  shrinkPanel: () => void;
  togglePanel: () => void;
}

/** Three-position controller shared by the online and offline session trays. */
export function useSessionPanel(): SessionPanelControls {
  const [panelSize, setPanelSize] = useState<SessionPanelSize>("standard");

  const movePanel = useCallback(
    (direction: -1 | 1) => {
      const index = ORDER.indexOf(panelSize);
      const next = ORDER[Math.max(0, Math.min(ORDER.length - 1, index + direction))];
      setPanelSize(next);
    },
    [panelSize],
  );

  const expandPanel = useCallback(() => movePanel(1), [movePanel]);
  const shrinkPanel = useCallback(() => movePanel(-1), [movePanel]);
  const togglePanel = useCallback(() => {
    setPanelSize(panelSize === "expanded" ? "standard" : "expanded");
  }, [panelSize]);

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy <= -SWIPE_DISTANCE || gesture.vy <= -SWIPE_VELOCITY) {
          movePanel(1);
        } else if (gesture.dy >= SWIPE_DISTANCE || gesture.vy >= SWIPE_VELOCITY) {
          movePanel(-1);
        }
      },
      onPanResponderTerminationRequest: () => true,
    }),
    [movePanel],
  );

  return {
    panelSize,
    panelGestureHandlers: panResponder.panHandlers,
    setPanelSize,
    expandPanel,
    shrinkPanel,
    togglePanel,
  };
}
