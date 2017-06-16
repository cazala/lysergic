import { ActivationTypes } from "./ast/activations";
import Engine, { StatusTypes } from "./Engine";

export interface Connection {
  to: number;
  from: number;
}

export interface Gate {
  to: number;
  from: number;
  gater: number;
}

export interface ITopologyOptions {
  engine?: Engine;
  bias?: boolean;
}

export interface ITopoloyUnitOptions {
  activationFunction?: ActivationTypes;
  bias?: boolean;
}

export default class Topology {

  engine: Engine = null;
  biasUnit: number = null;
  inputsOf: number[][] = [];
  projectedBy: number[][] = [];
  gatersOf: number[][] = [];
  gatedBy: number[][] = [];
  inputsOfGatedBy: number[][][] = [];
  projectionSet: number[][] = [];
  gateSet: number[][] = [];
  inputSet: number[][] = [];
  connections: Connection[] = [];
  gates: Gate[] = [];
  layers: number[][] = [];

  constructor({ engine = new Engine, bias = true }: ITopologyOptions = {}) {
    this.engine = engine;

    // if using bias, create a bias unit, with a fixed activation of 1
    if (bias) {
      this.biasUnit = this.addUnit();
      this.engine.activation[this.biasUnit] = 1;
    }
  }

  addUnit(options: ITopoloyUnitOptions = {}) {
    const {
      bias = true
    } = options;

    const unit = this.engine.addUnit(options);
    this.inputsOf[unit] = [];
    this.projectedBy[unit] = [];
    this.gatersOf[unit] = [];
    this.gatedBy[unit] = [];
    this.inputsOfGatedBy[unit] = [];
    this.inputSet[unit] = [];
    this.projectionSet[unit] = [];
    this.gateSet[unit] = [];

    // if using bias, connect bias unit to newly created unit
    if (bias && this.biasUnit != null) {
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
    this.engine.gain[j][i] = 1; // ungated connections have a gain of 1 (eq. 14)
    this.engine.weight[j][i] = isSelfConnection ? 1 : weight == null ? this.engine.random() * .3 + .1 : weight; // self-connections have a fixed weight of 1 (this is explained in the text between eq. 14 and eq. 15)
    this.engine.elegibilityTrace[j][i] = 0;
    this.engine.extendedElegibilityTrace[j][i] = [];

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

  addLayer(size = 0, options: ITopologyOptions) {
    if (this.engine.status === StatusTypes.REVERSE_INIT) {
      throw new Error('You can\'t add layers during REVERSE_INIT phase!');
    }
    const layer: number[] = [];
    for (let i = 0; i < size; i++) {
      const unit = this.addUnit(options);
      layer.push(unit);
    }
    this.layers.push(layer);
    return layer;
  }

  private track(unit) {

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
        this.engine.extendedElegibilityTrace[unit][i][k] = 0;
      });
    });
    // track extended elegibility traces for i
    this.projectedBy[unit].forEach(j => {
      this.gatedBy[j].forEach(k => {
        this.engine.extendedElegibilityTrace[j][unit][k] = 0;
      });
    });
    // track extended elegibility traces for k
    this.gatersOf[unit].forEach(j => {
      this.inputsOf[j].forEach(i => {
        this.engine.extendedElegibilityTrace[j][i][unit] = 0;
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
      this.engine.derivativeTerm[k][unit] = this.gates
        .some(gate => gate.to === k && gate.from === k && gate.gater === unit)
        ? 1
        : 0;
    });
    // compute derivative term for unit gated by j
    this.gatersOf[unit].forEach(j => {
      this.engine.derivativeTerm[unit][j] = this.gates
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
}


// helper for removing duplicated ints from an array
function distinct(...arrays): number[] {
  const concated = arrays.reduce((concated, array) => concated.concat(array || []), []);
  let o = {}, a = [], i;
  for (i = 0; i < concated.length; o[concated[i++]] = 1);
  for (i in o) a.push(+i);
  return a;
}
