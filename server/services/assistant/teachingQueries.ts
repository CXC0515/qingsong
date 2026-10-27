import { z } from 'zod';
import { listClasses, listStudents, listCommitteeRoles } from '../../repositories/rosterRepository';
import { listScheduleItems, listReminders } from '../../repositories/scheduleRepository';
import {getClassroomLayout} from '../../repositories/classroomRepository';
import { listClassroomTasks, requireTask, studentClassroomTasks } from '../classroom/classroomTaskService';
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
    studentId: z.string().max(128).optional(),
    taskId: z.string().max(128).optional(),
    offset: z.number().int().min(0).max(100000).default(0),
    limit: z.number().int().min(1).max(100).default(50),
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
      {kind: 'classroom', scope: '指定日期的课堂任务与表现摘要，offset/limit分页；截断不是完整统计', required: ['classId', 'from', 'to']},
      {kind:'seating',scope:'已保存座位安排，含讲台四旁座',required:['classId']},
      {kind:'reminders',scope:'提醒日程，含状态与时间；可按classId和日期筛选'},
      {kind:'task',scope:'课堂任务逐人结果和纠错事件，offset/limit分页',required:['classId','taskId']},
      {kind:'student',scope:'学生课堂记录和教师观察依据，按日期限定，不含联系人/家庭信息',required:['classId','studentId','from','to']},
    ], unavailable: ['学生联系人与家庭信息', '资料检索与原文', '批改任务与结果', '业务写入'],
    interpretation: '未开放的查询、查询失败、字段缺失及partial结果均不代表没有记录。只能在明确查询覆盖且完整返回的范围内判断无记录。' },
    observedAt, completeness: 'complete', sources: [],
  };
  if (!['classes', 'schedule', 'roster', 'classroom','seating','reminders','task','student'].includes(args.kind)) throw Error('QUERY_UNSUPPORTED');
  const classes = listClasses();
  const validDates = () => {if(!args.from||!args.to||args.from>args.to||Date.parse(args.to)-Date.parse(args.from)>30*86400000)throw Error('DATE_RANGE_REQUIRED');};
  if (args.kind === 'reminders') {
    if(args.classId&&!classes.some(c=>c.id===args.classId))throw Error('CLASS_NOT_FOUND');
    if(args.from||args.to)validDates();
    const all=listReminders().filter(r=>!args.classId||r.classId===args.classId);
    const filtered=all.filter(r=>{const start=(r.startAt||r.dueAt||'').slice(0,10),end=(r.endAt||r.dueAt||r.startAt||'').slice(0,10);return !args.from||(Boolean(start)&&start<=args.to!&&end>=args.from);});
    return {ok:true,data:{reminders:filtered.slice(args.offset,args.offset+args.limit),total:filtered.length,offset:args.offset,limit:args.limit,scope:'包含所有日程状态；日期筛选按开始至结束/截止区间重叠，时间待定条目不匹配日期',excludedUndated:args.from?all.filter(r=>!r.startAt&&!r.dueAt).length:0},observedAt,completeness:args.offset===0&&filtered.length<=args.limit?'complete':'partial',sources:[{title:'提醒日程',url:'/?page=schedule'}]};
  }
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
  if(args.kind==='seating'){
    const layout=getClassroomLayout(args.classId)!;
    const students=new Map(listStudents(args.classId).map(s=>[s.id,s]));
    return {ok:true,data:{class:classes.find(c=>c.id===args.classId),saved:Boolean(layout.updatedAt),layout:{...layout,seats:layout.seats.map(seat=>({...seat,name:students.get(seat.studentId)?.name??null,studentNo:students.get(seat.studentId)?.studentNo??null,position:seat.seatIndex>=120?`${seat.seatIndex<122?'讲台左':'讲台右'}${seat.seatIndex%2+1}座`:`第${Math.floor(seat.seatIndex/layout.columnCount)+1}排第${seat.seatIndex%layout.columnCount+1}列`}))},scope:'saved=false表示未保存座位安排，默认行列数不代表实际已排座位。'},observedAt,completeness:layout.seats.some(seat=>!students.has(seat.studentId))?'partial':'complete',sources:[{title:'班级座位图',url:'/?page=classroom&classId='+encodeURIComponent(args.classId)}]};
  }
  if(args.kind==='task'){
    if(!args.taskId)throw Error('TASK_REQUIRED');
    const detail=requireTask(args.taskId);
    if(detail.task.classId!==args.classId)throw Error('TASK_CLASS_MISMATCH');
    if(args.studentId&&!detail.participants.some(p=>p.studentId===args.studentId))throw Error('TASK_PARTICIPANT_NOT_FOUND');
    const participants=detail.participants.filter(p=>!args.studentId||p.studentId===args.studentId);
    const participantIds=new Set(participants.map(p=>p.id));
    const events=detail.events.filter(e=>!args.studentId||participantIds.has(e.participantId??'')).slice().reverse();
    return {ok:true,data:{task:detail.task,counts:detail.counts,participants:participants.slice(args.offset,args.offset+args.limit),participantTotal:participants.length,events:events.slice(args.offset,args.offset+args.limit),eventTotal:events.length,offset:args.offset,limit:args.limit,scope:'counts为全任务计数；participants及events为当前筛选分页，事件按新到旧排列。result=null是未记录，不代表未完成。'},observedAt,completeness:args.offset===0&&Math.max(participants.length,events.length)<=args.limit?'complete':'partial',sources:[{title:'课堂任务明细与历史',url:'/?page=classroom-tasks&taskId='+encodeURIComponent(args.taskId)}]};
  }
  if(args.kind==='student'){
    validDates();
    if(!args.studentId)throw Error('STUDENT_REQUIRED');
    const student=listStudents(args.classId).find(s=>s.id===args.studentId);
    if(!student)throw Error('STUDENT_NOT_FOUND');
    const behavior=listBehavior({classId:args.classId,studentId:student.id,from:args.from!,to:args.to!,limit:args.limit,offset:args.offset});
    const tasks=studentClassroomTasks(student.id).tasks.filter(t=>t.classId===args.classId&&t.checkDate>=args.from!&&t.checkDate<=args.to!);
    const observations=student.observationHistory.filter(o=>o.date.slice(0,10)>=args.from!&&o.date.slice(0,10)<=args.to!);
    return {ok:true,data:{student:{id:student.id,name:student.name,studentNo:student.studentNo,status:student.status},behavior,tasks:tasks.slice(args.offset,args.offset+args.limit),taskTotal:tasks.length,observations:observations.slice(args.offset,args.offset+args.limit),observationTotal:observations.length,offset:args.offset,limit:args.limit,scope:'仅指定班级和日期内的已记录事实；未记录不等于没有发生，不是完整学生画像。'},observedAt,completeness:args.offset===0&&Math.max(behavior.total,tasks.length,observations.length)<=args.limit?'complete':'partial',sources:[{title:'学生课堂记录与观察',url:'/?page=diagnosis-workspace&classId='+encodeURIComponent(args.classId)+'&studentId='+encodeURIComponent(student.id)}]};
  }
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
    limit: args.limit, offset: args.offset,
  });
  const tasks = listClassroomTasks({
    classId: args.classId,
    from: args.from,
    to: args.to,
    limit: args.limit, offset: args.offset,
  });
  return {
    ok: true,
    data: { behavior, tasks: tasks.tasks, taskTotal: tasks.total,offset:args.offset,limit:args.limit },
    observedAt,
    completeness:
      args.offset>0 || behavior.total > args.limit || tasks.total > args.limit ? 'partial' : 'complete',
    sources: [
      { title: '课堂任务与表现（指定日期）', url: '/?page=classroom-tasks' },
    ],
  };
}
