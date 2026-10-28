// Types for MyWhoosh's official workout library. The data itself is generated locally by
// `npm run library` into officialWorkouts.generated.ts (git-ignored) and bundled with the Worker.
export interface OfficialWorkoutSummary {
  Id: number;
  Name: string;
  Category: string;
  Time: number;
  TSS?: number;
  IF?: number;
  StepCount?: number;
  Author?: string;
}

export interface OfficialSportLibrary {
  sourceUrl: string;
  generatedAt: string;
  // workout: the file as MyWhoosh publishes it, with steps always in WorkoutStepsArray
  workouts: { summary: OfficialWorkoutSummary; workout: Record<string, unknown> }[];
}

export type OfficialLibrary = Record<'cycling' | 'running' | 'rowing', OfficialSportLibrary>;
