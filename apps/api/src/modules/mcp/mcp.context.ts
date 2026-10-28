import { AsyncLocalStorage } from 'async_hooks';

export interface McpAuthContext {
  userId: string;
  clientId: string;
  scopes: string[];
}

export const mcpContextStorage = new AsyncLocalStorage<McpAuthContext>();
