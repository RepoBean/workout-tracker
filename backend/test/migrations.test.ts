import { describe, it, expect, beforeEach } from 'vitest';
import { sequelize } from '../src/models/index.js';
import { addColumnIfMissing, runMigrations } from '../src/migrations.js';

beforeEach(async () => {
  await sequelize.sync({ force: true });
});

describe('runMigrations', () => {
  it('is idempotent when every column already exists (fresh sync)', async () => {
    await expect(runMigrations(sequelize)).resolves.toBeUndefined();
    await expect(runMigrations(sequelize)).resolves.toBeUndefined();
  });
});

describe('addColumnIfMissing', () => {
  it('adds a missing column once and reports the duplicate on retry', async () => {
    await sequelize.query('CREATE TABLE Scratch (id INTEGER PRIMARY KEY)');

    const first = await addColumnIfMissing(sequelize, 'Scratch', 'note TEXT');
    const second = await addColumnIfMissing(sequelize, 'Scratch', 'note TEXT');

    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('rethrows errors that are not duplicate-column', async () => {
    await expect(
      addColumnIfMissing(sequelize, 'NoSuchTable', 'note TEXT')
    ).rejects.toThrow();
  });
});
