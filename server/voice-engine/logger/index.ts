export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface ILogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): ILogger;
}
