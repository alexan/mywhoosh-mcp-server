---
name: update-workout-library
description: Refresh MyWhoosh's official workout library that the MCP server bundles (listOfficialWorkouts). Use when listOfficialWorkouts reports "MyWhoosh has published a newer … library", when the user asks to update the official workouts, or before a deploy on a fresh clone where src/data/officialWorkouts.generated.ts is missing.
---

# Update the official workout library

`listOfficialWorkouts` reads `src/data/officialWorkouts.generated.ts`, which `npm run library`
(`scripts/build-workout-library.mjs`) builds on this machine: it downloads the three library zips listed in
`scripts/workout-library-sources.json`, unzips them, normalizes the files and writes the TypeScript. The
Worker never downloads or unzips anything itself. The generated file is git-ignored (MyWhoosh content),
so it has to be built locally before every deploy from a fresh clone.

## Steps

1. **Find the current library URLs.** Call the MCP tool `getGameTitleData` (local `npm run dev` server or the
   deployed one) and read `MyWhooshWorkoutsZipURL`, `MyWhooshWorkoutsZipURLRunning` and
   `MyWhooshWorkoutsZipURLRowing`. `listOfficialWorkouts` compares the bundled URL with this on every list
   call and says which sport is outdated.
2. **Update `scripts/workout-library-sources.json`** with the changed URLs (only the ones that differ).
   The zips are public CDN files; no login is needed to download them.
3. **Build:** `npm run library`. It prints the number of workouts and categories per sport. Compare with
   the previous run (2026-10-28: cycling 761 / 15 categories, running 11 / 2, rowing 10 / 3); a big drop
   usually means the file format changed - inspect a few files before going on.
4. **Check:** `npm run typecheck`, then with `npm run dev` call `listOfficialWorkouts` for each sport
   (expect no "newer library" message) and fetch one workout by `workoutId` to see that
   `WorkoutStepsArray` holds its steps.
5. **Commit** `scripts/workout-library-sources.json` (the generated file stays untracked).
6. **Deploy:** `npm run deploy`. It refuses uncommitted changes and a missing generated file, and tags the
   deployed commit as `deploy-<version>`.

## Format quirks the build handles

- Keys come in two spellings: older files `id`, `categoryId`, `time`; newer ones `Id`, `CategoryId`, `Time`.
- Some files start with a UTF-8 BOM.
- Taper workouts 732-734 have no `WorkoutStepsArray`, an empty `WorkoutSteps` and their steps in
  `WorkoutstepsTMap`; the build copies them into `WorkoutStepsArray`.
- Category names come from `Workouts/WorkoutCategory.json` (`iD` -> `categoryname`).
- Training plans (`MyWhooshTrainingPlansZipURL`) are not part of the library build.

New quirks show up as missing workouts in step 3; extend `scripts/build-workout-library.mjs` and note them here.
