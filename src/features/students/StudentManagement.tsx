import ClassPicker from '../../components/ClassPicker';
import { SearchField } from '../../components/WorkspaceUI';
import { GlassButton } from '../../components/glass/Glass';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, UserPlus, FileSpreadsheet, Edit, Trash2, Tag,
  ArrowLeftRight, ArrowUpDown, Filter, Search, X, Eye, HelpCircle, MoreHorizontal, Sparkles
} from 'lucide-react';
import { CommitteeRole, Student, SchoolClass, StudentStatus, ParentInfo, RosterStudent } from '../../domain/types';
import { RosterImportGrid, RosterImportPreview, RosterImportResult } from '../../services/rosterApi';
import { SortDirection, sortStudents, StudentSortKey } from '../../domain/studentSorting';
import RosterImportDialog from './RosterImportDialog';
import { dailyBehaviorTags } from '../../domain/behaviorTags';
import ResponsiveDialog from '../../components/ResponsiveDialog';

interface StudentManagementProps {
  students: RosterStudent[];
  classes: SchoolClass[];
  committeeRoles: CommitteeRole[];
  onAddStudent: (newStudent: Student) => Promise<boolean>;
  onUpdateStudent: (updatedStudent: Student) => Promise<boolean>;
  onDeleteStudent: (studentId: string) => void;
  onBulkImport: (
    classId: string,
    grid: RosterImportGrid
  ) => Promise<RosterImportResult>;
  onPreviewBulkImport: (classId: string, grid: RosterImportGrid) => Promise<RosterImportPreview>;
  onBulkMoveClass: (studentIds: string[], targetClassId: string) => void;
  onBulkAddTags: (studentIds: string[], tags: string[]) => void;
  onViewStudentProfile: (studentId: string) => void;
  targetStudentId?: string | null;
  onTargetStudentHandled?: () => void;
}

