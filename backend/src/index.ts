import express from 'express';
import cors from 'cors';
import { sequelize } from './models/index.js';
import programsRouter from './routes/programs.js';
import workoutsRouter from './routes/workouts.js';
import exercisesRouter from './routes/exercises.js';
import sessionsRouter from './routes/sessions.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: ['http://localhost:5174', 'http://127.0.0.1:5174'],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.use('/api/programs', programsRouter);
app.use('/api/workouts', workoutsRouter);
app.use('/api/exercises', exercisesRouter);
app.use('/api/sessions', sessionsRouter);

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
