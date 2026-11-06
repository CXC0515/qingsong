import type { DocumentNode, RichDocument } from "../../../src/domain/document";
import { PreparationError } from "./preparationService";

const textOf=(node:DocumentNode):string=>node.text??(node.content??[]).map(textOf).join("");
function paragraphs(document:RichDocument) {
  const result:{id?:string;text:string}[]=[];
  const visit=(node:DocumentNode)=>{
    if(node.type==="paragraph")result.push({id:typeof node.attrs?.id==="string"?node.attrs.id:undefined,text:textOf(node).trim()});
    else node.content?.forEach(visit);
  };
  document.content.forEach(visit);return result;
}
// Deliberately narrow sentence-level checks. "教学预设", student answers and
// uncertainty about the text are valid teaching content, not forbidden words.
const generationNotes=[
  /^(?:本班|当前班级)(?:的)?(?:具体)?(?:学习情况|学情)(?:信息|资料)?(?:尚未|暂未|未)(?:提供|获取|明确|给出)/u,
  /^以下(?:内容)?(?:是|为)(?:我|AI|模型)的(?:内部)?(?:思考过程|推理过程|自检过程)/iu,
  /^由于(?:你|您|用户|教师)(?:尚未|暂未|没有|未)提供(?:本班)?(?:具体)?(?:学情|学生情况|学习情况)/u,
];
/** Validate only newly written assistant paragraphs. Never edit teacher text or old versions. */
export function assertCandidateDelivery(original:RichDocument,candidate:RichDocument) {
  const originalParagraphs=paragraphs(original);
  const byId=new Map(originalParagraphs.filter(p=>p.id).map(p=>[p.id,p.text]));
  const unkeyed=new Set(originalParagraphs.filter(p=>!p.id).map(p=>p.text));
  for(const paragraph of paragraphs(candidate)) {
    if(paragraph.id?byId.get(paragraph.id)===paragraph.text:unkeyed.has(paragraph.text))continue;
    if(generationNotes.some(pattern=>pattern.test(paragraph.text)))
      throw new PreparationError("GENERATION_NOTE_IN_DOCUMENT",`候选正文含生成说明${paragraph.id?"（段落"+paragraph.id+"）":""}，尚未保存候选或修改正式正文。请将缺失信息、生成限制等说明移到助手回复；正文保留教学安排，不编造本班学情。`,422);
  }
}
