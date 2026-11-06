import test from 'node:test';import assert from 'node:assert/strict';
import {titleFromPrompt} from './official-session-title.mjs';
test('human session titles strip reference tokens and preserve the instruction',()=>{assert.equal(titleFromPrompt('[[青松教案:f2dc315d-33a5-54d5-a4b7-80e30b16d909]] 修改目标',['陋室铭']),'陋室铭 · 修改目标');assert.equal(titleFromPrompt('[[青松教案:f2dc315d-33a5-54d5-a4b7-80e30b16d909]]'),'教学讨论');assert.equal(titleFromPrompt('帮我读一下'),'帮我读一下');});
