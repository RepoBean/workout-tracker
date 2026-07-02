// Runs before each test file, before any src module is imported —
// the Sequelize instance in src/models/index.ts reads DB_PATH at import
// time, so this is what keeps tests off the real database file.
process.env.DB_PATH = ':memory:';
