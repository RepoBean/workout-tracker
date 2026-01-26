import { sequelize, Program, Workout, Exercise } from './src/models/index.js';

async function seed() {
  try {
    // Sync database
    await sequelize.sync();

    // Check if program already exists
    const existingProgram = await Program.findOne({ where: { name: 'Push/Pull/Legs' } });
    if (existingProgram) {
      console.log('Test data already exists');
      process.exit(0);
    }

    // Create a test program
    const program = await Program.create({
      name: 'Push/Pull/Legs',
      isActive: true,
      isArchived: false,
      currentWorkoutIndex: 0,
    });
    console.log('Created program:', program.name);

    // Create workouts
    const pushDay = await Workout.create({
      programId: program.id,
      name: 'Push Day',
      orderIndex: 0,
    });

    const pullDay = await Workout.create({
      programId: program.id,
      name: 'Pull Day',
      orderIndex: 1,
    });

    const legDay = await Workout.create({
      programId: program.id,
      name: 'Leg Day',
      orderIndex: 2,
    });
    console.log('Created 3 workouts');

    // Push Day exercises
    await Exercise.bulkCreate([
      { workoutId: pushDay.id, name: 'Bench Press', targetSets: 3, targetReps: '8-10', orderIndex: 0, supersetGroup: null },
      { workoutId: pushDay.id, name: 'Overhead Press', targetSets: 3, targetReps: '8-10', orderIndex: 1, supersetGroup: null },
      { workoutId: pushDay.id, name: 'Tricep Pushdown', targetSets: 3, targetReps: '12-15', orderIndex: 2, supersetGroup: null },
    ]);

    // Pull Day exercises
    await Exercise.bulkCreate([
      { workoutId: pullDay.id, name: 'Barbell Row', targetSets: 3, targetReps: '8-10', orderIndex: 0, supersetGroup: null },
      { workoutId: pullDay.id, name: 'Pull-ups', targetSets: 3, targetReps: '6-10', orderIndex: 1, supersetGroup: null },
      { workoutId: pullDay.id, name: 'Bicep Curls', targetSets: 3, targetReps: '12-15', orderIndex: 2, supersetGroup: null },
    ]);

    // Leg Day exercises
    await Exercise.bulkCreate([
      { workoutId: legDay.id, name: 'Squat', targetSets: 3, targetReps: '8-10', orderIndex: 0, supersetGroup: null },
      { workoutId: legDay.id, name: 'Romanian Deadlift', targetSets: 3, targetReps: '10-12', orderIndex: 1, supersetGroup: null },
      { workoutId: legDay.id, name: 'Leg Press', targetSets: 3, targetReps: '12-15', orderIndex: 2, supersetGroup: null },
    ]);
    console.log('Created 9 exercises');

    console.log('Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
