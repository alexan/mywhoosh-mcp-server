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
Like the app, running workouts carry only TSS and rowing workouts no TSS, IF or KJ.

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

// metrics the app shows per sport; the others carry copied placeholder values (rowing: TSS 23 / IF 0.8 /
// KJ 150 for every workout, running: one IF and KJ for all) and are left out of every response
const METRICS = ['TSS', 'IF', 'KJ'] as const;
const SHOWN_METRICS: Record<keyof typeof ZIP_URL_FIELD, readonly (typeof METRICS)[number][]> = {
  cycling: ['TSS', 'IF', 'KJ'],
  running: ['TSS'],
  rowing: [],
};

function withoutHiddenMetrics<T extends object>(obj: T, sport: keyof typeof ZIP_URL_FIELD): Partial<T> {
  const out: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  for (const m of METRICS) if (!SHOWN_METRICS[sport].includes(m)) delete out[m];
  return out as Partial<T>;
}

export async function handler(
  args: z.infer<typeof parameters>,
  extra: { client: MyWhooshClient }
): Promise<CallToolResult> {
  try {
    const library = LIBRARY[args.sport];

    if (args.workoutId !== undefined) {
      const workout = library.workouts.find((w) => w.Id === args.workoutId);
      if (!workout) throw new McpError(-32602, `No official ${args.sport} workout with Id ${args.workoutId}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(withoutHiddenMetrics(workout, args.sport), null, 2) }],
      };
    }

    const search = args.search?.toLowerCase();
    const category = args.category?.toLowerCase();
    const categories: Record<number, string> = library.categories;
    const matches = library.workouts
      .map((w) => withoutHiddenMetrics({
        Id: w.Id,
        Name: w.Name,
        Category: categories[w.CategoryId] ?? String(w.CategoryId),
        Time: w.Time,
        TSS: w.TSS,
        IF: w.IF,
        StepCount: w.StepCount,
        Author: w.AuthorName || undefined,
      }, args.sport))
      .filter((w) => !search || w.Name!.toLowerCase().includes(search))
      .filter((w) => !category || w.Category!.toLowerCase().includes(category));

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
