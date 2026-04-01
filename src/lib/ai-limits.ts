/**
 * Output token ceilings — tune in one place. Analysis uses two phases so each
 * request stays shorter (fewer timeouts) while combined quality stays high.
 */
export const MAX_TOKENS_ANALYZE_PHASE1 = 3_000;
export const MAX_TOKENS_ANALYZE_PHASE2 = 3_800;

export const MAX_TOKENS_GENERATE_PROMPTS = 5_500;
export const MAX_TOKENS_GENERATE_CODE = 2_800;
export const MAX_TOKENS_GENERATE_PREVIEW = 2_600;
/**
 * Body-only HTML from the model; full CSS is injected server-side. Kept low so Hobby (~60s) completes.
 */
export const MAX_TOKENS_GENERATE_STITCH_UI = 1_800;

/** Structured UI JSON for dynamic React renderer (rich cards + nested children). */
export const MAX_TOKENS_GENERATE_UI_JSON = 3_400;

/** Second-pass polish on validated UI JSON (spacing hierarchy, responsive layout choice, copy). */
export const MAX_TOKENS_UI_JSON_ENHANCE = 2_400;

/** Max chars sent to the model for project description (keeps prompts fast and stable). */
export const MAX_PROJECT_DESCRIPTION_CHARS = 14_000;

/** Stitch: keep idea short so the LLM finishes within serverless time limits. */
export const MAX_STITCH_IDEA_CHARS = 1_200;
