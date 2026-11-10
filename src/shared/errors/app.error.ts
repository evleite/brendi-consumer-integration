export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    isOperational = true,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', true, details);
  }

  static unauthorized(message: string = 'Unauthorized', details?: Record<string, unknown>): AppError {
    return new AppError(message, 401, 'UNAUTHORIZED', true, details);
  }

  static forbidden(message: string = 'Forbidden', details?: Record<string, unknown>): AppError {
    return new AppError(message, 403, 'FORBIDDEN', true, details);
  }

  static notFound(message: string = 'Resource not found', details?: Record<string, unknown>): AppError {
    return new AppError(message, 404, 'NOT_FOUND', true, details);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(message, 409, 'CONFLICT', true, details);
  }

  static tooManyRequests(message: string = 'Too many requests', details?: Record<string, unknown>): AppError {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS', true, details);
  }

  static internal(message: string = 'Internal server error', details?: Record<string, unknown>): AppError {
    return new AppError(message, 500, 'INTERNAL_ERROR', false, details);
  }

  static serviceUnavailable(message: string = 'Service unavailable', details?: Record<string, unknown>): AppError {
    return new AppError(message, 503, 'SERVICE_UNAVAILABLE', true, details);
  }

  static gatewayTimeout(message: string = 'Gateway timeout', details?: Record<string, unknown>): AppError {
    return new AppError(message, 504, 'GATEWAY_TIMEOUT', true, details);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: {
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function isOperationalError(error: unknown): boolean {
  return isAppError(error) && error.isOperational;
}