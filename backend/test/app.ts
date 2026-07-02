import express from 'express';
import { sequelize } from '../src/models/index.js';
import programsRouter from '../src/routes/programs.js';
import workoutsRouter from '../src/routes/workouts.js';
import exercisesRouter from '../src/routes/exercises.js';
import sessionsRouter from '../src/routes/sessions.js';

if (process.env.DB_PATH !== ':memory:') {
  throw new Error('Tests must run against an in-memory database (see test/setup.ts)');
}

export function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/programs', programsRouter);
  app.use('/api/workouts', workoutsRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/sessions', sessionsRouter);
  return app;
}

/** Drop and recreate all tables — call in beforeEach for a clean slate. */
export async function resetDb() {
  await sequelize.sync({ force: true });
}
