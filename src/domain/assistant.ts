/** Shared teaching-assistant HTTP view contract. */
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status?: string;
  sources?: Array<{ title: string; url: string }>;
};
export type ChatSession = {
  id: string;
  title: string;
  provider: string;
  model: string;
  updatedAt: string;
  status:
    | 'idle'
    | 'queued'
    | 'running'
    | 'cancelled'
    | 'interrupted'
    | 'failed';
  error?: string;
  nativeStarted?: boolean;
  messages: ChatMessage[];
  requestIds: string[];
};
