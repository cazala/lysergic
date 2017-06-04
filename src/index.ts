import { DocumentNode } from "./nodes";

export interface Dictionary<T> {
  [key: string]: T;
}

export interface Connection {
  to: number;
  from: number;
}

export interface Gate {
  to: number;
  from: number;
  gater: number;
}

// -- Cost Types

export enum CostTypes {
  MEAN_SQUARE_ERROR,
  CROSS_ENTROPY,
  BINARY
}

// -- Activation Types

export enum ActivationTypes {
  LOGISTIC_SIGMOID,
  TANH,
  RELU,
  MAX_POOLING,
  DROPOUT,
  IDENTITY,
  SOFTMAX,
  LINEAL,
  INVERSE_IDENTITY,
  EXP
}

// -- Status Types

export enum StatusTypes {
  IDLE,
  INIT,
  REVERSE_INIT,
  ACTIVATING,
  PROPAGATING,
  TRAINING
}

// -- Engine


export default class Lysergic {

  static ActivationTypes = ActivationTypes;
  static StatusTypes = StatusTypes;
  static CostTypes = CostTypes;
  static RandomGenerator = () => Math.random() * 2 - 1

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
  inputsOf: number[][] = [];
  projectedBy: number[][] = [];
  gatersOf: number[][] = [];
  gatedBy: number[][] = [];
  inputsOfGatedBy: number[][][] = [];
  projectionSet: number[][] = [];
  gateSet: number[][] = [];
  inputSet: number[][] = [];
  derivativeTerm: number[][] = [];
  connections: Connection[] = [];
  gates: Gate[] = [];
  learningRate: number = 0.1;
  layers: number[][] = [];
  size: number = 0;
  random: Function = null;
  biasUnit: number = null;
  status: StatusTypes = StatusTypes.IDLE;

  constructor({ bias = true, generator = Lysergic.RandomGenerator } = {}) {
    this.random = generator;
    this.status = StatusTypes.IDLE;

    // if using bias, create a bias unit, with a fixed activation of 1
    if (bias) {
      this.biasUnit = this.addUnit();
      this.activation[this.biasUnit] = 1;
    }
  }

  addUnit(activationFunction = ActivationTypes.LOGISTIC_SIGMOID, biased: boolean = true) {
    const unit = this.size;
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
    this.inputsOf[unit] = [];
    this.projectedBy[unit] = [];
    this.gatersOf[unit] = [];
    this.gatedBy[unit] = [];
    this.inputsOfGatedBy[unit] = [];
    this.derivativeTerm[unit] = [];
    this.inputSet[unit] = [];
    this.projectionSet[unit] = [];
    this.gateSet[unit] = [];
    this.size++;

    // if using bias, connect bias unit to newly created unit
    if (biased && this.biasUnit != null) {
      this.addConnection(this.biasUnit, unit);
    }

    return unit;
  }

  addConnection(from: number, to: number, weight: number = null) {
    // if the connection already exists then return
    if (this.connections.some(connection => connection.from === from && connection.to === to)) {
      return;
    }
    // add the connection to the list
    this.connections.push({ from, to });

    // setup connection
    const j = to;
    const i = from;
    const isSelfConnection = (from === to);
    this.gain[j][i] = 1; // ungated connections have a gain of 1 (eq. 14)
    this.weight[j][i] = isSelfConnection ? 1 : weight == null ? this.random() : weight; // self-connections have a fixed weight of 1 (this is explained in the text between eq. 14 and eq. 15)
    this.elegibilityTrace[j][i] = 0;
    this.extendedElegibilityTrace[j][i] = [];

    // track units
    this.track(to);
    this.track(from);
  }

  addGate(from: number, to: number, gater: number) {
    // if the connection is already gated or is a bias connection then return
    const alreadyGated = this.gates.some(gate => gate.from === from && gate.to === to);
    const isBias = from === this.biasUnit;
    if (alreadyGated || isBias) {
      return;
    }

    this.gates.push({ from, to, gater });

    // track units
    this.track(to);
    this.track(from);
    this.track(gater);
  }

  addLayer(size = 0, activationFunction?: ActivationTypes, biased = true) {
    if (this.status === StatusTypes.REVERSE_INIT) {
      throw new Error('You can\'t add layers during REVERSE_INIT phase!');
    }
    const layer: number[] = [];
    for (let i = 0; i < size; i++) {
      const unit = this.addUnit(activationFunction, biased);
      layer.push(unit);
    }
    this.layers.push(layer);
    return layer;
  }

