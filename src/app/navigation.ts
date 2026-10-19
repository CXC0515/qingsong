import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Calendar,
  ClipboardCheck,
  Database,
  FileText,
  FolderOpen,
  Grid,
  LayoutDashboard,
  LibraryBig,
  Network,
  Presentation,
  ScrollText,
  Settings2,
  Sliders,
  Sparkles,
  Trophy,
  Users,
  Workflow
} from 'lucide-react';
import type React from 'react';

export type PageId =
  | 'workbench'
  | 'lesson-plan'
  | 'grading-workspace'
  | 'diagnosis-workspace'
  | 'class-mgmt'
  | 'student-mgmt'
  | 'classroom'
  | 'classroom-tasks'
  | 'schedule'
  | 'tag-mgmt'
  | 'career-open-class'
  | 'career-competition'
  | 'career-paper'
  | 'career-title'
  | 'knowledge-graph'
  | 'material-pool'
  | 'library-editor'
  | 'settings';

export type NavGroupId = 'entry' | 'teaching' | 'homeSchool' | 'career' | 'library' | 'system';

export interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export interface NavGroup {
  id: NavGroupId;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

export function createNavGroups(activeGradingTaskCount: number): NavGroup[] {
  return [
    {
      id: 'entry',
      label: '工作台',
      icon: LayoutDashboard,
      items: [
        { id: 'workbench', label: '工作台', icon: LayoutDashboard }
      ]
    },
    {
      id: 'teaching',
      label: '教学工作',
      icon: BookOpen,
      items: [
        { id: 'classroom-tasks', label: '课堂任务', icon: ClipboardCheck },
        { id: 'lesson-plan', label: 'AI 教案', icon: FileText },
        { id: 'grading-workspace', label: 'AI 批改', icon: Workflow, badge: activeGradingTaskCount },
        { id: 'diagnosis-workspace', label: '学情诊断', icon: BarChart3 }
      ]
    },
    {
      id: 'homeSchool',
      label: '家校管理',
      icon: Users,
      items: [
        { id: 'class-mgmt', label: '班级管理', icon: FolderOpen },
        { id: 'student-mgmt', label: '学生管理', icon: Users },
        { id: 'classroom', label: '班级可视化', icon: Grid },
        { id: 'schedule', label: '课表与日程', icon: Calendar },
        { id: 'tag-mgmt', label: '标签管理', icon: Sparkles }
      ]
    },
    {
      id: 'career',
      label: '个人职业',
      icon: BriefcaseBusiness,
      items: [
        { id: 'career-open-class', label: '公开课', icon: Presentation },
        { id: 'career-competition', label: '教学比赛', icon: Trophy },
        { id: 'career-paper', label: '论文课题', icon: ScrollText },
        { id: 'career-title', label: '职称材料', icon: BriefcaseBusiness }
      ]
    },
    {
      id: 'library',
      label: '资料库',
      icon: Database,
      items: [
        { id: 'material-pool', label: '材料池', icon: FolderOpen },
        { id: 'knowledge-graph', label: '知识图谱', icon: Network },
        { id: 'library-editor', label: '资料编辑', icon: LibraryBig }
      ]
    },
    {
      id: 'system',
      label: '设置',
      icon: Settings2,
      items: [
        { id: 'settings', label: '我的设置', icon: Sliders }
      ]
    }
  ];
}
