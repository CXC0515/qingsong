/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DocumentParserConfig } from '../../config/documentParserConfig';
import { uploadFilePath } from '../../context/workspaceContext';
import { MaterialParseWarning, NormalizedDocumentBlock } from '../../../src/domain/types';
import { MaterialParser, MaterialParserError, MaterialParserInput } from './MaterialParser';

interface WorkerResult {
  markdown: string;
  sourceMarkdown: string;
  blocks: NormalizedDocumentBlock[];
  resources: { fileName: string; mimeType: string; relativePath: string }[];
  warnings: MaterialParseWarning[];
  previewRelativePath?: string | null;
}

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const runWorker = (command: string, args: string[]) => new Promise<string>((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.on('error', error => reject(new MaterialParserError(error.message.includes('ENOENT') ? 'DOCX_PARSER_NOT_INSTALLED' : 'DOCX_PARSER_START_FAILED', { cause: error })));
  child.on('close', code => {
    if (code === 0) resolve(stdout);
    else reject(new MaterialParserError(stderr.includes('DOCX_CONVERTER_NOT_INSTALLED') ? 'DOCX_CONVERTER_NOT_INSTALLED' : stderr.includes('Unsupported format') ? 'DOCX_FORMAT_UNSUPPORTED' : 'DOCX_PARSE_FAILED', { cause: new Error(stderr || `Worker exited with ${code}`) }));
  });
});

export class DocxMaterialParser implements MaterialParser {
  constructor(private readonly config: DocumentParserConfig) {}

  supports(input: MaterialParserInput) {
    return input.mimeType === DOCX_MIME_TYPE || path.extname(input.fileName).toLowerCase() === '.docx';
  }

  async parse(input: MaterialParserInput) {
    const outputDirectory = uploadFilePath('parsed', input.assetId);
    await mkdir(outputDirectory, { recursive: true });
    const workerPath = path.resolve('server/workers/parse_docx.py');
    const stdout = await runWorker(this.config.pythonCommand, [
      workerPath,
      '--input', input.filePath,
      '--output-dir', outputDirectory,
      '--paddleocr-command', this.config.paddleCommand
    ]);
    let result: WorkerResult;
    try {
      result = JSON.parse(stdout) as WorkerResult;
    } catch (error) {
      throw new MaterialParserError('DOCX_PARSER_INVALID_OUTPUT', { cause: error });
    }
    return {
      assetId: input.assetId,
      sourceFormat: 'docx' as const,
      markdown: result.markdown,
      sourceMarkdown: result.sourceMarkdown,
      sourcePreviewUrl: result.previewRelativePath && input.publicAssetBaseUrl
        ? `${input.publicAssetBaseUrl}/derived/${result.previewRelativePath.split(path.sep).map(encodeURIComponent).join('/')}`
        : undefined,
      blocks: result.blocks,
      resources: result.resources.map(resource => ({
        id: randomUUID(),
        fileName: resource.fileName,
        mimeType: resource.mimeType,
        publicUrl: input.publicAssetBaseUrl
          ? `${input.publicAssetBaseUrl}/derived/${resource.relativePath.split(path.sep).map(encodeURIComponent).join('/')}`
          : ''
      })),
      warnings: result.warnings,
      parsedAt: new Date().toISOString()
    };
  }
}
