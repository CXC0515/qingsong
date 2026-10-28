export type PersonalKind = 'rule' | 'memory';
export type PersonalStatus = 'candidate' | 'active' | 'disabled' | 'deleted' | 'expired';
export interface PersonalEntry {
  id: string; kind: PersonalKind; content: string; status: PersonalStatus;
  version: number; expiresAt: string | null; createdAt: string; updatedAt: string;
  source: {type: 'manual' | 'chat'; sessionId?: string; workspaceId?: string; messageId?:string; turn?:number};
}

export interface InstructionDocument {content:string; revision:string;}
