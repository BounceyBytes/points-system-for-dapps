/**
 * Custom error classes for the Points System
 * Provides better error handling and debugging
 */

export class PointsSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PointsSystemError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class SeasonError extends PointsSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'SeasonError';
  }
}

export class SnapshotError extends PointsSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

export class CalculationError extends PointsSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'CalculationError';
  }
}

export class ValidationError extends PointsSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DataSourceError extends PointsSystemError {
  constructor(message: string) {
    super(message);
    this.name = 'DataSourceError';
  }
}
