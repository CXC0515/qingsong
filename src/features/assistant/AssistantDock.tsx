import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ArrowLeft, GripVertical, PanelRightClose } from "lucide-react";
import AssistantPanel, { type AssistantEntry } from "./AssistantPanel";

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 400;
const storedPreference = (key: string) => {
  try {
    const value = Number(localStorage.getItem(key));
    if (value >= MIN_WIDTH && value <= 600) return { width: value, resized: true };
  } catch {
    // Storage is optional; retain the surface's default layout.
  }
  return { width: DEFAULT_WIDTH, resized: false };
};
/** One persistent iframe across teacher pages. Hiding the dock does not discard its draft. */
export default function AssistantDock({
  open,
  surface,
  pinned = false,
  entry,
  identityKey,
  onClose,
}: {
  open: boolean;
  surface: "workbench" | "task";
  pinned?: boolean;
  entry: AssistantEntry;
  identityKey: string;
  onClose: () => void;
}) {
  const dock = useRef<HTMLElement>(null);
  const storageKey = `qingsong:assistant-width:${identityKey}:${surface}`;
  const [preference, setPreference] = useState(() => ({
    key: storageKey,
    ...storedPreference(storageKey),
  }));
  // Derive the new surface's preference during render, without resizing/remounting the iframe.
  if (preference.key !== storageKey) {
    setPreference({ key: storageKey, ...storedPreference(storageKey) });
  }
  const { width, resized } = preference;
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    if (
      (closeButton.current?.closest(".qs-task-columns")?.clientWidth ?? 1000) <
      560
    )
      closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!open || pinned) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, pinned, onClose]);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) => Math.max(MIN_WIDTH, Math.min(600, value));
  const saveWidth = (value: number) => {
    const next = clamp(value);
    setPreference({ key: storageKey, width: next, resized: true });
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      /* Width is a preference, never a save prerequisite. */
    }
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current)
      saveWidth(drag.current.width + drag.current.x - event.clientX);
  };
  const stop = () => {
    drag.current = null;
  };
  const resizeKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next =
      event.key === "ArrowLeft"
        ? (dock.current?.getBoundingClientRect().width ?? width) + 24
        : event.key === "ArrowRight"
          ? (dock.current?.getBoundingClientRect().width ?? width) - 24
          : event.key === "Home"
            ? MIN_WIDTH
            : event.key === "End"
              ? 600
              : undefined;
    if (next !== undefined) {
      event.preventDefault();
      saveWidth(next);
    }
  };
  return (
    <aside
      ref={dock}
      data-resized={resized}
      id="qingsong-assistant-dock"
      className="qs-assistant-dock"
      hidden={!open}
      aria-label="AI 助手侧栏"
      style={
        (surface !== "workbench" || resized
          ? { "--qs-assistant-width": `${width}px` }
          : {}) as CSSProperties
      }
    >
      <button
        className="qs-assistant-resize"
        type="button"
        role="separator"
        aria-label="调整助手宽度"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={600}
        aria-valuenow={width}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width: dock.current?.getBoundingClientRect().width ?? width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onKeyDown={resizeKey}
      >
        <GripVertical size={16} />
      </button>
      <header className="qs-assistant-dock-header">
        <span>
          <strong>AI 助手</strong>
          {entry.mode === "preparation" && <small>备课空间</small>}
        </span>
        {!pinned && <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="收起 AI 助手"
        >
          <ArrowLeft className="qs-assistant-return" size={18} />
          <PanelRightClose className="qs-assistant-collapse" size={18} />
          <span>{entry.mode === "preparation" ? "返回教案" : "返回页面"}</span>
        </button>}
      </header>
      <AssistantPanel entry={entry} />
    </aside>
  );
}
