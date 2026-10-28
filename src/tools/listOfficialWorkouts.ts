import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MyWhooshClient } from '../clients/mywhoosh.js';
import { LIBRARY } from '../data/officialWorkouts.generated.js';
import { asMcpError, McpError, sportParameter } from './utils/toolHelpers.js';

export const method = 'listOfficialWorkouts';
export const description = `List MyWhoosh's official workout library for one sport, with IDs.

Use the Id as taskTypeId in createTask (taskType E_Simple_Workout) to schedule an official workout.
Without workoutId: a summary per workout (Id, Name, Category, Time in seconds, TSS, IF, StepCount, Author),
filtered by search and category. With workoutId: that workout in full, steps in WorkoutStepsArray.

The library is prepared offline (npm run library) from the file the app downloads.`;
export const parameters = z.object({
  sport: sportParameter,
  search: z.string().optional().describe('Only workouts whose name contains this text (case-insensitive)'),
  category: z.string().optional().describe('Only workouts whose category name contains this text, e.g. "Sweetspot"'),
  workoutId: z.number().optional().describe('Return only this workout, with all steps'),
  limit: z.number().int().min(1).max(1000).default(100).describe('Maximum number of workouts in the summary'),
});

// game-title-data field holding the library zip per sport, to tell when the bundled copy is outdated
const ZIP_URL_FIELD = {
  cycling: 'MyWhooshWorkoutsZipURL',
  running: 'MyWhooshWorkoutsZipURLRunning',
  rowing: 'MyWhooshWorkoutsZipURLRowing',
} as const;

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const library = LIBRARY[args.sport];

    if (args.workoutId !== undefined) {
      const entry = library.workouts.find((w) => w.summary.Id === args.workoutId);
      if (!entry) throw new McpError(-32602, `No official ${args.sport} workout with Id ${args.workoutId}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(entry.workout, null, 2) }],
      };
    }

    const search = args.search?.toLowerCase();
    const category = args.category?.toLowerCase();
    const matches = library.workouts
      .map((w) => w.summary)
      .filter((w) => !search || w.Name.toLowerCase().includes(search))
      .filter((w) => !category || w.Category.toLowerCase().includes(category));

    // one cheap call tells whether MyWhoosh has published a newer library since it was bundled
    const titleData = (await extra.client.get('/game/game-title-data')) as Record<string, unknown>;
    const currentUrl = titleData[ZIP_URL_FIELD[args.sport]];
    const outdated = typeof currentUrl === 'string' && currentUrl !== library.sourceUrl;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workouts: matches.slice(0, args.limit),
          count: matches.length,
          total: library.workouts.length,
          preparedAt: library.generatedAt,
          ...(outdated ? { message: `MyWhoosh has published a newer ${args.sport} library; the list may be outdated` } : {}),
        }, null, 2),
      }],
    };
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw asMcpError(e);
  }
}
