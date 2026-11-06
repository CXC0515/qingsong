import test,{after} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {DocxMaterialParser} from './DocxMaterialParser';import {runWithWorkspace,type WorkspaceContext} from '../../context/workspaceContext';
const root=await mkdtemp(path.join(tmpdir(),'qs-docx-runtime-'));const context:WorkspaceContext={userId:'docx-test',workspaceId:'docx-workspace',role:'teacher',root,dataDirectory:path.join(root,'data'),uploadDirectory:path.join(root,'uploads')};
after(()=>rm(root,{recursive:true,force:true}));
test('missing Word converter reports a dependency failure before reading the document',()=>runWithWorkspace(context,async()=>{
 const parser=new DocxMaterialParser({pythonCommand:'python3',paddleCommand:path.join(root,'missing-paddleocr'),paddleAccessToken:'',paddleModel:'fixture'});const filePath=path.join(root,'fixture.docx');await writeFile(filePath,'fixture');
 await assert.rejects(parser.parse({assetId:randomUUID(),fileName:'fixture.docx',filePath,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),{code:'DOCX_CONVERTER_NOT_INSTALLED'});
}));
