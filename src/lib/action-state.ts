/** Shared shape returned by every Server Action that drives a form. */
export type ActionState = {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** Free-form payload (e.g. generated identifiers, one-time links). */
  data?: Record<string, string>;
} | null;

export const INITIAL_STATE: ActionState = null;
