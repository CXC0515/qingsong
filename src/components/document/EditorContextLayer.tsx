import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Context controls follow the actual scroll surface and the visual viewport. */
export default function EditorContextLayer({
  anchor,
  children,
  label,
  menu = false,
}: {
  anchor: () => DOMRect | null;
  children: ReactNode;
  label: string;
  menu?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  useLayoutEffect(() => {
    const locate = () => {
      const rect = anchor(),
        element = host.current,
        viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      if (
        !rect ||
        !element ||
        rect.bottom < top + 48 ||
        rect.top > top + height
      ) {
        setPosition(null);
        return;
      }
      const box = element.getBoundingClientRect();
      const x = menu ? rect.left : rect.left + (rect.width - box.width) / 2;
      const above = rect.top - box.height - 10,
        below = rect.bottom + 8;
      const y =
        menu && below + box.height < top + height - 8
          ? below
          : above >= top + 8
            ? above
            : below;
      const next = {
        left: Math.max(left + 8, Math.min(x, left + width - box.width - 8)),
        top: Math.max(top + 8, Math.min(y, top + height - box.height - 8)),
      };
      setPosition((current) =>
        current?.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };
    locate();
    const observer = new ResizeObserver(locate);
    if (host.current) observer.observe(host.current);
    window.addEventListener("scroll", locate, true);
    window.addEventListener("resize", locate);
    window.visualViewport?.addEventListener("resize", locate);
    window.visualViewport?.addEventListener("scroll", locate);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", locate, true);
      window.removeEventListener("resize", locate);
      window.visualViewport?.removeEventListener("resize", locate);
      window.visualViewport?.removeEventListener("scroll", locate);
    };
  }, [anchor, menu]);
  return createPortal(
    <div
      ref={host}
      data-editor-context-layer
      role={menu ? "dialog" : "toolbar"}
      aria-label={label}
      className={
        menu
          ? "qs-editor-popover qs-editor-context-menu"
          : "qs-editor-context-toolbar"
      }
      style={{
        position: "fixed",
        left: position?.left ?? 8,
        top: position?.top ?? 8,
        visibility: position ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
