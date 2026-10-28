// Types for MyWhoosh's official workout library. The data itself is generated locally by
// `npm run library` into officialWorkouts.generated.ts (git-ignored, bundled with the Worker) as a
// literal checked against OfficialLibrary, so `npm run typecheck` fails when MyWhoosh changes the format.
//
// The published files spell keys two ways (id / Id, categoryId / CategoryId, ...); the build maps them to
// the PascalCase names below, the same names uploadCustomWorkout uses. The string unions list exactly the
// values seen in the library (2026-10-28): a new value is a format change worth looking at.

export type OfficialStepType = 'E_Normal' | 'E_WarmUp' | 'E_CoolDown' | 'E_FreeRide';

export interface OfficialWorkoutMessage {
  Id: number;
  Time: number;
  Message: string;
}

export interface OfficialWorkoutStep {
  Id: number;
  Pace?: number;
  IntervalId: number;
  WorkoutMessage: OfficialWorkoutMessage[];
  Rpm: number;
  StepType: OfficialStepType;
  Power: number;
  StartPower: number;
  EndPower: number;
  Time: number;
  IsManualGrade: boolean;
  ManualGradeValue: number;
  ShowAveragePower: boolean;
  FlatRoad: number;
}

export interface OfficialWorkout {
  Id: number;
  Name: string;
  Description: string;
  // running workouts are published as E_Ride too
  Mode: 'E_Ride' | 'Rowing';
  ERGMode: 'E_OFF';
  FTPMode: 'E_NoFTP' | 'E_AveragePerMinute';
  FTPMultiplier: number;
  IsRecovery: boolean;
  IsIntervals: boolean;
  IsTT: boolean;
  IsTSS: boolean;
  IsIF: boolean;
  StressPoint: number;
  Time: number;
  CustomTagDescription: string;
  CategoryId: number;
  SubcategoryId: number;
  Type: 'E_Normal';
  DisplayType: 'E_byWatts';
  StepCount: number;
  IsFavorite: boolean;
  CompletedCount: number;
  AuthorName: string;
  WokoutAssociationId: number;
  IF: number;
  TSS: number;
  KJ: number;
  IsVODAvailable?: boolean;
  Environment?: 'E_Outside';
  ScheduledDate?: string;
  SportsModeType?: number;
  // the files keep steps in WorkoutStepsArray, WorkoutstepsTMap or WorkoutSteps; the build merges them here
  WorkoutStepsArray: OfficialWorkoutStep[];
}

export interface OfficialSportLibrary {
  sourceUrl: string;
  generatedAt: string;
  categories: Record<number, string>;
  workouts: OfficialWorkout[];
}

export type OfficialLibrary = Record<'cycling' | 'running' | 'rowing', OfficialSportLibrary>;
