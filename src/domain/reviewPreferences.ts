export interface ReviewPreferences {human:number;auto:number;score:number}
export const defaultReviewPreferences:ReviewPreferences={human:.7,auto:.9,score:.75};
export function validateReviewPreferences(value:unknown):value is ReviewPreferences{
  if(!value||typeof value!=='object')return false;const v=value as ReviewPreferences;
  return [v.human,v.auto,v.score].every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&v.human<v.auto;
}
export function readReviewPreferences(userId:string):ReviewPreferences{try{const value=JSON.parse(localStorage.getItem('review-markers:'+userId)||'null');if(validateReviewPreferences(value))return value;}catch{}return {...defaultReviewPreferences};}
export function saveReviewPreferences(userId:string,value:ReviewPreferences){if(!validateReviewPreferences(value))throw Error('阈值应在0至100%之间，人工复核阈值必须小于较高质量阈值。');localStorage.setItem('review-markers:'+userId,JSON.stringify(value));}
