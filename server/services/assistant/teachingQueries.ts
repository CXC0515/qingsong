import { z } from 'zod';
import { listClasses, listStudents } from '../../repositories/rosterRepository';
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
    kind: z.enum(['schedule', 'roster', 'classroom']),
    classId: z.string().max(128).optional(),
    from: day.optional(),
    to: day.optional(),
  })
  .strict();
export function teachingQuery(input: unknown) {
  const args = schema.parse(input);
  const observedAt = new Date().toISOString();
  const classes = listClasses();
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
  if (!args.classId || !classes.some((c) => c.id === args.classId))
    throw Error('CLASS_REQUIRED');
  if (args.kind === 'roster') {
    const students = listStudents(args.classId).map(
      ({ id, name, studentNo, status }) => ({ id, name, studentNo, status }),
    );
    return {
      ok: true,
      data: { class: classes.find((c) => c.id === args.classId), students },
      observedAt,
      completeness: 'complete',
      sources: [{ title: '班级名单', url: '/?page=student-mgmt' }],
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
