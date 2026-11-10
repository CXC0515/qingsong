/** @license SPDX-License-Identifier: Apache-2.0 */

import 'dotenv/config';
import path from 'node:path';
import { runtimeConfig } from '../config/runtimeConfig';
import { createManagedProductSnapshot } from '../services/operations/productSnapshot';

const automaticRoot = path.resolve(process.argv[2] ?? path.join(runtimeConfig.backupDirectory, 'automatic'));
const result = await createManagedProductSnapshot(runtimeConfig.dataRoot, automaticRoot, 1);
console.log(JSON.stringify({
  event: result.status === 'created' ? 'production_snapshot_created' : 'production_snapshot_skipped_unchanged',
  snapshotPath: result.snapshotPath,
  comparedWith: result.comparedWith,
  pruned: result.pruned,
}));