  track(unit) {

    // each unit keeps track of all the units that project a connection into it (aka inputs)
    this.inputsOf[unit] = distinct(this.connections
      .filter(connection => connection.to === unit)
      .map(connection => connection.from));

    // each unit keeps track of all the units that receive a connection from them (aka projections)
    this.projectedBy[unit] = distinct(this.connections
      .filter(connection => connection.from === unit)
      .map(connection => connection.to));

    // each unit keeps track of all the other units gating connections into it
    this.gatersOf[unit] = distinct(this.gates
      .filter(gate => gate.to === unit)
      .map(gate => gate.gater));

    // each unit keeps track of all the units that receive connections gated by them
    this.gatedBy[unit] = distinct(this.gates
      .filter(gate => gate.gater === unit)
      .map(gate => gate.to));

    /* According to eq. 18:
      If unit j gates connections into other units k, it must maintain a set of
      extended eligibility traces for each such k. A trace of this type captures
      the efect that the connection from i potentially has on the state of k
      through its influence on j
    */

    // track extended elegibility traces for j
    this.inputsOf[unit].forEach(i => {
      this.gatedBy[unit].forEach(k => {
        this.extendedElegibilityTrace[unit][i][k] = 0;
      });
    });
    // track extended elegibility traces for i
    this.projectedBy[unit].forEach(j => {
      this.gatedBy[j].forEach(k => {
        this.extendedElegibilityTrace[j][unit][k] = 0;
      });
    });
    // track extended elegibility traces for k
    this.gatersOf[unit].forEach(j => {
      this.inputsOf[j].forEach(i => {
        this.extendedElegibilityTrace[j][i][unit] = 0;
      });
    });

    /*
      also, in order to compute the Big Parenthesis Term (eq. 18 and eq. 22)
      each unit must track an index that runs over all the units whose
      connections to k are gated by j
    */

    // track inputs of unit gated by j
    this.inputsOf[unit].forEach(i => {
      this.gatersOf[unit].forEach(j => {
        this.inputsOfGatedBy[unit][j] = distinct(
          this.inputsOfGatedBy[unit][j],
          this.gates
            .filter(gate => gate.gater === j && gate.to === unit && gate.from === i)
            .map(gate => gate.from)
        );
      });
    });
    // track inputs of k gated by unit
    this.gatedBy[unit].forEach(k => {
      this.inputsOf[k].forEach(i => {
        this.inputsOfGatedBy[k][unit] = distinct(
          this.inputsOfGatedBy[k][unit],
          this.gates
            .filter(gate => gate.gater === unit && gate.to === k && gate.from === i)
            .map(gate => gate.from)
        );
      });
    });

    /*
      also, in order to compute the Big Parenthesis Term
      each unit must track of a derivative term that can
      be 1 if and only if j gates k's self-connection,
      otherwise it is 0
    */

    // compute derivative term for k gated by unit
    this.gatedBy[unit].forEach(k => {
      this.derivativeTerm[k][unit] = this.gates
        .some(gate => gate.to === k && gate.from === k && gate.gater === unit)
        ? 1
        : 0;
    });
    // compute derivative term for unit gated by j
    this.gatersOf[unit].forEach(j => {
      this.derivativeTerm[unit][j] = this.gates
        .some(gate => gate.to === unit && gate.from === unit && gate.gater === j)
        ? 1
        : 0;
    });

    // each unit keeps track of all the other units that project a connection into them, and that are not self-connections (see eq. 4)
    this.inputSet[unit] = this.inputsOf[unit].filter(input => input !== unit);

    // each unit keeps track of all the other units that they project connections into, and that are downstream of them (see eq. 19)
    this.projectionSet[unit] = this.projectedBy[unit].filter(projected => projected > unit);

    // each unit keeps track of all the units that they are gating a connection into, and that are downstream of them (see eq. 20)
    this.gateSet[unit] = this.gatedBy[unit].filter(gated => gated > unit);
  }

  toJSON() {
    return JSON.stringify({
      state: this.state,
      weight: this.weight,
      gain: this.gain,
      activation: this.activation,
      derivative: this.derivative,
      elegibilityTrace: this.elegibilityTrace,
      extendedElegibilityTrace: this.extendedElegibilityTrace,
      errorResponsibility: this.errorResponsibility,
      projectedErrorResponsibility: this.projectedErrorResponsibility,
      gatedErrorResponsibility: this.gatedErrorResponsibility,
      activationFunction: this.activationFunction,
      inputsOf: this.inputsOf,
      projectedBy: this.projectedBy,
      gatersOf: this.gatersOf,
      gatedBy: this.gatedBy,
      inputsOfGatedBy: this.inputsOfGatedBy,
      projectionSet: this.projectionSet,
      gateSet: this.gateSet,
      inputSet: this.inputSet,
      derivativeTerm: this.derivativeTerm,
      connections: this.connections,
      gates: this.gates,
      learningRate: this.learningRate,
      layers: this.layers,
      size: this.size,
      biasUnit: this.biasUnit
    });
  }

  clone() {
    return Lysergic.fromJSON(this.toJSON());
  }

  static fromJSON(json: string | object) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const engine = new Lysergic();
    Object.keys(data).forEach(key => engine[key] = data[key]);
    return engine;
  }

  emit(): DocumentNode {
    return new DocumentNode;
  }

  clear() {
    // TODO: this should wipe all the elegibilityTrace's and extendedElegibilityTrace's to clear the networks context
  }
}


// helper for removing duplicated ints from an array
function distinct(...arrays): number[] {
  const concated = arrays.reduce((concated, array) => concated.concat(array || []), []);
  let o = {}, a = [], i;
  for (i = 0; i < concated.length; o[concated[i++]] = 1);
  for (i in o) a.push(+i);
  return a;
}
