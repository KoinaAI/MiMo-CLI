/**
 * Error taxonomy and classification.
 *
 * Provides structured error types for better error handling and
 * user-facing error messages. Inspired by DeepSeek TUI's error_taxonomy.
 */

export type ErrorCategory =
  | 'api'          // API errors (rate limit, auth, server)
  | 'tool'         // Tool execution failures
  | 'config'       // Configuration errors
  | 'permission'   // Permission denied / approval required
  | 'network'      // Network connectivity issues
  | 'filesystem'   // File system errors
  | 'validation'   // Input validation errors
  | 'timeout'      // Operation timeout
  | 'internal';    // Internal/unexpected errors

export interface ClassifiedError {
  category: ErrorCategory;
  message: string;
  suggestion?: string;
  retryable: boolean;
}

/**
 * Classify an error into a structured category with a user-friendly suggestion.
 */
export function classifyError(error: unknown): ClassifiedError {
  const msg = errorMessage(error);
  const lower = msg.toLowerCase();

  // API errors
  if (lower.includes('rate limit') || lower.includes('429')) {
    return { category: 'api', message: msg, suggestion: 'Wait a moment and try again, or use a different model.', retryable: true };
  }
  if (lower.includes('unauthorized') || lower.includes('401') || lower.includes('invalid api key')) {
    return { category: 'api', message: msg, suggestion: 'Check your API key configuration with `mimo-code config`.', retryable: false };
  }
  if (lower.includes('forbidden') || lower.includes('403')) {
    return { category: 'permission', message: msg, suggestion: 'Your API key may not have access to this model or feature.', retryable: false };
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503') || lower.includes('internal server')) {
    return { category: 'api', message: msg, suggestion: 'The API server is experiencing issues. Try again later.', retryable: true };
  }

  // Network errors
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('dns') || lower.includes('network')) {
    return { category: 'network', message: msg, suggestion: 'Check your internet connection and API base URL.', retryable: true };
  }
  if (lower.includes('timeout') || lower.includes('etimedout') || lower.includes('econnreset')) {
    return { category: 'timeout', message: msg, suggestion: 'The operation timed out. Try again or increase the timeout.', retryable: true };
  }

  // File system errors
  if (lower.includes('enoent') || lower.includes('no such file')) {
    return { category: 'filesystem', message: msg, suggestion: 'The file or directory does not exist. Check the path.', retryable: false };
  }
  if (lower.includes('eacces') || lower.includes('permission denied')) {
    return { category: 'permission', message: msg, suggestion: 'Permission denied. Check file permissions.', retryable: false };
  }

  // Validation errors
  if (lower.includes('must be') || lower.includes('required') || lower.includes('invalid')) {
    return { category: 'validation', message: msg, retryable: false };
  }

  // Tool errors
  if (lower.includes('tool error') || lower.includes('tool failed')) {
    return { category: 'tool', message: msg, retryable: false };
  }

  // Default: internal error
  return { category: 'internal', message: msg, retryable: false };
}

/**
 * Format a classified error for display.
 */
export function formatClassifiedError(err: ClassifiedError): string {
  const icon = err.retryable ? '⚠️' : '❌';
  const lines = [`${icon} [${err.category}] ${err.message}`];
  if (err.suggestion) lines.push(`  💡 ${err.suggestion}`);
  return lines.join('\n');
}

/**
 * Application-specific error class.
 */
export class MiMoCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MiMoCliError';
  }
}

/**
 * Extract error message from unknown error value.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
