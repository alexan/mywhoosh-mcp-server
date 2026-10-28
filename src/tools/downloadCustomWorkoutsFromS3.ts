import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { asMcpError, McpError } from './utils/toolHelpers.js';
import { unzipSync, strFromU8 } from 'fflate';

export const method = 'downloadCustomWorkoutsFromS3';
export const description = 'Download and extract all custom workouts from MyWhoosh S3 bucket. Returns the workout data as parsed JSON objects.';
export const parameters = z.object({});

export async function handler(
  _args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const whooshId = extra.client.getWhooshId();
    if (!whooshId) throw new McpError(-32600, 'Not authenticated');

    // Get S3 URL
    const uploadInfo = await extra.client.get(`/client/custom-workout-upload/${whooshId}`, { 
      baseUrl: 'COACHING' 
    }) as { data: { workoutZipUrl: string; workoutCount: number } };

    if (!uploadInfo.data?.workoutZipUrl) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ workouts: [], count: 0 }, null, 2) }],
      };
    }

    // Download ZIP from S3
    const response = await fetch(uploadInfo.data.workoutZipUrl);
    if (!response.ok) {
      throw new McpError(-32603, `Failed to download workouts: ${response.statusText}`);
    }

    // Extract ZIP (fflate: adm-zip needs node fs, which Workers lack)
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()), {
      filter: (file) => file.name.endsWith('.json'),
    });

    const workouts = [];
    for (const [name, data] of Object.entries(files)) {
      try {
        const workout = JSON.parse(strFromU8(data));
        workouts.push(workout);
      } catch (parseError) {
        console.error(`Failed to parse ${name}:`, parseError);
      }
    }

    return {
      content: [{ 
        type: 'text', 
        text: JSON.stringify({ 
          workouts, 
          count: workouts.length,
          totalCount: uploadInfo.data.workoutCount 
        }, null, 2) 
      }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
