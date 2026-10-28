import test from 'node:test';
import assert from 'node:assert/strict';
import {readReviewPreferences,saveReviewPreferences,validateReviewPreferences,defaultReviewPreferences} from './reviewPreferences';
test('review markers isolate account keys and reject invalid/corrupt preferences',()=>{
 const values=new Map<string,string>();const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});
 try{saveReviewPreferences('a',{human:.4,auto:.8,score:.6});assert.equal(readReviewPreferences('a').score,.6);assert.deepEqual(readReviewPreferences('b'),defaultReviewPreferences);assert.equal(validateReviewPreferences({human:.9,auto:.5,score:.6}),false);assert.throws(()=>saveReviewPreferences('a',{human:.9,auto:.5,score:.6}));values.set('review-markers:a','{bad');assert.deepEqual(readReviewPreferences('a'),defaultReviewPreferences);}finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
