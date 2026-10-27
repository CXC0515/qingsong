import test from 'node:test';import assert from 'node:assert/strict';
import {assistantSourceRoute} from './assistantSourceRoute';
test('source links resolve only supported teacher pages and opaque IDs',()=>{
  for(const page of ['schedule','classroom','student-mgmt','diagnosis-workspace','classroom-tasks'])assert.equal(assistantSourceRoute('https://fixture.test/?page='+page).page,page);
  assert.deepEqual(assistantSourceRoute('https://fixture.test/?page=diagnosis-workspace&classId=c-1&studentId=s_1'),{page:'diagnosis-workspace',classId:'c-1',studentId:'s_1'});
  assert.equal(assistantSourceRoute('https://fixture.test/admin?page=schedule').page,'workbench');
  assert.equal(assistantSourceRoute('https://fixture.test/?page=evil&classId=../../bad').classId,null);
  assert.equal(assistantSourceRoute('https://fixture.test/?page=evil').page,'workbench');
});
