import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePreparationInput,preparationToolParameters} from './preparationToolContract.mjs';

test('tool description names action-specific required fields and rejects fields from other actions',()=>{
 const schema=preparationToolParameters();
 assert.match(schema.action.description,/progress必填：taskId、stage/);
 assert.match(schema.action.description,/propose必填：taskId、baseRevision、content、summary、operationId/);
 assert.throws(()=>parsePreparationInput({action:'progress',taskId:'123e4567-e89b-42d3-a456-426614174000',stage:'读取',operationId:'123e4567-e89b-42d3-a456-426614174000'}),error=>error.issues.some(issue=>issue.field==='progress.operationId'&&issue.problem==='此动作不接受该字段'));
});
