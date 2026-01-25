import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface ProgramAttributes {
  id: number;
  name: string;
  isActive: boolean;
  isArchived: boolean;
  currentWorkoutIndex: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProgramCreationAttributes extends Optional<ProgramAttributes, 'id' | 'isActive' | 'isArchived' | 'currentWorkoutIndex'> {}

export class Program extends Model<ProgramAttributes, ProgramCreationAttributes> implements ProgramAttributes {
  declare id: number;
  declare name: string;
  declare isActive: boolean;
  declare isArchived: boolean;
  declare currentWorkoutIndex: number;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Program {
    Program.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          len: [1, 255]
        }
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      isArchived: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      currentWorkoutIndex: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    }, {
      sequelize,
      tableName: 'Programs',
      timestamps: true,
      indexes: [
        { fields: ['isActive'] },
        { fields: ['isArchived'] }
      ]
    });

    return Program;
  }
}

export default Program;
