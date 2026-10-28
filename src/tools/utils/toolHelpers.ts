import { McpError, ErrorCode, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { MyWhooshClient } from '../../clients/mywhoosh.js';

export { McpError };

export interface ToolModule {
  method: string;
  description: string;
  parameters: z.ZodObject<any>;
  handler: (args: any, extra: { client: MyWhooshClient }) => Promise<CallToolResult>;
}

export function asMcpError(error: unknown): McpError {
  const message = error instanceof Error ? error.message : String(error);
  return new McpError(ErrorCode.InternalError, message);
}
