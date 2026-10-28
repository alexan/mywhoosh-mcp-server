import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';

export const method = 'deleteCustomWorkout';
export const description = 'Delete a custom workout from MyWhoosh. Known MyWhoosh backend bug: fails with a sportsModeType NaN error once any custom workout was uploaded through the API (https://github.com/isllabres/mywhoosh-mcp-server/issues/1).';
export const parameters = z.object({
  workoutId: z.number().describe('Workout ID to delete'),
});

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    const result = await extra.client.delete(
      `/client/custom-workout-upload/${whooshId}/${args.workoutId}`,
      { baseUrl: 'COACHING' }
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
