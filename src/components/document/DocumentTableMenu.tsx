import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Rows3,
  Columns3,
  Trash2,
  Combine,
  Split,
  Heading,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Table2,
} from "lucide-react";
import {
  CellSelection,
  TableMap,
  cellAround,
  findTable,
} from "@tiptap/pm/tables";
import EditorButton, { createMenuButton } from "./EditorButton";
export default function DocumentTableMenu({
  editor,
  onAction,
  embedded = false,
}: {
  editor: Editor;
  embedded?: boolean;
  onAction: (action: () => void) => void;
}) {
  const [rows, setRows] = useState(3),
    [columns, setColumns] = useState(3),
    [header, setHeader] = useState(true);
  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      table: editor.isActive("table"),
      canMerge: editor.can().mergeCells(),
      canSplit: editor.can().splitCell(),
    }),
  });
  const button = createMenuButton(onAction);
  const insertTable = () =>
    onAction(() => {
      editor
        .chain()
        .focus()
        .insertTable({ rows, cols: columns, withHeaderRow: header })
        .run();
    });
  const selectCells = (kind: "row" | "column" | "table") => () => {
    const state = editor.state;
    const cell = cellAround(state.selection.$from);
    if (!cell) return;
    let selection: CellSelection;
    if (kind === "row") selection = CellSelection.rowSelection(cell);
    else if (kind === "column") selection = CellSelection.colSelection(cell);
    else {
      const table = findTable(cell);
      if (!table) return;
      const cells = TableMap.get(table.node).map;
      const first = cells[0];
      const last = cells[cells.length - 1];
      if (first === undefined || last === undefined) return;
      selection = CellSelection.create(
        state.doc,
        table.pos + first,
        table.pos + last,
      );
    }
    editor.view.dispatch(state.tr.setSelection(selection).scrollIntoView());
  };
  return (
    <div
      className={embedded ? undefined : "qs-editor-popover"}
      role={embedded ? undefined : "dialog"}
      aria-label={active.table ? "表格操作菜单" : "选择表格行列"}
    >
      {active.table ? (
        <>
          <strong className="qs-editor-menu-title">行列与单元格</strong>
          <div className="qs-editor-menu-grid">
            {button("选择当前行", <Rows3 size={18} />, selectCells("row"))}
            {button(
              "选择当前列",
              <Columns3 size={18} />,
              selectCells("column"),
            )}
            {button("选择整张表", <Table2 size={18} />, selectCells("table"))}
          </div>
          <div className="qs-editor-menu-grid">
            {button("上方插入行", <Rows3 size={18} />, () => {
              editor.chain().focus().addRowBefore().run();
            })}
            {button("下方插入行", <Rows3 size={18} />, () => {
              editor.chain().focus().addRowAfter().run();
            })}
            {button("左侧插入列", <Columns3 size={18} />, () => {
              editor.chain().focus().addColumnBefore().run();
            })}
            {button("右侧插入列", <Columns3 size={18} />, () => {
              editor.chain().focus().addColumnAfter().run();
            })}
            {button("删除当前行", <Trash2 size={18} />, () => {
              editor.chain().focus().deleteRow().run();
            })}
            {button("删除当前列", <Trash2 size={18} />, () => {
              editor.chain().focus().deleteColumn().run();
            })}
            {button(
              "合并选中单元格",
              <Combine size={18} />,
              () => {
                editor.chain().focus().mergeCells().run();
              },
              !active.canMerge,
            )}
            {button(
              "拆分单元格",
              <Split size={18} />,
              () => {
                editor.chain().focus().splitCell().run();
              },
              !active.canSplit,
            )}
            {button("切换标题行", <Heading size={18} />, () => {
              editor.chain().focus().toggleHeaderRow().run();
            })}
            {button("切换标题列", <Heading size={18} />, () => {
              editor.chain().focus().toggleHeaderColumn().run();
            })}
          </div>
          <p className="qs-editor-menu-hint">
            拖动列边线调整列宽；拖选多个单元格后可合并。
          </p>
          <div className="qs-editor-format-buttons">
            {[
              ["left", "单元格左对齐", <AlignLeft size={18} />],
              ["center", "单元格居中", <AlignCenter size={18} />],
              ["right", "单元格右对齐", <AlignRight size={18} />],
            ].map(([align, label, icon]) => (
              <EditorButton
                key={String(align)}
                label={String(label)}
                onClick={() =>
                  editor.chain().focus().setCellAttribute("align", align).run()
                }
              >
                {icon}
              </EditorButton>
            ))}
          </div>
          {button("删除整张表格", <Trash2 size={18} />, () => {
            editor.chain().focus().deleteTable().run();
          })}
        </>
      ) : (
        <>
          <strong className="qs-editor-menu-title">插入表格</strong>
          <div className="qs-editor-format-fields">
            <label>
              行数
              <input
                type="number"
                aria-label="表格行数"
                min={1}
                max={20}
                value={rows}
                onChange={(event) =>
                  setRows(
                    Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
            <label>
              列数
              <input
                type="number"
                aria-label="表格列数"
                min={1}
                max={12}
                value={columns}
                onChange={(event) =>
                  setColumns(
                    Math.max(1, Math.min(12, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
          </div>
          <label className="qs-editor-checkbox">
            <input
              type="checkbox"
              checked={header}
              onChange={(event) => setHeader(event.target.checked)}
            />
            首行为标题行
          </label>
          <button
            type="button"
            className="qs-editor-insert-confirm"
            onClick={insertTable}
          >
            插入 {rows} 行 × {columns} 列表格
          </button>
        </>
      )}
    </div>
  );
}