export default function StudentManagement({
  students,
  classes,
  committeeRoles,
  onAddStudent,
  onUpdateStudent,
  onDeleteStudent,
  onBulkImport,
  onPreviewBulkImport,
  onBulkMoveClass,
  onBulkAddTags,
  onViewStudentProfile,
  targetStudentId,
  onTargetStudentHandled
}: StudentManagementProps) {
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importClassId, setImportClassId] = useState('');
  const [importSummary, setImportSummary] = useState<{changed:number;rejected:number}|null>(null);
  const [sortKey, setSortKey] = useState<StudentSortKey>('studentNo');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [mobilePicker, setMobilePicker] = useState<'class' | 'sort' | 'more' | null>(null);
  const [otherRelation, setOtherRelation] = useState('');

  // Form states for Student add/edit
  const [formData, setFormData] = useState<Partial<Student>>({
    name: '',
    studentNo: '',
    classId: 'c1',
    gender: 'male',
    committeeRoleIds: [],
    status: 'good',
    behaviorTags: [],
    parent: { name: '', phone: '', relation: '父亲', remark: '' },
    familyStatus: 'normal',
    observationHistory: [],
    strongKnowledge: [],
    weakKnowledge: [],
    recentHomeworkTrend: [85, 85, 85, 85, 85],
    homeworkHistory: []
  });

  const [bulkTargetClass, setBulkTargetClass] = useState('c1');
  const [bulkNewTag, setBulkNewTag] = useState('');
  const familyAttentionTags = ['留守儿童', '双职工家庭', '隔代教养', '单亲家庭', '重组家庭', '家长期望较高', '作业陪伴不足', '沟通需谨慎'];
  const relationOptions = ['母亲', '父亲', '姥姥', '奶奶', '姥爷', '爷爷', '其他'];
  const selectedFamilyTags = (formData.familyStatusTag || '').split('、').filter(Boolean);
  const selectedBehaviorTags = formData.behaviorTags || [];
  const [initialDraft,setInitialDraft]=useState<string|null>(null);
  const editorCloseRef=useRef<(()=>void)|null>(null);
  const [savingStudent,setSavingStudent]=useState(false);
  const [studentSaveError,setStudentSaveError]=useState('');
  useEffect(()=>{if(showAddEditModal){setInitialDraft(JSON.stringify([formData,otherRelation]));setStudentSaveError('');}else setInitialDraft(null);},[showAddEditModal]);


  useEffect(() => {
    if (!targetStudentId) return;
    const targetStudent = students.find(student => student.id === targetStudentId);
    if (!targetStudent) return;

    setSelectedClassId(targetStudent.classId);
    setSearchQuery('');
    setSelectedStudentId(null);
    setIsEditMode(true);
    setOtherRelation(relationOptions.includes(targetStudent.parent.relation) ? '' : targetStudent.parent.relation);
    setFormData({ ...targetStudent });
    setShowAddEditModal(true);
    onTargetStudentHandled?.();
  }, [onTargetStudentHandled, students, targetStudentId]);

  // Filter students
  const filteredStudents = useMemo(() => sortStudents(students.filter(s => {
    const matchesClass = selectedClassId === 'all' || s.classId === selectedClassId;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.studentNo.includes(searchQuery);
    return matchesClass && matchesSearch;
  }), sortKey, sortDirection), [searchQuery, selectedClassId, sortDirection, sortKey, students]);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const getStatusBadge = (status: StudentStatus) => {
    switch (status) {
      case 'good':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium">良好</span>;
      case 'outstanding':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 font-medium">优秀</span>;
      case 'warning':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-medium">关注</span>;
      case 'risk':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 font-medium">预警</span>;
    }
  };

  const handleSelectRow = (studentId: string) => {
    if (selectedRows.includes(studentId)) {
      setSelectedRows(selectedRows.filter(id => id !== studentId));
    } else {
      setSelectedRows([...selectedRows, studentId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedRows.length === filteredStudents.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(filteredStudents.map(s => s.id));
    }
  };

  const handleOpenAdd = () => {
    const defaultClassId = selectedClassId === 'all'
      ? classes.find(item => item.id === 'c5' && item.status === 'active')?.id ?? classes.find(item => item.status === 'active')?.id ?? ''
      : selectedClassId;
    setIsEditMode(false);
    setOtherRelation('');
    setFormData({
      id: 's' + (students.length + 1),
      name: '',
      studentNo: '',
      classId: defaultClassId,
      gender: 'male',
      committeeRoleIds: [],
      status: 'good',
      behaviorTags: ['勤奋踏实'],
      parent: { name: '', phone: '', relation: '父亲', remark: '' },
      familyStatus: 'normal',
      observationHistory: [],
      strongKnowledge: ['散文阅读'],
      weakKnowledge: ['文言文虚词'],
      recentHomeworkTrend: [80, 82, 85, 80, 83],
      homeworkHistory: []
    });
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (s: Student) => {
    setIsEditMode(true);
    setOtherRelation(relationOptions.includes(s.parent.relation) ? '' : s.parent.relation);
    setFormData({ ...s });
    setShowAddEditModal(true);
  };

  const handleSaveStudent = async () => {
    if (!formData.name || !formData.studentNo || !formData.classId) {
      alert('请填写学生姓名、班内学号并选择班级。');
      return;
    }
    const currentClass = classes.find(c => c.id === formData.classId);
    const normalizedParent = {
      ...formData.parent,
      relation: formData.parent?.relation === '其他' && otherRelation.trim()
        ? otherRelation.trim()
        : formData.parent?.relation || '父亲'
    } as ParentInfo;
    const updated = {
      ...formData,
      parent: normalizedParent,
      className: currentClass ? currentClass.name : ''
    } as Student;

    if(savingStudent)return;
    setSavingStudent(true);setStudentSaveError('');
    try{
      const saved = isEditMode ? await onUpdateStudent(updated) : await onAddStudent(updated);
      if(saved)setShowAddEditModal(false);
      else setStudentSaveError('学生档案未保存，填写内容仍保留，请核对后重试。');
    }catch{setStudentSaveError('尚未确认学生档案是否保存，填写内容仍保留。请核对名册后再重试。');}
    finally{setSavingStudent(false);}
  };

  const handleOpenImport = () => {
    const targetClassId = selectedClassId === 'all'
      ? classes.find(item => item.id === 'c5' && item.status === 'active')?.id ?? classes.find(item => item.status === 'active')?.id ?? ''
      : selectedClassId;
    setImportClassId(targetClassId);
    setShowImportModal(true);
  };

  const toggleSort = (key: StudentSortKey) => {
    if (sortKey === key) setSortDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDirection('asc'); }
  };

  const handleApplyBulkMove = () => {
    onBulkMoveClass(selectedRows, bulkTargetClass);
    setSelectedRows([]);
    setShowBulkMoveModal(false);
  };

  const handleApplyBulkTags = () => {
    if (!bulkNewTag.trim()) return;
    onBulkAddTags(selectedRows, [bulkNewTag.trim()]);
    setBulkNewTag('');
    setSelectedRows([]);
    setShowBulkTagModal(false);
  };

  return (
    <div className="flex flex-col gap-4 min-h-full" id="student-mgmt-page">
      
      {/* Table Section */}
      <div className="flex-1 flex flex-col space-y-4 min-w-0">
        
        {/* Header toolbar */}
        <div className="glass-panel space-y-2 rounded-2xl p-3 md:hidden">
          <div className="flex items-center gap-2">
            <h2 className="mr-auto flex items-center gap-2 text-base font-bold text-slate-800 dark:text-slate-100">
              <Users className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />学生管理
            </h2>
            <GlassButton containerClassName="h-11 w-11" type="button" onClick={() => setMobilePicker('more')} aria-label="更多学生操作" variant="secondary" className="grid place-items-center"><MoreHorizontal className="h-5 w-5" /></GlassButton>
            <GlassButton id="add-student-btn-mobile" type="button" onClick={handleOpenAdd} variant="primary" className="inline-flex min-h-11 items-center gap-1 px-3 text-xs font-bold"><UserPlus className="h-4 w-4" />添加</GlassButton>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <input id="student-search-input-mobile" type="search" placeholder="搜索姓名或学号" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="qs-field-input min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-base text-slate-700 outline-none focus:border-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-slate-200" />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <button type="button" onClick={() => setMobilePicker('class')} aria-label="筛选班级" className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${selectedClassId === 'all' ? 'border-slate-200 text-slate-500 dark:border-zinc-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30'}`}><Filter className="h-4 w-4" />{selectedClassId !== 'all' && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-600" />}</button>
            <GlassButton containerClassName="h-11 w-11 shrink-0" type="button" onClick={() => setMobilePicker('sort')} aria-label="学生排序" variant="secondary" className="grid place-items-center"><ArrowUpDown className="h-4 w-4" /></GlassButton>
          </div>
        </div>

        <div className="glass-panel hidden flex-col items-stretch justify-between gap-3 rounded-2xl p-4 md:flex xl:flex-row xl:items-center">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 min-w-0">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              学生管理
            </h2>
            
            {/* Search Input */}
            <SearchField id="student-search-input" className="qs-search-grow" placeholder="搜索姓名或学号" value={searchQuery} onChange={event=>setSearchQuery(event.target.value)}/>

            {/* Class Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <ClassPicker classes={classes.filter(c=>c.status==='active')} allowAll value={selectedClassId==='all'?'':selectedClassId} onChange={id=>setSelectedClassId(id||'all')} label="筛选学生班级"/>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <GlassButton
              onClick={handleOpenImport}
              variant="secondary" className="px-3 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              批量导入名册
            </GlassButton>
            <GlassButton
              id="add-student-btn"
              onClick={handleOpenAdd}
              variant="primary" className="px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              添加学生
            </GlassButton>
          </div>
        </div>

        {/* Selected Rows Bulk Actions Bar */}
        {selectedRows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-700/10 border border-emerald-500/20 rounded-xl text-xs animate-fade-in">
            <span className="font-semibold text-emerald-800 dark:text-emerald-400">
              已选中 {selectedRows.length} 名学生
            </span>
            <div className="flex items-center gap-2">
              <GlassButton
                onClick={() => setShowBulkMoveModal(true)}
                variant="secondary" className="px-2.5 py-1.5 flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                批量调班
              </GlassButton>
              <GlassButton
                onClick={() => setShowBulkTagModal(true)}
                variant="secondary" className="px-2.5 py-1.5 flex items-center gap-1 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                批量打标签
              </GlassButton>
              <button
                onClick={() => setSelectedRows([])}
                className="text-slate-400 hover:text-slate-600 ml-2"
              >
                清除选择
              </button>
            </div>
          </div>
        )}

        {/* Desktop and tablet roster */}
        <div className="hidden md:block glass-panel rounded-2xl overflow-hidden flex-1">
          <table className="w-full table-auto text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-zinc-800/50 text-[11px] font-bold text-slate-400 border-b border-slate-100 dark:border-zinc-800">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedRows.length === filteredStudents.length && filteredStudents.length > 0}
                    onChange={handleSelectAll}
                    className="accent-emerald-700"
                    aria-label="选择当前列表全部学生"
                  />
                </th>
                <SortHeader label="学生" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <SortHeader label="学号" sortKey="studentNo" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <SortHeader label="班级" sortKey="className" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <SortHeader label="性别" sortKey="gender" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <SortHeader label="在班状态" sortKey="enrollmentStatus" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <SortHeader label="学情状态" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={toggleSort}/>
                <th className="px-3 py-3">日常表现</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/40 text-xs">
              {filteredStudents.map(student => {
                const isSelected = selectedStudentId === student.id;
                const isRowChecked = selectedRows.includes(student.id);
                return (
                  <tr
                    key={student.id}
                    onClick={() => setSelectedStudentId(student.id)}
                    className={`hover:bg-slate-50/70 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer ${isSelected ? 'bg-emerald-600/5 dark:bg-emerald-500/5' : ''}`}
                  >
                    <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isRowChecked}
                        onChange={() => handleSelectRow(student.id)}
                        className="accent-emerald-700"
                        aria-label={`选择 ${student.name}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{student.name}</span>
                        {student.committeeRoleIds.map(roleId => <span key={roleId} className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{committeeRoles.find(role=>role.id===roleId)?.name}</span>)}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{student.studentNo}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{student.className}</td>
                    <td className="px-3 py-3 whitespace-nowrap">{student.gender === 'male' ? '男' : '女'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                        {student.enrollmentStatus === 'active' ? '在班' : student.enrollmentStatus === 'suspended' ? '暂缓' : '已离班'}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{getStatusBadge(student.status)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {student.behaviorTags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 rounded text-slate-500 text-[10px] whitespace-nowrap">{tag}</span>
                        ))}
                        {student.behaviorTags.length > 2 && <span className="text-[10px] text-slate-400">+{student.behaviorTags.length - 2}</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-400">未找到符合筛选条件的学生。</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile roster */}
        <div className="md:hidden glass-panel rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
          {filteredStudents.map(student => (
            <div key={student.id} className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                checked={selectedRows.includes(student.id)}
                onChange={() => handleSelectRow(student.id)}
                className="mt-1 accent-emerald-700"
                aria-label={`选择 ${student.name}`}
              />
              <button type="button" onClick={() => setSelectedStudentId(student.id)} className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                    <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{student.name}</span>
                    {student.committeeRoleIds.slice(0,1).map(roleId => <span key={roleId} className="shrink-0 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">{committeeRoles.find(role=>role.id===roleId)?.name}</span>)}
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                    {student.enrollmentStatus === 'active' ? '在班' : student.enrollmentStatus === 'suspended' ? '暂缓' : '已离班'}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span className="font-mono">{student.studentNo}</span>
                  <span>{student.className}</span>
                  <span>{student.gender === 'male' ? '男' : '女'}</span>
                  <span>{student.status === 'outstanding' ? '表现突出' : student.status === 'warning' ? '需要关注' : student.status === 'risk' ? '近期风险' : '状态良好'}</span>
                </div>
              </button>
            </div>
          ))}
          {filteredStudents.length === 0 && <div className="px-6 py-12 text-center text-sm text-slate-400">未找到符合筛选条件的学生。</div>}
        </div>
      </div>

      {selectedStudent && (
        <ResponsiveDialog sideOnMedium title={selectedStudent.name+'的学生详情'} onClose={()=>setSelectedStudentId(null)}>
            <div className="space-y-5" id="student-mgmt-drawer">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                <div><span className="text-slate-400">所属班级</span><p className="mt-1 font-semibold">{selectedStudent.className}</p></div>
                <div><span className="text-slate-400">性别</span><p className="mt-1 font-semibold">{selectedStudent.gender === 'male' ? '男' : '女'}</p></div>
                <div><span className="text-slate-400">在班状态</span><p className="mt-1 font-semibold">{selectedStudent.enrollmentStatus === 'active' ? '在班' : selectedStudent.enrollmentStatus === 'suspended' ? '暂缓' : '已离班'}</p></div>
                <div><span className="text-slate-400">学情状态</span><div className="mt-1">{getStatusBadge(selectedStudent.status)}</div></div>
              </div>

              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400">第一联系人</h4>
                {selectedStudent.parent.name || selectedStudent.parent.phone || selectedStudent.parent.remark ? (
                  <div className="p-3 border border-slate-200 dark:border-zinc-800 rounded-lg space-y-2 text-xs">
                    <div className="flex flex-wrap justify-between gap-2 font-medium text-slate-700 dark:text-slate-300">
                      <span>{selectedStudent.parent.name || '未填写姓名'}{selectedStudent.parent.relation ? `（${selectedStudent.parent.relation}）` : ''}</span>
                      <span className="font-mono text-slate-500">{selectedStudent.parent.phone || '未填写电话'}</span>
                    </div>
                    {selectedStudent.parent.remark && <p className="p-2 bg-amber-500/5 rounded text-[11px] text-slate-500">{selectedStudent.parent.remark}</p>}
                  </div>
                ) : <p className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-lg text-xs text-slate-400">尚未录入家长联系信息</p>}
                <p className="text-xs font-semibold">第二联系人</p>
                <p className="rounded-lg border p-3 text-sm">{selectedStudent.secondaryParent?.name || '未填写姓名'} {selectedStudent.secondaryParent?.relation} · {selectedStudent.secondaryParent?.phone || '未填写电话'}{selectedStudent.secondaryParent?.remark && <span className="mt-2 block">{selectedStudent.secondaryParent.remark}</span>}</p>
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400">日常表现标签</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedStudent.behaviorTags.length
                    ? selectedStudent.behaviorTags.map(tag => <span key={tag} className="px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-xs text-slate-600 dark:text-slate-300">{tag}</span>)
                    : <span className="text-xs text-slate-400">暂无标签</span>}
                </div>
              </section>

              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/20"><h4 className="font-bold text-emerald-800 dark:text-emerald-300">学科优势</h4><p className="mt-2 text-slate-600 dark:text-slate-300">{selectedStudent.strongKnowledge.join('、') || '暂无记录'}</p></div>
                <div className="p-3 rounded-lg bg-rose-50/70 dark:bg-rose-950/20"><h4 className="font-bold text-rose-800 dark:text-rose-300">学科短板</h4><p className="mt-2 text-slate-600 dark:text-slate-300">{selectedStudent.weakKnowledge.join('、') || '暂无记录'}</p></div>
              </section>
            </div>
            <div className="shrink-0 grid grid-cols-2 gap-2 p-4 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <GlassButton type="button" onClick={() => { onViewStudentProfile(selectedStudent.id); setSelectedStudentId(null); }} variant="primary" className="col-span-2 flex min-h-11 items-center justify-center gap-2 text-sm font-bold"><Eye className="h-4 w-4" />查看学生画像</GlassButton>
              <GlassButton
                type="button"
                onClick={() => { handleOpenEdit(selectedStudent); setSelectedStudentId(null); }}
                variant="primary" className="py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Edit className="w-4 h-4" />修改档案
              </GlassButton>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`确定要归档/删除学生 ${selectedStudent.name} 吗？`)) {
                    onDeleteStudent(selectedStudent.id);
                    setSelectedStudentId(null);
                  }
                }}
                className="py-2.5 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />移出名册
              </button>
            </div>
        </ResponsiveDialog>
      )}
      {mobilePicker === 'class' && <ResponsiveDialog title="筛选班级" onClose={() => setMobilePicker(null)}><div className="grid gap-2">
        {[{ id: 'all', name: '所有班级' }, ...classes.filter(item => item.status === 'active')].map(item => <button key={item.id} type="button" onClick={() => { setSelectedClassId(item.id); setMobilePicker(null); }} className={`min-h-11 rounded-xl border px-4 text-left text-sm font-bold ${selectedClassId === item.id ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}>{item.name}</button>)}
      </div></ResponsiveDialog>}
      {mobilePicker === 'sort' && <ResponsiveDialog title="学生排序" onClose={() => setMobilePicker(null)}><div className="grid gap-2">
        {([
          ['studentNo:asc', '学号升序'], ['studentNo:desc', '学号降序'], ['name:asc', '姓名拼音升序'], ['name:desc', '姓名拼音降序'], ['status:asc', '学情状态升序'], ['status:desc', '学情状态降序']
        ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { const [key, direction] = value.split(':') as [StudentSortKey, SortDirection]; setSortKey(key); setSortDirection(direction); setMobilePicker(null); }} className={`min-h-11 rounded-xl border px-4 text-left text-sm font-bold ${`${sortKey}:${sortDirection}` === value ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30' : 'border-slate-200 dark:border-zinc-700'}`}>{label}</button>)}
      </div></ResponsiveDialog>}
      {mobilePicker === 'more' && <ResponsiveDialog title="学生操作" onClose={() => setMobilePicker(null)}><GlassButton type="button" onClick={() => { setMobilePicker(null); handleOpenImport(); }} variant="secondary" containerClassName="w-full" className="flex min-h-11 items-center gap-2 px-4 text-sm font-bold"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />批量导入名册</GlassButton></ResponsiveDialog>}
      {showImportModal && (
        <RosterImportDialog classes={classes} initialClassId={importClassId} onClose={()=>setShowImportModal(false)} onPreview={onPreviewBulkImport} onImport={onBulkImport} onComplete={result=>{setShowImportModal(false);setImportSummary({changed:result.created.length+result.updated.length,rejected:result.rejected.length});setTimeout(()=>setImportSummary(null),4000)}}/>
      )}

      {/* Roster Import Toast Notification */}
      {importSummary && (
        <div className="fixed bottom-6 right-6 bg-slate-900/90 dark:bg-emerald-950/90 text-white backdrop-blur-md px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 z-50 animate-fade-in border border-emerald-500/20">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <div className="text-xs">
            <span className="font-bold block text-emerald-400">名册导入完成</span>
            <span>成功新增或更新 <b>{importSummary.changed}</b> 人{importSummary.rejected ? `，${importSummary.rejected} 行未处理` : ''}。</span>
          </div>
          <button onClick={() => setImportSummary(null)} className="text-white/60 hover:text-white ml-3">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Add / Edit Student Modal */}
      {showAddEditModal && (
        <ResponsiveDialog closeRef={editorCloseRef} busy={savingStudent} confirmDiscard={initialDraft!==null&&initialDraft!==JSON.stringify([formData,otherRelation])} wide title={isEditMode?'修改学生档案':'录入新学生档案'} onClose={()=>setShowAddEditModal(false)}>
            {/* Fields */}
            <fieldset disabled={savingStudent} className="min-w-0 space-y-4 text-sm">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">学生姓名</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="如：张三"
                    className="qs-field-input w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">所属班级</label>
                  <select
                    value={formData.classId || 'c1'}
                    onChange={(e) => setFormData({
                      ...formData,
                      classId: e.target.value,
                      committeeRoleIds: e.target.value === formData.classId ? formData.committeeRoleIds : []
                    })}
                    className="qs-field-input w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 focus:outline-none"
                  >
                    {classes.filter(c => c.status === 'active').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">学号</label>
                  <input
                    type="text"
                    value={formData.studentNo || ''}
                    onChange={(e) => setFormData({ ...formData, studentNo: e.target.value })}
                    placeholder="20260703xx"
                    className="qs-field-input w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">生理性别</label>
                  <div className="flex gap-4 pt-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        checked={formData.gender === 'male'}
                        onChange={() => setFormData({ ...formData, gender: 'male' })}
                        className="accent-emerald-700"
                      />
                      <span>男</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="radio"
                        checked={formData.gender === 'female'}
                        onChange={() => setFormData({ ...formData, gender: 'female' })}
                        className="accent-emerald-700"
                      />
                      <span>女</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Parent fields */}
              <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200 dark:border-zinc-700 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">第一联系人</span>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500">家长姓名</label>
                      <input
                        type="text"
                        value={formData.parent?.name || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          parent: { ...formData.parent, name: e.target.value } as ParentInfo
                        })}
                        className="qs-field-input w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500">联系电话</label>
                      <input
                        type="text"
                        value={formData.parent?.phone || ''}
                        onChange={(e) => setFormData({
                          ...formData,
                          parent: { ...formData.parent, phone: e.target.value } as ParentInfo
                        })}
                        className="qs-field-input w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-500">关系</label>
                      <select
                        value={relationOptions.includes(formData.parent?.relation || '') ? formData.parent?.relation : '其他'}
                        onChange={(e) => {
                          if (e.target.value !== '其他') setOtherRelation('');
                          setFormData({
                            ...formData,
                            parent: { ...formData.parent, relation: e.target.value } as ParentInfo
                          });
                        }}
                        className="qs-field-input w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border"
                      >
                        {relationOptions.map(option => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                      {(formData.parent?.relation === '其他' || !relationOptions.includes(formData.parent?.relation || '')) && (
                        <input
                          type="text"
                          value={otherRelation}
                          onChange={(e) => setOtherRelation(e.target.value)}
                          placeholder="请输入具体关系"
                          className="qs-field-input w-full mt-2 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 border"
                        />
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500">家校沟通随记</label>
                    <textarea
                      value={formData.parent?.remark || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        parent: { ...formData.parent, remark: e.target.value } as ParentInfo
                      })}
                      placeholder="沟通时间及关键诉求"
                      rows={9}
                      className="qs-field-input w-full h-full min-h-[168px] px-3 py-2 rounded-lg bg-white dark:bg-zinc-800 border resize-none"
                    />
                  </div>
                </div>
                <fieldset className="space-y-3 border-t border-slate-200 pt-4">
                  <legend className="text-sm font-semibold">第二联系人（选填）</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {([['name','姓名'],['relation','关系'],['phone','联系电话'],['remark','备注']] as const).map(([key,label])=><label key={key} className="space-y-1 text-sm">{label}<input aria-label={'第二联系人'+label} value={formData.secondaryParent?.[key] ?? ''} maxLength={key==='remark'?4000:100} onChange={e=>setFormData({...formData,secondaryParent:{name:'',phone:'',relation:'',remark:'',...formData.secondaryParent,[key]:e.target.value}})} className="qs-field-input min-h-11 w-full rounded-lg border px-3 text-base"/></label>)}
                  </div>
                </fieldset>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-500">家庭关注类型</label>
                  <div className="flex flex-wrap gap-2">
                    {familyAttentionTags.map(tag => {
                      const checked = selectedFamilyTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            const next = checked
                              ? selectedFamilyTags.filter(item => item !== tag)
                              : [...selectedFamilyTags, tag];
                            setFormData({ ...formData, familyStatusTag: next.join('、'), familyStatus: next.length ? 'attention' : 'normal' });
                          }}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            checked
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white dark:bg-zinc-800 text-slate-500 border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-zinc-800/40 rounded-2xl border border-slate-200 dark:border-zinc-700 space-y-3">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">日常表现标签</label>
                <div className="flex flex-wrap gap-2">
                  {dailyBehaviorTags.map(tag => {
                    const checked = selectedBehaviorTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? selectedBehaviorTags.filter(item => item !== tag)
                            : [...selectedBehaviorTags, tag];
                          setFormData({ ...formData, behaviorTags: next });
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                          checked
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-zinc-800 text-slate-500 border-slate-200 dark:border-zinc-700'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Committee / Status */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">班委职责</label>
                  <div className="flex flex-wrap gap-2 pt-2">{committeeRoles.map(role=>{const checked=(formData.committeeRoleIds??[]).includes(role.id);return <button type="button" key={role.id} onClick={()=>setFormData({...formData,committeeRoleIds:checked?(formData.committeeRoleIds??[]).filter(id=>id!==role.id):[...(formData.committeeRoleIds??[]),role.id]})} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${checked?'border-emerald-700 bg-emerald-700 text-white':'border-slate-200 text-slate-500'}`}>{role.name}</button>})}</div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 block">日常表现评估</label>
                  <select
                    value={formData.status || 'good'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as StudentStatus })}
                    className="qs-field-input w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-zinc-700 focus:outline-none"
                  >
                    <option value="good">状态良好</option>
                    <option value="outstanding">表现突出</option>
                    <option value="warning">需要关注</option>
                    <option value="risk">近期风险</option>
                  </select>
                </div>
              </div>
            </fieldset>

            {studentSaveError&&<p role="alert" className="qs-error">{studentSaveError}</p>}
            {/* Actions */}
            <div className="shrink-0 flex justify-end gap-3 p-4 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <button
                disabled={savingStudent} onClick={()=>editorCloseRef.current?.()}
                className="px-4 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 text-slate-700 dark:text-slate-200 rounded-xl"
              >
                取消
              </button>
              <GlassButton
                disabled={savingStudent} onClick={() => void handleSaveStudent()}
                variant="primary" className="px-4 py-2 text-xs font-semibold"
              >
                {savingStudent?'正在保存…':'保存档案'}
              </GlassButton>
            </div>
        </ResponsiveDialog>
      )}

      {/* Bulk Move Modal */}
      {showBulkMoveModal && (
        <ResponsiveDialog title="批量调班" onClose={()=>setShowBulkMoveModal(false)}>
            <p className="text-xs text-slate-500">
              将选中的 {selectedRows.length} 名学生批量调入以下目标班级，自动更新课程体系和学情组别：
            </p>
            <select
              value={bulkTargetClass}
              onChange={(e) => setBulkTargetClass(e.target.value)}
              className="qs-field-input w-full px-3 py-2 border rounded-xl text-xs"
            >
              {classes.filter(c => c.status === 'active').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBulkMoveModal(false)} className="px-3 py-1.5 text-xs bg-slate-100 rounded-lg">
                取消
              </button>
              <GlassButton onClick={handleApplyBulkMove} variant="primary" className="px-3 py-1.5 text-xs">
                确认调动
              </GlassButton>
            </div>
        </ResponsiveDialog>
      )}

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <ResponsiveDialog title="批量添加标签" onClose={()=>setShowBulkTagModal(false)}>
            <input
              type="text"
              value={bulkNewTag}
              onChange={(e) => setBulkNewTag(e.target.value)}
              placeholder="如：文言文自律、默写积极、作文推荐..."
              className="qs-field-input w-full px-3 py-2 border rounded-xl text-xs"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowBulkTagModal(false)} className="px-3 py-1.5 text-xs bg-slate-100 rounded-lg">
                取消
              </button>
              <GlassButton onClick={handleApplyBulkTags} variant="primary" className="px-3 py-1.5 text-xs">
                确认添加
              </GlassButton>
            </div>
        </ResponsiveDialog>
      )}

    </div>
  );
}

function SortHeader({label,sortKey,activeKey,direction,onSort}:{label:string;sortKey:StudentSortKey;activeKey:StudentSortKey;direction:SortDirection;onSort:(key:StudentSortKey)=>void}) {
  const active=sortKey===activeKey;
  return <th className="whitespace-nowrap px-3 py-3" aria-sort={active?(direction==='asc'?'ascending':'descending'):'none'}><button type="button" onClick={()=>onSort(sortKey)} className={`inline-flex items-center gap-1 ${active?'text-emerald-700':'hover:text-slate-600'}`}>{label}<ArrowUpDown className="h-3 w-3"/></button></th>;
}

