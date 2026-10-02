export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly data: unknown = null,
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, data: unknown = null) {
    super(400, 'VALIDATION_ERROR', message, data);
  }
}

export class ImplausibleRoundError extends AppError {
  constructor(reasons: readonly string[]) {
    super(422, 'IMPLAUSIBLE_ROUND', 'Round rejected by plausibility checks', { reasons });
  }
}
