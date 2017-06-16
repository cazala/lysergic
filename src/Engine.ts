import { ActivationTypes } from "./ast/activations";

export enum StatusTypes {
  IDLE,
  INIT,
  REVERSE_INIT,
  ACTIVATING,
  PROPAGATING,
  TRAINING,
  BUILDING
}

export interface IEngineOptions {
  generator?: () => number;
}

export interface IUnitOptions {
  activationFunction?: ActivationTypes;
}

export default class Engine {

  static RandomGenerator = () => Math.random() * 2 - 1

  learningRate: number = 0.1;
  size: number;
  state: number[] = [];
  weight: number[][] = [];
  gain: number[][] = [];
  activation: number[] = [];
  derivative: number[] = [];
  elegibilityTrace: number[][] = [];
  extendedElegibilityTrace: number[][][] = [];
  errorResponsibility: number[] = [];
  projectedErrorResponsibility: number[] = [];
  gatedErrorResponsibility: number[] = [];
  activationFunction: ActivationTypes[] = [];
  derivativeTerm: number[][] = [];
  status: StatusTypes = StatusTypes.IDLE;
  random: () => number = Engine.RandomGenerator;

  constructor(options: IEngineOptions = {}) {
    this.random = options.generator;
    this.status = StatusTypes.IDLE;
  }

  addUnit(options: IUnitOptions = {}) {
    const {
      activationFunction = ActivationTypes.LOGISTIC_SIGMOID
    } = options;

    const unit = this.size++;
    this.state[unit] = this.random();
    this.weight[unit] = [];
    this.gain[unit] = [];
    this.elegibilityTrace[unit] = [];
    this.extendedElegibilityTrace[unit] = [];
    this.activation[unit] = 0;
    this.derivative[unit] = 0;
    this.weight[unit][unit] = 0; // since it's not self-connected the weight of the self-connection is 0 (this is explained in the text between eq. 14 and eq. 15)
    this.gain[unit][unit] = 1; // ungated connections have a gain of 1 (eq. 14)
    this.elegibilityTrace[unit][unit] = 0;
    this.extendedElegibilityTrace[unit][unit] = [];
    this.activationFunction[unit] = activationFunction;
    this.errorResponsibility[unit] = 0;
    this.projectedErrorResponsibility[unit] = 0;
    this.gatedErrorResponsibility[unit] = 0;
    this.derivativeTerm[unit] = [];
    return unit;
  }

  clear(): void {
    // wipe all elegibility traces and extended elegibility traces
    for (let j in this.elegibilityTrace) {
      for (let i in this.elegibilityTrace[j]) {
        this.elegibilityTrace[j][i] = 0;
        for (let k in this.extendedElegibilityTrace[j][i]) {
          this.extendedElegibilityTrace[j][i][k] = 0;
        }
      }
    }
  }
}