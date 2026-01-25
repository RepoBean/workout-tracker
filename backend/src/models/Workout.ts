import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface WorkoutAttributes {
  id: number;
  programId: number;
  name: string;
  orderIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkoutCreationAttributes extends Optional<WorkoutAttributes, 'id'> {}

export class Workout extends Model<WorkoutAttributes, WorkoutCreationAttributes> implements WorkoutAttributes {
  declare id: number;
  declare programId: number;
  declare name: string;
  declare orderIndex: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Workout {
    Workout.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      programId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Programs',
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
      orderIndex: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    }, {
      sequelize,
      tableName: 'Workouts',
      timestamps: true,
      indexes: [
        { fields: ['programId', 'orderIndex'] }
      ]
    });

    return Workout;
  }
}

export default Workout;
