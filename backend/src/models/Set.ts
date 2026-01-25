import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface SetAttributes {
  id: number;
  sessionId: number;
  exerciseId: number | null;
  exerciseName: string;
  weight: number;
  reps: number;
  setNumber: number;
  perceivedEffort: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SetCreationAttributes extends Optional<SetAttributes, 'id' | 'exerciseId' | 'perceivedEffort'> {}

export class Set extends Model<SetAttributes, SetCreationAttributes> implements SetAttributes {
  declare id: number;
  declare sessionId: number;
  declare exerciseId: number | null;
  declare exerciseName: string;
  declare weight: number;
  declare reps: number;
  declare setNumber: number;
  declare perceivedEffort: number | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Set {
    Set.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Sessions',
          key: 'id'
        }
      },
      exerciseId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Exercises',
          key: 'id'
        }
      },
      exerciseName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      weight: {
        type: DataTypes.DECIMAL(6, 2),
        allowNull: false,
        validate: {
          min: 0
        }
      },
      reps: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      setNumber: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1
        }
      },
      perceivedEffort: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
          max: 10
        }
      }
    }, {
      sequelize,
      tableName: 'Sets',
      timestamps: true,
      indexes: [
        { fields: ['sessionId'] },
        { fields: ['exerciseId'] },
        { fields: ['sessionId', 'exerciseId'] }
      ]
    });

    return Set;
  }
}

export default Set;
