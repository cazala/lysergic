
import Engine from "./Engine";
import Topology, { ITopoloyUnitOptions } from "./Topology";
import AST, { Variable } from "./AST";
import Heap from "./Heap";
import { DocumentNode } from "./ast/nodes";

export enum LysergicStatus {
  UNLOCKED,
  LOCKED
}

export interface ILysergicOptions {
  generator?: () => number;
  bias?: boolean;
}

export default class Lysergic {

  engine: Engine = null;
  topology: Topology = null;
  ast: AST = null;
  heap: Heap = null;
  status: LysergicStatus = LysergicStatus.UNLOCKED;

  constructor(options: ILysergicOptions = {}) {
    this.engine = new Engine(options);
    this.topology = new Topology({ engine: this.engine });
    this.ast = new AST({ topology: this.topology });
    this.heap = new Heap({ ast: this.ast });
    this.status = LysergicStatus.UNLOCKED;
  }

  addUnit(options: ITopoloyUnitOptions) {
    this.topology.addUnit(options);
  }

  addConnection(from, to, weight) {
    this.topology.addConnection(from, to, weight);
  }

  addGate(from, to, gater) {
    this.topology.addGate(from, to, gater);
  }

  build() {
    if (this.status === LysergicStatus.UNLOCKED) {
      this.ast.build();
      this.heap.build();
      this.status = LysergicStatus.LOCKED;
    }
  }

  reset() {
    if (this.status === LysergicStatus.LOCKED) {
      this.ast.reset();
      this.heap.reset();
      this.status = LysergicStatus.UNLOCKED;
    }
  }

  getAST(): DocumentNode {
    this.build();
    return this.ast.getDocument();
  }

  getVariables(): Variable[] {
    this.build();
    return this.ast.getVariables();
  }

  getBuffer(): ArrayBuffer {
    this.build();
    return this.heap.buffer;
  }

  getMemory(): Float64Array {
    this.build();
    return this.heap.memory;
  }

  setInputs(inputs: number[]) {
    this.heap.setInputs(inputs);
  }

  getOutputs(): number[] {
    return this.heap.getOutputs();
  }

  setTargets(targets: number[]) {
    this.heap.setTargets(targets);
  }

  toJSON(asString: boolean = false): object | string {
    const stringified = JSON.stringify({
      learningRate: this.engine.learningRate,
      size: this.engine.size,
      state: this.engine.state,
      weight: this.engine.weight,
      gain: this.engine.gain,
      activation: this.engine.activation,
      derivative: this.engine.derivative,
      elegibilityTrace: this.engine.elegibilityTrace,
      extendedElegibilityTrace: this.engine.extendedElegibilityTrace,
      errorResponsibility: this.engine.errorResponsibility,
      projectedErrorResponsibility: this.engine.projectedErrorResponsibility,
      gatedErrorResponsibility: this.engine.gatedErrorResponsibility,
      activationFunction: this.engine.activationFunction,
      derivativeTerm: this.engine.derivativeTerm,
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
      layers: this.topology.layers
    });
    return asString ? stringified : JSON.parse(stringified);
  }

  static fromJSON(json: string | object) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const compiler = new Lysergic();
    compiler.engine.learningRate = data.learningRate;
    compiler.engine.size = data.size;
    compiler.engine.state = data.state;
    compiler.engine.weight = data.weight;
    compiler.engine.gain = data.gain;
    compiler.engine.activation = data.activation;
    compiler.engine.derivative = data.derivative;
    compiler.engine.elegibilityTrace = data.elegibilityTrace;
    compiler.engine.extendedElegibilityTrace = data.extendedElegibilityTrace;
    compiler.engine.errorResponsibility = data.errorResponsibility;
    compiler.engine.projectedErrorResponsibility = data.projectedErrorResponsibility;
    compiler.engine.gatedErrorResponsibility = data.gatedErrorResponsibility;
    compiler.engine.activationFunction = data.activationFunction;
    compiler.engine.derivativeTerm = data.derivativeTerm;
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
    return compiler;
  }

  clone(): Lysergic {
    return Lysergic.fromJSON(this.toJSON());
  }
}

