import { createLogger, format, transports } from 'winston';

const { combine, timestamp, colorize, printf, errors } = format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}] ${stack || message}`;
});

export const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    colorize(),
    timestamp({ format: 'HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [new transports.Console()],
});
