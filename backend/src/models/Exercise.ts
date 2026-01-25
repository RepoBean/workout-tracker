import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface ExerciseAttributes {
  id: number;
  workoutId: number;
  name: string;
  targetSets: number;
  targetReps: string; // String to allow ranges like "8-10"
  orderIndex: number;
  supersetGroup: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ExerciseCreationAttributes extends Optional<ExerciseAttributes, 'id' | 'supersetGroup'> {}

export class Exercise extends Model<ExerciseAttributes, ExerciseCreationAttributes> implements ExerciseAttributes {
  declare id: number;
  declare workoutId: number;
  declare name: string;
  declare targetSets: number;
  declare targetReps: string;
  declare orderIndex: number;
  declare supersetGroup: string | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Exercise {
    Exercise.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      workoutId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Workouts',
          key: 'id'
        }
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          len: [1, 255]
        }
      },
      targetSets: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      targetReps: {
        type: DataTypes.STRING(50),
        allowNull: false
      },
      orderIndex: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      supersetGroup: {
        type: DataTypes.STRING(1),
        allowNull: true,
        validate: {
          isIn: [['A', 'B', 'C', 'D', 'E', null]]
        }
      }
    }, {
      sequelize,
      tableName: 'Exercises',
      timestamps: true,
      indexes: [
        { fields: ['workoutId', 'orderIndex'] }
      ]
    });

    return Exercise;
  }
}

export default Exercise;
