import { GlassButton } from '../../components/glass/Glass';
import React, { useRef, useState } from 'react';
import ResponsiveDialog from '../../components/ResponsiveDialog';
import { FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { SchoolClass } from '../../domain/types';
import {
  describeRosterImportError,
  RosterImportField,
  RosterImportGrid,
  RosterImportPreview,
  RosterImportResult
} from '../../services/rosterApi';

interface Props {
  classes: SchoolClass[];
  initialClassId: string;
  onClose: () => void;
  onPreview: (classId: string, grid: RosterImportGrid) => Promise<RosterImportPreview>;
  onImport: (classId: string, grid: RosterImportGrid) => Promise<RosterImportResult>;
  onComplete: (result: RosterImportResult) => void;
}

const fields: { value: RosterImportField; label: string; required?: boolean }[] = [
  { value: 'studentNo', label: '学号', required: true },
  { value: 'name', label: '学生姓名', required: true },
  { value: 'gender', label: '性别' },
  { value: 'parentName', label: '家长姓名' },
  { value: 'parentPhone', label: '家长手机' },
  { value: 'parentRelation', label: '与学生关系' },
  { value: 'parentRemark', label: '家长备注' }
];

const parseText = (text: string): RosterImportGrid => {
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const separator = lines[0]?.includes('\t') ? '\t' : ',';
  const parsed = lines.map(line => line.split(separator).map(value => value.trim()));
  return { headers: parsed[0] ?? [], rows: parsed.slice(1) };
};

const completeMapping = (grid: RosterImportGrid) => Object.fromEntries(
  grid.headers.map((_, index) => [index, grid.mapping?.[index] ?? null])
);

const sameHeaders = (left: string[], right: string[]) => left.length === right.length
  && left.every((header, index) => header === right[index]);

export default function RosterImportDialog({
  classes,
  initialClassId,
  onClose,
  onPreview,
  onImport,
  onComplete
}: Props) {
  const closeRef = useRef<(() => void) | null>(null);
  const [classId, setClassId] = useState(initialClassId);
  const [text, setText] = useState('');
  const [grid, setGrid] = useState<RosterImportGrid | null>(null);
  const [preview, setPreview] = useState<RosterImportPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestPreview = async (nextGrid: RosterImportGrid) => {
    const inheritedMapping = nextGrid.mapping
      ?? (grid && sameHeaders(grid.headers, nextGrid.headers) ? grid.mapping : undefined);
    const normalizedGrid = {
      ...nextGrid,
      mapping: inheritedMapping ? completeMapping({ ...nextGrid, mapping: inheritedMapping }) : undefined
    };
    setGrid(normalizedGrid);
    setPreview(null);
    if (!normalizedGrid.headers.length || !normalizedGrid.rows.length) {
      setError('请提供包含表头和数据行的表格。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onPreview(classId, normalizedGrid);
      setGrid({ ...normalizedGrid, mapping: result.mapping });
      setPreview(result);
    } catch (reason) {
      setError(describeRosterImportError(reason, 'preview'));
    } finally {
      setBusy(false);
    }
  };

  const updateFieldMapping = async (field: RosterImportField, sourceIndex: string) => {
    if (!grid) return;
    const mapping = completeMapping(grid);
    Object.keys(mapping).forEach(index => {
      if (mapping[Number(index)] === field) mapping[Number(index)] = null;
    });
    if (sourceIndex !== '') mapping[Number(sourceIndex)] = field;
    await requestPreview({ ...grid, mapping });
  };

  const readExcel = async (file: File) => {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()) as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error('工作簿中没有可读取的工作表');
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: false }, row => {
        rows.push((row.values as unknown[]).slice(1).map(value => String(value ?? '').trim()));
      });
      await requestPreview({ headers: rows[0] ?? [], rows: rows.slice(1) });
    } catch (reason) {
      setError(describeRosterImportError(reason, 'preview'));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!grid || !preview) return;
    setBusy(true);
    setError('');
    try {
      const result = await onImport(classId, grid);
      onComplete(result);
    } catch (reason) {
      setPreview(null);
      setError(describeRosterImportError(reason, 'import'));
    } finally {
      setBusy(false);
    }
  };

  const totals = preview?.rows.reduce(
    (accumulator, row) => ({ ...accumulator, [row.action]: accumulator[row.action] + 1 }),
    { create: 0, update: 0, conflict: 0, invalid: 0 }
  ) ?? { create: 0, update: 0, conflict: 0, invalid: 0 };

  const mapping = grid ? completeMapping(grid) : {};
  const selectedIndexFor = (field: RosterImportField) => {
    const entry = Object.entries(mapping).find(([, mappedField]) => mappedField === field);
    return entry?.[0] ?? '';
  };

  return (
    <ResponsiveDialog
      title="智能导入学生资料"
      subtitle="系统会按第一行列名自动匹配；请确认每项学生资料来自表格中的哪一列。"
      wide compactFull busy={busy} closeRef={closeRef}
      confirmDiscard={Boolean(text.trim() || grid)} onClose={onClose}
      footer={<div className="grid w-full grid-cols-2 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <span className="col-span-2 text-xs leading-5 text-slate-500 sm:col-span-1">冲突和不可处理行不会写入数据库。</span>
        <GlassButton type="button" disabled={busy} onClick={() => closeRef.current?.()} variant="secondary">取消</GlassButton>
        <GlassButton type="button" disabled={!grid || !preview || busy || totals.create + totals.update === 0}
          onClick={() => void apply()} variant="primary">
          {busy ? '处理中…' : `确认新增/更新 ${totals.create + totals.update} 条`}
        </GlassButton>
      </div>}
    >
          <label className="space-y-1">
            <span className="text-xs font-bold text-slate-500">目标班级</span>
            <select
              value={classId}
              disabled={busy}
              onChange={event => {
                setClassId(event.target.value);
                setPreview(null);
                setError('班级已切换，请重新预览后再确认导入。');
              }}
              className="qs-field-input block min-h-11 w-full rounded-xl border bg-slate-50 px-3 py-2 text-base sm:text-sm"
            >
              {classes.filter(item => item.status === 'active').map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <textarea
              value={text}
              disabled={busy}
              onChange={event => setText(event.target.value)}
              rows={7}
              placeholder={'序号\t学号\t学生姓名\t性别\n1\t20260001\t张三\t女'}
              className="qs-field-input min-w-0 w-full rounded-2xl border bg-slate-50 p-3 font-mono text-base disabled:opacity-60 sm:text-sm"
            />
            <div className="flex flex-col gap-2">
              <GlassButton
                type="button"
                disabled={busy}
                onClick={() => void requestPreview(parseText(text))}
                variant="primary" className="flex min-h-11 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />解析粘贴内容
              </GlassButton>
              <label className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2.5 text-sm font-bold text-emerald-700 ${busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                <Upload className="h-4 w-4" />上传 Excel
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={busy}
                  className="hidden"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) void readExcel(file);
                  }}
                />
              </label>
              <p className="text-xs leading-5 text-slate-500">
                可从 Excel 复制粘贴，或上传 .xlsx。第一行必须是列名；“序号”默认忽略，不会当作学号。
              </p>
            </div>
          </div>

          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              {grid?.headers.length && grid.rows.length ? (
                <GlassButton containerClassName="shrink-0"
                  type="button"
                  disabled={busy}
                  onClick={() => void requestPreview(grid)}
                  variant="secondary" className="flex min-h-11 items-center justify-center gap-1.5 px-3 text-sm disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />重新预览
                </GlassButton>
              ) : null}
            </div>
          )}

          {grid && (
            <section className="rounded-2xl border p-3 sm:p-4">
              <div className="mb-3">
                <h4 className="text-sm font-black">确认列名匹配</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  左侧是学生字段，右侧请选择对应的表格列名。没有对应资料时选择“不导入”。
                </p>
              </div>
              <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-3 px-3 text-xs font-bold text-slate-400 sm:grid">
                <span>学生字段</span><span>表格列名</span>
              </div>
              <div className="space-y-2">
                {fields.map(field => {
                  const selectedIndex = selectedIndexFor(field.value);
                  return (
                    <label key={field.value} className="grid gap-1.5 rounded-xl bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] sm:items-center sm:gap-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {field.label}
                        {field.required ? <span className="ml-1 text-xs font-bold text-red-600">必填</span> : null}
                      </span>
                      <select
                        value={selectedIndex}
                        disabled={busy}
                        onChange={event => void updateFieldMapping(field.value, event.target.value)}
                        className="qs-field-input min-w-0 w-full min-h-11 rounded-lg border bg-white px-3 py-2 text-base disabled:opacity-60 sm:text-sm"
                      >
                        <option value="">不导入</option>
                        {grid.headers.map((header, index) => {
                          const usedBy = mapping[index];
                          const unavailable = usedBy !== null && usedBy !== field.value;
                          return (
                            <option key={`${header}-${index}`} value={index} disabled={unavailable}>
                              {index + 1}. {header || `第 ${index + 1} 列`}{unavailable ? '（已匹配）' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {preview && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge tone="emerald">新增 {totals.create}</Badge>
                <Badge tone="blue">更新 {totals.update}</Badge>
                <Badge tone="amber">冲突 {totals.conflict}</Badge>
                <Badge tone="red">不可处理 {totals.invalid}</Badge>
              </div>
              <div className="overflow-x-auto rounded-2xl border">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Excel 行</th>
                      <th className="px-3 py-2">姓名</th>
                      <th className="px-3 py-2">学号</th>
                      <th className="px-3 py-2">处理方式</th>
                      <th className="px-3 py-2">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.rows.map(row => (
                      <tr key={row.row}>
                        <td className="px-3 py-2">{row.row}</td>
                        <td className="px-3 py-2 font-semibold">{row.name || '—'}</td>
                        <td className="px-3 py-2 font-mono">{row.studentNo || '—'}</td>
                        <td className="px-3 py-2">{{ create: '新增学生', update: '更新档案', conflict: '需要确认', invalid: '无法处理' }[row.action]}</td>
                        <td className="px-3 py-2 text-slate-500">
                          {row.message ?? (row.changes.length
                            ? `更新：${row.changes.map(key => fields.find(field => field.value === key)?.label ?? key).join('、')}`
                            : '核对基础信息')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
    </ResponsiveDialog>
  );
}

function Badge({ tone, children }: { tone: 'emerald' | 'blue' | 'amber' | 'red'; children: React.ReactNode }) {
  const styles = {
    emerald: 'bg-emerald-100 text-emerald-800',
    blue: 'bg-blue-100 text-blue-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800'
  };
  return <span className={`rounded-full px-2.5 py-1 font-bold ${styles[tone]}`}>{children}</span>;
}
