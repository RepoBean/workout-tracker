import { Sequelize } from 'sequelize';
import { Program } from './Program.js';
import { Workout } from './Workout.js';
import { Exercise } from './Exercise.js';
import { Session } from './Session.js';
import { Set } from './Set.js';

// Create Sequelize instance with SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false, // Set to console.log for debugging
});

// Initialize all models
Program.initModel(sequelize);
Workout.initModel(sequelize);
Exercise.initModel(sequelize);
Session.initModel(sequelize);
Set.initModel(sequelize);

// Set up associations

// Program -> Workout (CASCADE: delete workouts when program deleted)
Program.hasMany(Workout, {
  foreignKey: 'programId',
  as: 'workouts',
  onDelete: 'CASCADE',
  hooks: true
});
Workout.belongsTo(Program, {
  foreignKey: 'programId',
  as: 'program'
});

// Workout -> Exercise (CASCADE: delete exercises when workout deleted)
Workout.hasMany(Exercise, {
  foreignKey: 'workoutId',
  as: 'exercises',
  onDelete: 'CASCADE',
  hooks: true
});
Exercise.belongsTo(Workout, {
  foreignKey: 'workoutId',
  as: 'workout'
});

// Program -> Session (SET NULL: preserve history when program deleted)
Program.hasMany(Session, {
  foreignKey: 'programId',
  as: 'sessions',
  onDelete: 'SET NULL',
  hooks: true
});
Session.belongsTo(Program, {
  foreignKey: 'programId',
  as: 'program'
});

// Workout -> Session (SET NULL: preserve history when workout deleted)
Workout.hasMany(Session, {
  foreignKey: 'workoutId',
  as: 'sessions',
  onDelete: 'SET NULL',
  hooks: true
});
Session.belongsTo(Workout, {
  foreignKey: 'workoutId',
  as: 'workout'
});

// Session -> Set (CASCADE: delete sets when session deleted)
Session.hasMany(Set, {
  foreignKey: 'sessionId',
  as: 'sets',
  onDelete: 'CASCADE',
  hooks: true
});
Set.belongsTo(Session, {
  foreignKey: 'sessionId',
  as: 'session'
});

// Exercise -> Set (SET NULL: preserve history when exercise deleted)
Exercise.hasMany(Set, {
  foreignKey: 'exerciseId',
  as: 'sets',
  onDelete: 'SET NULL',
  hooks: true
});
Set.belongsTo(Exercise, {
  foreignKey: 'exerciseId',
  as: 'exercise'
});

export {
  sequelize,
  Program,
  Workout,
  Exercise,
  Session,
  Set
};
