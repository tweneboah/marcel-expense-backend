# Logging System Documentation

This document describes the logging system implemented in the Expense Tracker application using Winston and Morgan.

## Overview

The application uses a robust logging system with the following features:

- Multiple log levels (error, warn, info, http, verbose, debug)
- Log rotation with daily files
- Separate log files for different concerns (application, database, errors)
- Structured JSON logging for better analysis
- Console output with colors for development
- Detailed connection status logging for MongoDB
- HTTP request logging with Morgan

## Log Files

Logs are stored in the `/logs` directory with the following files:

- `application-YYYY-MM-DD.log` - General application logs
- `database-YYYY-MM-DD.log` - MongoDB connection and operation logs
- `error-YYYY-MM-DD.log` - Error-level logs from all sources
- `exceptions.log` - Uncaught exceptions

## Log Format

The log format includes:

- Timestamp in `YYYY-MM-DD HH:mm:ss` format
- Log level (ERROR, WARN, INFO, HTTP, etc.)
- Message
- Additional metadata (JSON)

Example:

```
2023-08-15 14:32:45 [INFO]: Connected to database {"host":"localhost","port":27017,"database":"expense_tracker"}
```

## HTTP Request Logging with Morgan

The application uses Morgan for HTTP request logging, which is integrated with Winston for consistent log storage.

### Development Environment Format

In development, the log format is more verbose and includes:

```
GET /api/v1/expenses 200 134ms {"category":"fuel"}
```

This format includes:

- HTTP method
- URL
- Status code (color-coded in console)
- Response time
- Request body (for POST/PUT requests, with sensitive data redacted)

### Production Environment Format

In production, the log format is more concise:

```
127.0.0.1 GET /api/v1/expenses 200 134ms
```

This format includes:

- IP address
- HTTP method
- URL
- Status code
- Response time

### Security Features

The Morgan implementation includes security measures:

- Sensitive data like passwords and tokens are redacted from logs
- Only logs request bodies for POST and PUT requests
- Empty request bodies are not logged

## MongoDB Connection Logging

The database connection logs include:

- Connection attempts with retry information
- Connection success/failure with detailed error information
- Connection pool status
- Database operations for initialization data
- Connection closure events

## Viewing Logs

Several npm scripts have been added to make viewing logs easier:

```bash
# View recent logs
npm run logs

# View only database logs
npm run logs:db

# View only error logs
npm run logs:errors

# Follow logs in real-time
npm run logs:follow
```

You can also use the `logs.sh` script directly with more options:

```bash
# View help
./scripts/logs.sh --help

# View today's database logs
./scripts/logs.sh --database --today

# Search for specific text in error logs
./scripts/logs.sh --errors "connection failed"

# Show the latest 50 log entries
./scripts/logs.sh --latest 50
```

## Log Levels

The logging system uses the following levels (from highest to lowest priority):

1. **error**: Critical errors that affect application functionality
2. **warn**: Warnings that don't stop functionality but require attention
3. **info**: Important information about application state and events
4. **http**: HTTP request logging
5. **verbose**: More detailed operational information
6. **debug**: Highly detailed debugging information (development only)

In production mode, only logs of level "info" and above are recorded to reduce log volume.

## Implementation Details

The logging system is implemented in:

- `src/utils/logger.js` - Main Winston logger configuration
- `src/utils/morganLogger.js` - Morgan HTTP request logger configuration
- `src/config/db.js` - Database-specific logging
- `src/server.js` - HTTP request logging and process error handling
- `src/middleware/error.js` - Error middleware logging

## Extending the Logging System

To add logging to a new component:

```javascript
import { logger } from "../utils/logger.js";

// Simple message
logger.info("Operation completed successfully");

// With metadata
logger.error({
  message: "Operation failed",
  error: err.message,
  operationId: "123",
  userId: req.user.id,
});
```

For database-specific operations, use:

```javascript
import { dbLogger } from "../utils/logger.js";

dbLogger.info("Database operation completed");
```
