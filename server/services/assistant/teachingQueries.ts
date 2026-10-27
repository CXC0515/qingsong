import { z } from 'zod';
import { listClasses, listStudents, listCommitteeRoles } from '../../repositories/rosterRepository';
import { listScheduleItems } from '../../repositories/scheduleRepository';
import { listClassroomTasks } from '../classroom/classroomTaskService';
import { listBehavior } from '../classroom/classroomBehaviorService';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
  );
const schema = z
  .object({
    kind: z.string().trim().min(1).max(64),
    classId: z.string().max(128).optional(),
    from: day.optional(),
    to: day.optional(),
  })
  .strict();
export function teachingQuery(input: unknown) {
  const args = schema.parse(input);
  const observedAt = new Date().toISOString();
  if (args.kind === 'capabilities') return {
    ok: true,
    data: { queries: [
      {kind: 'classes', scope: '当前教师可访问班级及真实classId'},
      {kind: 'roster', scope: '指定班级在班及休学学生：姓名、学号、性别、学情状态、在籍状态、班委角色与任职', required: ['classId']},
      {kind: 'schedule', scope: '课表与今日课程，不包含提醒日程'},
      {kind: 'classroom', scope: '指定日期的课堂任务与表现摘要；返回截断时不是完整统计', required: ['classId', 'from', 'to']},
    ], unavailable: ['座位安排', '提醒日程', '学生联系人与家庭信息', '学生完整画像及观察历史', '课堂任务逐人明细与纠错历史', '资料检索与原文', '批改任务与结果', '业务写入'],
    interpretation: '未开放的查询、查询失败、字段缺失及partial结果均不代表没有记录。只能在明确查询覆盖且完整返回的范围内判断无记录。' },
    observedAt, completeness: 'complete', sources: [],
  };
  if (!['classes', 'schedule', 'roster', 'classroom'].includes(args.kind)) throw Error('QUERY_UNSUPPORTED');
  const classes = listClasses();
  if (args.kind === 'classes') return {ok: true, data: {classes}, observedAt, completeness: 'complete', sources: [{title: '班级列表', url: '/?page=class-mgmt'}]};
  if (args.kind === 'schedule') {
    const local = new Date(Date.now() + 8 * 3600000),
      today = local.toISOString().slice(0, 10),
      weekday = local.getUTCDay() || 7,
      schedule = listScheduleItems();
    return {
      ok: true,
      data: {
        classes,
        schedule,
        today,
        weekday,
        todaySchedule: schedule.filter(
          (item) =>
            item.day === weekday && (item.scope ?? 'teacher') === 'teacher',
        ),
      },
      observedAt,
      completeness: 'complete',
      sources: [{ title: '课表与班级', url: '/?page=schedule' }],
    };
  }
  if (!args.classId) throw Error('CLASS_REQUIRED');
  if (!classes.some((c) => c.id === args.classId)) throw Error('CLASS_NOT_FOUND');
  if (args.kind === 'roster') {
    const committeeRoles = listCommitteeRoles().map(({id, name}) => ({id, name}));
    const rolesById = new Map(committeeRoles.map(role => [role.id, role]));
    const students = listStudents(args.classId).map(
      ({ id, name, studentNo, gender, status, enrollmentStatus, committeeRoleIds }) => ({
        id, name, studentNo, gender, status, enrollmentStatus,
        committeeRoles: committeeRoleIds.flatMap(roleId => rolesById.has(roleId) ? [rolesById.get(roleId)!] : []),
        unresolvedCommitteeRoleIds: committeeRoleIds.filter(roleId => !rolesById.has(roleId)),
      }),
    );
    return {
      ok: true,
      data: { class: classes.find((c) => c.id === args.classId), students, committeeRoles,
        rosterScope: '在班及休学学生，不含已转出或退学学生；committeeRoles为岗位目录，学生committeeRoles为实际任职，岗位存在不代表有人任职。',
        coveredFields: ['name', 'studentNo', 'gender', 'status', 'enrollmentStatus', 'committeeRoles'],
      },
      observedAt,
      completeness: students.some(student => student.unresolvedCommitteeRoleIds.length) ? 'partial' : 'complete',
      sources: [{ title: '班级名单与班委任职', url: '/?page=student-mgmt' }],
    };
  }
  if (
    !args.from ||
    !args.to ||
    args.from > args.to ||
    Date.parse(args.to) - Date.parse(args.from) > 30 * 86400000
  )
    throw Error('DATE_RANGE_REQUIRED');
  const behavior = listBehavior({
    classId: args.classId,
    from: args.from,
    to: args.to,
    limit: 100,
  });
  const tasks = listClassroomTasks({
    classId: args.classId,
    from: args.from,
    to: args.to,
    limit: 30,
  });
  return {
    ok: true,
    data: { behavior, tasks: tasks.tasks, taskTotal: tasks.total },
    observedAt,
    completeness:
      behavior.total > 100 || tasks.total > 30 ? 'partial' : 'complete',
    sources: [
      { title: '课堂任务与表现（指定日期）', url: '/?page=classroom-tasks' },
    ],
  };
}
