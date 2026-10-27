import test from 'node:test';
import assert from 'node:assert/strict';
import {z} from 'zod';
import {teachingFailure, officialAssetCache} from './officialResponses';
test('parameter, class, date, authorization, queue and internal failures remain distinct', () => {
  for (const code of ['QUERY_UNSUPPORTED','CLASS_REQUIRED','CLASS_NOT_FOUND','DATE_RANGE_REQUIRED','QUEUE_FULL','INVALID_LEASE','CLOSING','TURN_CANCELLED']) {
    const failure = teachingFailure(Error(code));
    assert.equal(failure.code, code); assert.doesNotMatch(failure.message, /重新登录/); assert.match(failure.message, /未修改/);
  }
  assert.match(teachingFailure(Error('CLASS_NOT_FOUND')).message, /classes/);
  assert.match(teachingFailure(Error('QUERY_UNSUPPORTED')).message, /不能据此判断没有记录/);
  assert.match(teachingFailure(Error('AUTH_EXPIRED')).message, /重新登录/);
  assert.doesNotMatch(teachingFailure(Error('ACCESS_DENIED')).message, /重新登录/);
  assert.equal(teachingFailure(z.string().safeParse(3).error).code, 'INVALID_QUERY');
  assert.equal(teachingFailure(Error('SECRET_INTERNAL_DETAIL')).code, 'INTERNAL_ERROR');
  assert.doesNotMatch(teachingFailure(Error('SECRET_INTERNAL_DETAIL')).message, /SECRET/);
});
test('only static code is privately cached, data and documents are never cached', () => {
  assert.match(officialAssetCache('/assets/index-BXV-oxvX.js', 'application/javascript'), /private.*immutable/);
  assert.match(officialAssetCache('/plugins/', 'text/javascript'), /private.*must-revalidate/);
  assert.equal(officialAssetCache('/api/session/page', 'application/json'), 'no-store');
  assert.equal(officialAssetCache('/plugins/events', 'text/event-stream'), 'no-store');
  assert.equal(officialAssetCache('/', 'text/html'), 'no-store');
  assert.equal(officialAssetCache('/assets/user.json', 'application/json'), 'no-store');
});
