export {assistantCapabilityVersion,assistantObjects,assistantFilterOptions} from './assistantCapabilityDefinitions.mjs';
import {assistantObjects} from './assistantCapabilityDefinitions.mjs';
export type AssistantObjectType = keyof typeof assistantObjects;
export interface AssistantObjectRef {type: AssistantObjectType; id: string; parentId?: string}
