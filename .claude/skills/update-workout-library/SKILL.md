---
name: update-workout-library
description: Refresh MyWhoosh's official workout library that the MCP server bundles (listOfficialWorkouts). Use when listOfficialWorkouts reports "MyWhoosh has published a newer … library", when the user asks to update the official workouts, or before a deploy on a fresh clone where src/data/officialWorkouts.generated.ts is missing.
---

# Update the official workout library

`listOfficialWorkouts` reads `src/data/officialWorkouts.generated.ts`, which `npm run library`
(`scripts/build-workout-library.mjs`) builds on this machine: it downloads the three library zips listed in
`scripts/workout-library-sources.json`, unzips them, normalizes the files and writes them as a TypeScript literal (`… satisfies OfficialLibrary`), so
`npm run typecheck` checks every workout against the types in `src/data/officialWorkouts.ts`. The
Worker never downloads or unzips anything itself. The generated file is git-ignored (MyWhoosh content),
so it has to be built locally before every deploy from a fresh clone.

## Steps

1. **Find the current library URLs.** Call the MCP tool `getGameTitleData` (local `npm run dev` server or the
   deployed one) and read `MyWhooshWorkoutsZipURL`, `MyWhooshWorkoutsZipURLRunning` and
   `MyWhooshWorkoutsZipURLRowing`. `listOfficialWorkouts` compares the bundled URL with this on every list
   call and says which sport is outdated.
2. **Update `scripts/workout-library-sources.json`** with the changed URLs (only the ones that differ).
   The zips are public CDN files; no login is needed to download them.
3. **Build:** `npm run library`. It stops on a key it doesn't know and on a workout whose steps don't add
   up to its `StepCount`. It prints the number of workouts and categories per sport; compare with the
   previous run (2026-10-28: cycling 761 / 15 categories, running 11 / 2, rowing 10 / 3).
4. **Typecheck:** `npm run typecheck`. Errors in `officialWorkouts.generated.ts` mean MyWhoosh changed the
   format (a new `StepType`, `Mode`, … value or a different type). Decide whether the new value is legit,
   then extend the types in `src/data/officialWorkouts.ts` (and the key lists in the build script for new
   keys) - never loosen them to `string`/`any` just to make it pass.
5. **Check:** with `npm run dev`, call `listOfficialWorkouts` for each sport (expect no "newer library"
   message) and fetch one workout by `workoutId` to see its steps in `WorkoutStepsArray`.
6. **Commit** `scripts/workout-library-sources.json` (the generated file stays untracked).
7. **Deploy:** `npm run deploy`. It refuses uncommitted changes and a missing generated file, and tags the
   deployed commit as `deploy-<version>`.

## Format quirks the build handles

- Keys come in two spellings: older files `id`, `categoryId`, `time`; newer ones `Id`, `CategoryId`, `Time`
  (also `WokoutAssociationID` / `WokoutAssociationId`). The build maps them to the PascalCase names.
- Some files start with a UTF-8 BOM.
- Steps sit in one of three places: `WorkoutStepsArray` (18 newer files), `WorkoutstepsTMap` (most older
  files, whose `WorkoutStepsArray` is empty), or `WorkoutSteps` (a list, or an object keyed "1", "2", ...).
  The build takes the first non-empty one and stores it as `WorkoutStepsArray`.
- Running workouts are published with `Mode: "E_Ride"`, rowing with `Mode: "Rowing"`.
- Category names come from `Workouts/WorkoutCategory.json` (`iD` -> `categoryname`).
- Training plans (`MyWhooshTrainingPlansZipURL`) are not part of the library build.

New quirks show up as missing workouts in step 3; extend `scripts/build-workout-library.mjs` and note them here.
