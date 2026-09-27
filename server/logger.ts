import { config } from './config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function formatMessage(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` | ${JSON.stringify(context)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${contextStr}`;
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(formatMessage('info', message, context));
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(formatMessage('warn', message, context));
  },
  error: (message: string, context?: Record<string, unknown>) => {
    console.error(formatMessage('error', message, context));
  },
  debug: (message: string, context?: Record<string, unknown>) => {
    if (!config.isProduction) {
      console.debug(formatMessage('debug', message, context));
    }
  }
};
