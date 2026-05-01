export class MiMoCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiMoCliError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}
