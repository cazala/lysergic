import { AST } from "./AST";
// import { Variable } from "./ast/nodes";

export interface IHeapOptions {
  ast: AST;
}

export interface IBuildHeapOptions {
  minHeapSize?: number;
  buffer?: ArrayBuffer;
}

export class Heap {
  AST: AST;
  buffer: ArrayBuffer = null;
  memory: Float64Array = null;

  constructor(options: IHeapOptions) {
    const { ast } = options;
    this.AST = ast;
  }

  async build({ minHeapSize = 0x10000, buffer }: IBuildHeapOptions = {}) {
    this.AST.topology.normalize();

    // build heap and memory
    this.buffer = buffer || new ArrayBuffer(Math.min(this.AST.allocationCount * 8, minHeapSize));
    this.memory = new Float64Array(this.buffer);

    // fill buffer with initial values
    this.AST.getVariables()
      .forEach(variable => {
        if (typeof variable.initialValue === 'number') {
          this.memory[variable.id] = variable.initialValue;
        }
      });
  }

  async setInputs(inputs: number[]) {
    for (let i = 0; i < inputs.length; i++) {
      this.memory[this.AST.inputs[i].id] = inputs[i];
    }
  }

  async getOutputs(): Promise<ArrayLike<number>> {
    const outputs = new Array(this.AST.outputs.length);
    for (let i = 0; i < this.AST.outputs.length; i++) {
      outputs[i] = this.memory[this.AST.outputs[i].id];
    }
    return outputs;
  }

  async setTargets(targets: number[]) {
    for (let i = 0; i < this.AST.targets.length; i++) {
      this.memory[this.AST.targets[i].id] = targets[i];
    }
  }
}
