import {spawnSync} from 'node:child_process';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DocumentParserConfig {
  paddleAccessToken: string;
  paddleBaseUrl?: string;
  paddleModel: string;
  paddleCommand: string;
  pythonCommand: string;
}

export const getDocumentParserConfig = (): DocumentParserConfig => ({
  paddleAccessToken: process.env.PADDLEOCR_ACCESS_TOKEN?.trim() ?? '',
  paddleBaseUrl: process.env.PADDLEOCR_BASE_URL?.trim() || undefined,
  paddleModel: process.env.PADDLEOCR_MODEL?.trim() || 'PaddleOCR-VL-1.6',
  paddleCommand: process.env.PADDLEOCR_COMMAND?.trim() || 'paddleocr',
  pythonCommand: process.env.PADDLEOCR_PYTHON?.trim() || 'python3'
});

export const isPaddleCloudConfigured = (config: DocumentParserConfig) => Boolean(config.paddleAccessToken);
let converterProbe: {command:string;at:number;ready:boolean}|undefined;
export function isDocxConverterReady(config:DocumentParserConfig) {
  if(converterProbe?.command===config.paddleCommand&&Date.now()-converterProbe.at<60000)return converterProbe.ready;
  const result=spawnSync(config.paddleCommand,['doc2md','--formats'],{encoding:'utf8',timeout:10000,maxBuffer:8192});
  const ready=result.status===0&&/docx/.test(result.stdout??'');
  converterProbe={command:config.paddleCommand,at:Date.now(),ready};return ready;
}
