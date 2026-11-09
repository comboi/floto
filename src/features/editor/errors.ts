/** Error shape returned by the Tauri backend (D.1). Older commands still return a plain string. */
export type CommandError = {
  code: string;
  message: string;
};

/** Turns whatever a Tauri command rejected with into a readable message. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as CommandError).message === 'string') {
    return (error as CommandError).message;
  }
  return String(error);
}
