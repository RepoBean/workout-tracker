import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { sequelize } from './models/index.js';
import programsRouter from './routes/programs.js';
import workoutsRouter from './routes/workouts.js';
import exercisesRouter from './routes/exercises.js';
import sessionsRouter from './routes/sessions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: ['http://localhost:5174', 'http://127.0.0.1:5174'],
  credentials: true
}));
app.use(express.json());

// Serve frontend build
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/programs', programsRouter);
app.use('/api/workouts', workoutsRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/sessions', sessionsRouter);

// SPA fallback — serve index.html for client-side routes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  } else {
    next();
  }
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function start() {
  try {
    // Sync database (creates tables if they don't exist)
    await sequelize.sync();
    console.log('Database synced successfully');

    // Safe migration: add dropIndex column if it doesn't exist
    try {
      await sequelize.query('ALTER TABLE Sets ADD COLUMN dropIndex INTEGER NOT NULL DEFAULT 0');
      console.log('Added dropIndex column to Sets table');
    } catch {
      // Column already exists, ignore
    }

    // Safe migration: add heart rate columns (nullable)
    const hrMigrations: Array<[string, string]> = [
      ['Sets', 'heartRateAvg'],
      ['Sets', 'heartRateMax'],
      ['Sessions', 'heartRateAvg'],
      ['Sessions', 'heartRateMin'],
      ['Sessions', 'heartRateMax'],
    ];
    for (const [table, column] of hrMigrations) {
      try {
        await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER`);
        console.log(`Added ${column} column to ${table} table`);
      } catch {
        // Column already exists, ignore
      }
    }

    // Safe migration: add cardio columns
    const cardioMigrations: Array<[string, string, string]> = [
      ['Exercises', 'exerciseType', `VARCHAR(16) NOT NULL DEFAULT 'strength'`],
      ['Exercises', 'cardioModality', 'VARCHAR(16)'],
      ['Exercises', 'targetDurationSec', 'INTEGER'],
      ['Exercises', 'targetDistance', 'DECIMAL(6,2)'],
      ['Sets', 'durationSec', 'INTEGER'],
      ['Sets', 'distance', 'DECIMAL(6,2)'],
    ];
    for (const [table, column, type] of cardioMigrations) {
      try {
        await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`Added ${column} column to ${table} table`);
      } catch {
        // Column already exists, ignore
      }
    }

    try {
      await sequelize.query('ALTER TABLE Sessions ADD COLUMN heartRateSeries TEXT');
      console.log('Added heartRateSeries column to Sessions table');
    } catch {
      // Column already exists, ignore
    }

    try {
      await sequelize.query('ALTER TABLE Sessions ADD COLUMN exerciseNotes JSON');
      console.log('Added exerciseNotes column to Sessions table');
    } catch {
      // Column already exists, ignore
    }

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await sequelize.close();
  process.exit(0);
});

start();
