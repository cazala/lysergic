import Topology = require("./Topology");
import AST = require("./AST");
import Heap = require("./Heap");
import nodes = require("./ast/nodes");
import Activations = require('./ast/activations');

export {
  Lysergic,
  Topology,
  AST,
  Heap,
  Activations,
  nodes
};

export enum LysergicStatus {
  UNLOCKED,
  LOCKED
}

export interface ILysergicOptions {
  generator?: () => number;
  bias?: boolean;
}

export enum StatusTypes {
  IDLE,
  INIT,
  REVERSE_INIT,
  ACTIVATING,
  PROPAGATING,
  TRAINING,
  BUILDING
}

export default class Lysergic {
  static RandomGenerator = () => Math.random() * 2 - 1;

  learningRate = 0.1;

  engineStatus: StatusTypes = StatusTypes.IDLE;

  topology: Topology.Topology = null;
  ast: AST.AST = null;
  heap: Heap.Heap = null;
  status: LysergicStatus = LysergicStatus.UNLOCKED;

  random: () => number = Lysergic.RandomGenerator;

  constructor(options: ILysergicOptions = {}) {
    this.topology = new Topology.Topology({ engine: this, bias: options.bias });
    this.ast = new AST.AST({ topology: this.topology });
    this.heap = new Heap.Heap({ ast: this.ast });
    this.status = LysergicStatus.UNLOCKED;

    // if using bias, create a bias unit, with a fixed activation of 1
    if (options.bias) {
      this.topology.biasUnit = this.topology.addUnit();
      this.ast.setVariable('activation', this.topology.biasUnit, 1);
    }
  }

  addUnit(options: Topology.ITopoloyUnitOptions) {
    return this.topology.addUnit(options);
  }

  addConnection(from, to, weight) {
    this.topology.addConnection(from, to, weight);
  }

  addGate(from, to, gater) {
    this.topology.addGate(from, to, gater);
  }

  async build() {
    if (this.status === LysergicStatus.UNLOCKED) {
      this.topology.normalize();
      this.ast.build();
      await this.heap.build();
      this.status = LysergicStatus.LOCKED;
    }
  }

  getAST(): nodes.DocumentNode {
    if (this.status == LysergicStatus.UNLOCKED)
      throw new Error('You need to build the network first');

    return this.ast.getDocument();
  }

  getVariables(): AST.nodes.Variable[] {
    return this.ast.getVariables();
  }

  async getBuffer(): Promise<ArrayBuffer> {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }

    return this.heap.buffer;
  }

  async getMemory(): Promise<Float64Array> {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }
    return this.heap.memory;
  }

  async setInputs(inputs: number[]) {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }
    await this.heap.setInputs(inputs);
  }

  async getOutputs(): Promise<ArrayLike<number>> {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }
    return await this.heap.getOutputs();
  }

  async setTargets(targets: number[]) {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }
    await this.heap.setTargets(targets);
  }

  toJSON(asString: boolean = false): object | string {
    let variables = {};

    Object.keys(this.ast.variables).map($ => variables[$] = this.ast.variables[$].initialValue);

    const stringified = JSON.stringify({
      learningRate: this.learningRate,
      variables,
      biasUnit: this.topology.biasUnit,
      inputsOf: this.topology.inputsOf,
      projectedBy: this.topology.projectedBy,
      gatersOf: this.topology.gatersOf,
      gatedBy: this.topology.gatedBy,
      inputsOfGatedBy: this.topology.inputsOfGatedBy,
      projectionSet: this.topology.projectionSet,
      gateSet: this.topology.gateSet,
      inputSet: this.topology.inputSet,
      connections: this.topology.connections,
      gates: this.topology.gates,
      layers: this.topology.layers,
      activationFunction: this.topology.activationFunction
    });
    return asString ? stringified : JSON.parse(stringified);
  }

  static fromJSON(json: string | object) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const compiler = new Lysergic();
    compiler.learningRate = data.learningRate;

    const variables = data.variables;

    Object.keys(variables).map($ => {
      compiler.ast.setVariable($, variables[$]);
    });

    compiler.topology.biasUnit = data.biasUnit;
    compiler.topology.inputsOf = data.inputsOf;
    compiler.topology.projectedBy = data.projectedBy;
    compiler.topology.gatersOf = data.gatersOf;
    compiler.topology.gatedBy = data.gatedBy;
    compiler.topology.inputsOfGatedBy = data.inputsOfGatedBy;
    compiler.topology.projectionSet = data.projectionSet;
    compiler.topology.gateSet = data.gateSet;
    compiler.topology.inputSet = data.inputSet;
    compiler.topology.connections = data.connections;
    compiler.topology.gates = data.gates;
    compiler.topology.layers = data.layers;
    compiler.topology.activationFunction = data.activationFunction;
    return compiler;
  }

  clone(): Lysergic {
    return Lysergic.fromJSON(this.toJSON());
  }
}

