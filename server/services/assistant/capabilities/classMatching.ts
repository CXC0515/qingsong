import {normalizeClassLabel,gradeNumberFromText,classNumberFromText} from '../../schedule/classEntityMatcher';
/** Reuse the existing schedule identity parser; only return candidates, never choose one. */
export function matchesClass(query:string,c:{name:string;grade:string;term:string}){
 if(!query)return true;const q=normalizeClassLabel(query),name=normalizeClassLabel(c.name),grade=normalizeClassLabel(c.grade);
 if(q===name||q===grade||q===normalizeClassLabel(c.term))return true;
 const queryGrade=gradeNumberFromText(q),candidateGrade=gradeNumberFromText(c.name)??gradeNumberFromText(c.grade);
 const queryNumber=classNumberFromText(q),candidateNumber=classNumberFromText(c.name);
 const identityOnly=/^(?:(?:初中|初|高中|高)[一二三123]|[零〇一二两三四五六七八九十\d]+年级)?(?:[零〇一二两三四五六七八九十\d]+班)?$/.test(q);
 if(identityOnly&&(queryGrade!==undefined||queryNumber!==undefined))return (queryGrade===undefined||queryGrade===candidateGrade)&&(queryNumber===undefined||queryNumber===candidateNumber);
 if(/\d|[零〇一二两三四五六七八九十]/.test(q))return false;
 return name.includes(q)||grade.includes(q)||normalizeClassLabel(c.term).includes(q);
}
