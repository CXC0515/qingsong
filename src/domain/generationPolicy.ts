export const generationFields = ['temperature','maxTokens','reasoningEffort'] as const;
export type GenerationField = typeof generationFields[number];
export interface GenerationValues {
  temperature: number | null; maxTokens: number; reasoningEffort: string | null;
}
export interface GenerationLimits { min: number; max: number; step: number }
export interface GenerationCapability { supported: boolean; reason: string; limits?: GenerationLimits; options?: string[] }
export interface GenerationModel {
  provider: string; id: string; name: string; protocol: string; maxOutputTokens: number;
  capabilities: Record<GenerationField, GenerationCapability>; values: GenerationValues;
}
export interface GenerationPolicy { revision: number; updatedAt: string | null; updatedBy: string | null; entries: Record<string, GenerationValues> }
export interface GenerationAdminState { policy: GenerationPolicy; models: GenerationModel[] }
export const generationKey = (provider: string, model: string) => JSON.stringify([provider, model]);
export const defaultGenerationValues = (): GenerationValues => ({ temperature:null, maxTokens:2048, reasoningEffort:null });
