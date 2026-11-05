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
const storedWidth = (key: string) => {
  try {
    const value = Number(localStorage.getItem(key));
    return value >= MIN_WIDTH && value <= 600 ? value : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};
/** One persistent iframe across teacher pages. Hiding the dock does not discard its draft. */
export default function AssistantDock({
  open,
  entry,
  identityKey,
  onClose,
}: {
  open: boolean;
  entry: AssistantEntry;
  identityKey: string;
  onClose: () => void;
}) {
  const storageKey = `qingsong:assistant-width:${identityKey}`;
  const [width, setWidth] = useState(() => storedWidth(storageKey));
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
    if (!open) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const clamp = (value: number) => Math.max(MIN_WIDTH, Math.min(600, value));
  const saveWidth = (value: number) => {
    const next = clamp(value);
    setWidth(next);
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
        ? width + 24
        : event.key === "ArrowRight"
          ? width - 24
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
      id="qingsong-assistant-dock"
      className="qs-assistant-dock"
      hidden={!open}
      aria-label="AI 助手侧栏"
      style={{ "--qs-assistant-width": `${width}px` } as CSSProperties}
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
          drag.current = { x: event.clientX, width };
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
          {entry.mode === "preparation" && <small>当前备课</small>}
        </span>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="收起 AI 助手"
        >
          <ArrowLeft className="qs-assistant-return" size={18} />
          <PanelRightClose className="qs-assistant-collapse" size={18} />
          <span>{entry.mode === "preparation" ? "返回教案" : "返回页面"}</span>
        </button>
      </header>
      <AssistantPanel entry={entry} />
    </aside>
  );
}
