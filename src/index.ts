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
  bias?: boolean;
  learningRate?: number;
  heap?: Heap.Heap;
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
  get learningRate(): number {
    return this.heap.getVariable(`learningRate`).initialValue;
  }

  set learningRate(val: number) {
    let lr = +val;
    if (isNaN(lr) || lr <= 0) {
      throw new Error('learningRate must be a positive number');
    }
    this.heap.setVariable(`learningRate`, lr);
  }

  engineStatus: StatusTypes = StatusTypes.IDLE;

  topology: Topology.Topology = null;
  ast: AST.AST = null;
  heap: Heap.Heap = null;
  status: LysergicStatus = LysergicStatus.UNLOCKED;

  constructor(public options: ILysergicOptions = {}) {
    this.heap = options.heap || new Heap.Heap();
    this.learningRate = options.learningRate || 0.1;
    this.topology = new Topology.Topology({ heap: this.heap, bias: options.bias });
    this.ast = new AST.AST({ topology: this.topology });
  }

  addUnit(options: Topology.ITopologyUnitOptions) {
    if (this.status === LysergicStatus.LOCKED)
      throw new Error('The network is locked');

    options = { bias: this.options.bias, ...options };

    return this.topology.addUnit(options);
  }

  addLayer(size: number, options: Topology.ITopologyUnitOptions) {
    if (this.status === LysergicStatus.LOCKED)
      throw new Error('The network is locked');

    options = { bias: this.options.bias, ...options };

    return this.topology.addLayer(size, options);
  }

  addConnection(from: number, to: number, weight: number) {
    if (this.status === LysergicStatus.LOCKED)
      throw new Error('The network is locked');

    this.topology.addConnection(from, to, weight);
  }

  addGate(from, to, gater) {
    if (this.status === LysergicStatus.LOCKED)
      throw new Error('The network is locked');
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
    if (this.status == LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }

    return this.ast.getDocument();
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

    const memory = await this.getMemory();

    for (let i = 0; i < inputs.length; i++) {
      memory[this.ast.inputs[i].id] = inputs[i];
    }
  }

  async getOutputs(): Promise<ArrayLike<number>> {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }

    const memory = await this.getMemory();

    const outputs = new Array(this.ast.outputs.length);
    for (let i = 0; i < this.ast.outputs.length; i++) {
      outputs[i] = memory[this.ast.outputs[i].id];
    }

    return outputs;
  }

  async setTargets(targets: number[]) {
    if (this.status === LysergicStatus.UNLOCKED) {
      throw new Error('You need to build the network first');
    }

    const memory = await this.getMemory();

    for (let i = 0; i < this.ast.targets.length; i++) {
      memory[this.ast.targets[i].id] = targets[i];
    }
  }

  toJSON(asString: boolean = false): object | string {
    let variables = {};

    this.heap.sortVariables();

    this.heap.getVariables().forEach($ => {
      variables[$.key] = $.initialValue;
    });

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
      units: this.topology.units,
      layers: this.topology.layers,
      activationFunction: this.topology.activationFunction
    });
    return asString ? stringified : JSON.parse(stringified);
  }

  static fromJSON(json: string | object) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    const variables = data.variables;

    const heap = new Heap.Heap({});

    Object.keys(variables).map($ => {
      heap.setVariable($, variables[$]);
    });

    const compiler = new Lysergic({ heap });
    compiler.learningRate = data.learningRate;
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
    compiler.topology.units = data.units;
    compiler.topology.activationFunction = data.activationFunction;
    return compiler;
  }

  clone(): Lysergic {
    return Lysergic.fromJSON(this.toJSON());
  }
}

