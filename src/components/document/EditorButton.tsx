import type { ReactNode } from "react";
export default function EditorButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
  text = false,
  danger = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  text?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`qs-editor-tool${text ? " has-label" : ""}${danger ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Menu actions preserve the editor selection while applying one controlled command. */
export function createMenuButton(onAction: (action: () => void) => void) {
  return (
    label: string,
    icon: ReactNode,
    action: () => void,
    disabled = false,
  ) => (
    <button
      key={label}
      type="button"
      className="qs-editor-menu-item"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onAction(action)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
