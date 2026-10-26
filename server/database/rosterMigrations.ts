/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        grade TEXT NOT NULL,
        term TEXT NOT NULL,
        head_teacher TEXT NOT NULL,
        chinese_teacher TEXT NOT NULL,
        textbook_version TEXT NOT NULL,
        default_submit_time TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (term, name)
      );

      CREATE TABLE students (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        gender TEXT NOT NULL CHECK (gender IN ('male', 'female')),
        status TEXT NOT NULL CHECK (status IN ('good', 'warning', 'risk', 'outstanding')),
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE class_memberships (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        student_no TEXT NOT NULL,
        is_representative INTEGER NOT NULL DEFAULT 0 CHECK (is_representative IN (0, 1)),
        status TEXT NOT NULL CHECK (status IN ('active', 'transferred', 'withdrawn', 'suspended')),
        joined_at TEXT NOT NULL,
        left_at TEXT,
        UNIQUE (class_id, student_no)
      );

      CREATE INDEX class_memberships_student_idx
        ON class_memberships (student_id);
      CREATE INDEX class_memberships_class_status_idx
        ON class_memberships (class_id, status);
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE classes ADD COLUMN student_count INTEGER;
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE classroom_layouts (
        class_id TEXT PRIMARY KEY REFERENCES classes(id) ON UPDATE CASCADE ON DELETE CASCADE,
        row_count INTEGER NOT NULL CHECK (row_count BETWEEN 1 AND 10),
        column_count INTEGER NOT NULL CHECK (column_count BETWEEN 1 AND 12),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE classroom_seats (
        class_id TEXT NOT NULL REFERENCES classroom_layouts(class_id) ON UPDATE CASCADE ON DELETE CASCADE,
        seat_index INTEGER NOT NULL CHECK (seat_index >= 0),
        student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE CASCADE,
        PRIMARY KEY (class_id, seat_index),
        UNIQUE (class_id, student_id)
      );

      CREATE TRIGGER classroom_seat_student_must_be_in_class
      BEFORE INSERT ON classroom_seats
      WHEN NOT EXISTS (
        SELECT 1 FROM class_memberships
        WHERE class_id = NEW.class_id
          AND student_id = NEW.student_id
          AND status IN ('active', 'suspended')
      )
      BEGIN
        SELECT RAISE(ABORT, 'CLASSROOM_STUDENT_NOT_IN_CLASS');
      END;

      CREATE TRIGGER classroom_seat_must_fit_layout
      BEFORE INSERT ON classroom_seats
      WHEN NEW.seat_index >= (
        SELECT row_count * column_count FROM classroom_layouts WHERE class_id = NEW.class_id
      )
      BEGIN
        SELECT RAISE(ABORT, 'CLASSROOM_SEAT_OUT_OF_RANGE');
      END;

      CREATE TRIGGER remove_inactive_student_from_classroom
      AFTER UPDATE OF status ON class_memberships
      WHEN OLD.status IN ('active', 'suspended') AND NEW.status NOT IN ('active', 'suspended')
      BEGIN
        DELETE FROM classroom_seats
        WHERE class_id = OLD.class_id AND student_id = OLD.student_id;
      END;
    `
  },
  {
    version: 4,
    sql: `
      CREATE TABLE schedule_items (
        id TEXT PRIMARY KEY,
        day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
        period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
        title TEXT NOT NULL,
        class_id TEXT REFERENCES classes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        class_name TEXT NOT NULL DEFAULT '',
        item_type TEXT NOT NULL CHECK (item_type IN ('class', 'meeting', 'research', 'reminder', 'parent-comm', 'grading')),
        time_text TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('teacher', 'class')),
        teacher_name TEXT NOT NULL DEFAULT '',
        confidence REAL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX schedule_items_scope_day_idx ON schedule_items (scope, day, period);
      CREATE INDEX schedule_items_class_idx ON schedule_items (class_id, day, period);

      CREATE TABLE timer_reminders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        class_id TEXT REFERENCES classes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        class_name TEXT NOT NULL DEFAULT '',
        time_text TEXT NOT NULL,
        repeat_rule TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
        important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
        urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    version: 5,
    sql: `
      CREATE TABLE schedule_periods (
        period INTEGER PRIMARY KEY CHECK (period BETWEEN 1 AND 12),
        label TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO schedule_periods (period, label, start_time, end_time, updated_at) VALUES
        (1, '第一节', '08:00', '08:45', CURRENT_TIMESTAMP),
        (2, '第二节', '08:55', '09:40', CURRENT_TIMESTAMP),
        (3, '第三节', '10:00', '10:45', CURRENT_TIMESTAMP),
        (4, '第四节', '10:55', '11:40', CURRENT_TIMESTAMP),
        (5, '第五节', '13:30', '14:15', CURRENT_TIMESTAMP),
        (6, '第六节', '14:25', '15:10', CURRENT_TIMESTAMP),
        (7, '第七节', '15:20', '16:05', CURRENT_TIMESTAMP),
        (8, '第八节', '16:15', '17:00', CURRENT_TIMESTAMP);
    `
  },
  {
    version: 6,
    sql: `
      ALTER TABLE timer_reminders ADD COLUMN time_kind TEXT NOT NULL DEFAULT 'none'
        CHECK (time_kind IN ('none', 'point', 'range'));
      ALTER TABLE timer_reminders ADD COLUMN start_at TEXT;
      ALTER TABLE timer_reminders ADD COLUMN end_at TEXT;

      UPDATE timer_reminders
      SET time_kind = 'point', start_at = due_at
      WHERE due_at IS NOT NULL AND due_at <> '';

      CREATE INDEX timer_reminders_time_idx
        ON timer_reminders (status, time_kind, start_at, end_at);
    `
  },
  {
    version: 7,
    sql: `
      PRAGMA foreign_keys = OFF;
      CREATE TABLE timer_reminders_next (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        class_id TEXT REFERENCES classes(id) ON UPDATE CASCADE ON DELETE SET NULL,
        class_name TEXT NOT NULL DEFAULT '',
        time_text TEXT NOT NULL,
        repeat_rule TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'inactive')),
        important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
        urgent INTEGER NOT NULL DEFAULT 0 CHECK (urgent IN (0, 1)),
        due_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        time_kind TEXT NOT NULL DEFAULT 'none' CHECK (time_kind IN ('none', 'point', 'range')),
        start_at TEXT,
        end_at TEXT,
        completed_at TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        assumption_warning TEXT NOT NULL DEFAULT '',
        recurrence_json TEXT,
        series_id TEXT,
        occurrence_number INTEGER NOT NULL DEFAULT 1,
        generated_from_id TEXT
      );
      INSERT INTO timer_reminders_next (
        id, name, class_id, class_name, time_text, repeat_rule, status, important, urgent, due_at,
        created_at, updated_at, time_kind, start_at, end_at
      ) SELECT id, name, class_id, class_name, time_text, repeat_rule, status, important, urgent, due_at,
        created_at, updated_at, time_kind, start_at, end_at FROM timer_reminders;
      DROP TABLE timer_reminders;
      ALTER TABLE timer_reminders_next RENAME TO timer_reminders;
      CREATE INDEX timer_reminders_time_idx ON timer_reminders (status, time_kind, start_at, end_at);
      CREATE INDEX timer_reminders_quadrant_idx ON timer_reminders (important, urgent, sort_order);
      CREATE UNIQUE INDEX timer_reminders_generated_from_idx ON timer_reminders (generated_from_id) WHERE generated_from_id IS NOT NULL;
      PRAGMA foreign_keys = ON;
    `
  },
  {
    version: 8,
    sql: `
      ALTER TABLE class_memberships DROP COLUMN is_representative;

      CREATE TABLE committee_roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO committee_roles (id, name, sort_order, is_default, created_at, updated_at)
      VALUES ('committee-role-monitor', '班长', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

      CREATE TABLE committee_assignments (
        class_id TEXT NOT NULL REFERENCES classes(id) ON UPDATE CASCADE ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON UPDATE CASCADE ON DELETE CASCADE,
        role_id TEXT NOT NULL REFERENCES committee_roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        PRIMARY KEY (class_id, student_id, role_id)
      );

      CREATE INDEX committee_assignments_student_idx
        ON committee_assignments (student_id, class_id);
      CREATE INDEX committee_assignments_role_idx
        ON committee_assignments (role_id, class_id);

      CREATE TRIGGER committee_student_must_be_in_class
      BEFORE INSERT ON committee_assignments
      WHEN NOT EXISTS (
        SELECT 1 FROM class_memberships
        WHERE class_id = NEW.class_id
          AND student_id = NEW.student_id
          AND status IN ('active', 'suspended')
      )
      BEGIN
        SELECT RAISE(ABORT, 'COMMITTEE_STUDENT_NOT_IN_CLASS');
      END;

      CREATE TRIGGER remove_inactive_student_from_committee
      AFTER UPDATE OF status ON class_memberships
      WHEN OLD.status IN ('active', 'suspended') AND NEW.status NOT IN ('active', 'suspended')
      BEGIN
        DELETE FROM committee_assignments
        WHERE class_id = OLD.class_id AND student_id = OLD.student_id;
      END;
    `
  },
  {
    version: 9,
    sql: `
      UPDATE timer_reminders
      SET time_text = '时间待定',
          time_kind = 'none',
          start_at = NULL,
          end_at = NULL,
          due_at = NULL,
          assumption_warning = '',
          updated_at = CURRENT_TIMESTAMP
      WHERE assumption_warning <> '';
    `
  },
  {
    version: 10,
    sql: `
      UPDATE timer_reminders
      SET name = '委派班委', updated_at = CURRENT_TIMESTAMP
      WHERE name = '选课代表';
    `
  },
  {
    version: 11,
    sql: `
      ALTER TABLE classes DROP COLUMN chinese_teacher;
    `
  }
  ,{
    version: 12,
    sql: `
      CREATE TABLE classroom_tasks (id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT, data_json TEXT NOT NULL);
      CREATE INDEX classroom_tasks_class_idx ON classroom_tasks(class_id);
      CREATE TABLE classroom_task_participants (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE RESTRICT,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT, data_json TEXT NOT NULL, UNIQUE(task_id,student_id)
      );
      CREATE INDEX classroom_task_participants_student_idx ON classroom_task_participants(student_id);
      CREATE TABLE classroom_task_operations (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE RESTRICT,
        fingerprint TEXT NOT NULL, data_json TEXT NOT NULL, result_json TEXT NOT NULL
      );
      CREATE TABLE classroom_task_events (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE RESTRICT,
        participant_id TEXT REFERENCES classroom_task_participants(id) ON DELETE RESTRICT,
        operation_id TEXT NOT NULL REFERENCES classroom_task_operations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED, data_json TEXT NOT NULL
      );
      CREATE INDEX classroom_task_events_task_idx ON classroom_task_events(task_id);
      CREATE TRIGGER classroom_task_event_identity BEFORE INSERT ON classroom_task_events
      WHEN NEW.participant_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM classroom_task_participants WHERE id = NEW.participant_id AND task_id = NEW.task_id
      ) BEGIN SELECT RAISE(ABORT, 'TASK_PARTICIPANT_MISMATCH'); END;
    `
  }
  ,{
    version: 13,
    sql: `
      CREATE TABLE classroom_quick_rounds (
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        project_key TEXT NOT NULL, check_date TEXT NOT NULL, round INTEGER NOT NULL CHECK(round > 0),
        task_id TEXT NOT NULL UNIQUE REFERENCES classroom_tasks(id) ON DELETE RESTRICT,
        PRIMARY KEY(class_id,project_key,check_date,round)
      );
      CREATE TABLE classroom_quick_requests (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES classroom_tasks(id) ON DELETE RESTRICT);
      CREATE TABLE classroom_behavior_events (
        id TEXT PRIMARY KEY, operation_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        target_id TEXT UNIQUE REFERENCES classroom_behavior_events(id) ON DELETE RESTRICT,
        occurred_date TEXT NOT NULL, data_json TEXT NOT NULL
      );
      CREATE INDEX classroom_behavior_student_date ON classroom_behavior_events(student_id,occurred_date);
      CREATE INDEX classroom_behavior_class_date ON classroom_behavior_events(class_id,occurred_date);
    `
  }

  ,{
    version: 14,
    sql: `
      CREATE TABLE classroom_record_projects (
        project_key TEXT PRIMARY KEY, category TEXT NOT NULL CHECK(category IN ('study','behavior')),
        label TEXT NOT NULL COLLATE NOCASE, mode TEXT NOT NULL CHECK(mode IN ('completion','pass','event')),
        operation_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(category,label)
      );
    `
  }

  ,{
    version: 15,
    sql: `
      CREATE TABLE classroom_project_names (
        project_key TEXT PRIMARY KEY, label TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0), updated_at TEXT NOT NULL
      );
      CREATE TABLE classroom_project_renames (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, data_json TEXT NOT NULL);
      CREATE TABLE classroom_lesson_rounds (
        schedule_item_id TEXT NOT NULL, check_date TEXT NOT NULL, project_key TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        round INTEGER NOT NULL CHECK(round>0), task_id TEXT NOT NULL UNIQUE REFERENCES classroom_tasks(id) ON DELETE RESTRICT,
        lesson_json TEXT NOT NULL,
        PRIMARY KEY(schedule_item_id,check_date,project_key,round)
      );
    `
  }

  ,{
    version: 16,
    sql: `
      CREATE TABLE classroom_behavior_rounds (
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        project_key TEXT NOT NULL, occurred_date TEXT NOT NULL,
        lesson_key TEXT NOT NULL, round INTEGER NOT NULL CHECK(round > 1),
        operation_id TEXT NOT NULL UNIQUE, fingerprint TEXT NOT NULL,
        PRIMARY KEY(class_id,project_key,occurred_date,lesson_key,round)
      );
      CREATE INDEX classroom_behavior_scope ON classroom_behavior_events(
        class_id,occurred_date,json_extract(data_json,'$.kind'),
        COALESCE(json_extract(data_json,'$.scheduleItemId'),''),COALESCE(json_extract(data_json,'$.round'),1)
      );
    `
  }
];

export const runRosterMigrations = (database: Database.Database) => {
  const currentVersion = database.pragma('user_version', { simple: true }) as number;
  const pending = migrations.filter(migration => migration.version > currentVersion);
  if (!pending.length) return;

  database.transaction(() => {
    pending.forEach(migration => {
      database.exec(migration.sql);
      database.pragma(`user_version = ${migration.version}`);
    });
  })();
};
