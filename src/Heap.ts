declare var Proxy;

import Engine from "./Engine";
import AST, { Variable } from "./AST";

export interface IHeapOptions {
  ast?: AST;
}

export interface IBuildHeapOptions {
  minHeapSize?: number;
}

export default class Heap {

  AST: AST;
  buffer: ArrayBuffer = null;
  memory: Float64Array = null;

  constructor({ ast = new AST() }: IHeapOptions = {}) {
    this.AST = ast;
  }

  build({ minHeapSize = 0x10000 }: IBuildHeapOptions = {}): void {
    // cleanup
    this.reset();

    // build heap and memory
    this.buffer = new ArrayBuffer(Math.max(this.AST.count * 8, minHeapSize));
    this.memory = new Float64Array(this.buffer);

    // fill buffer with initial values
    this.AST.getVariables()
      .forEach(variable => {
        if (typeof variable.initialValue === 'number') {
          this.memory[variable.id] = variable.initialValue;
        }
      });

    // proxy all properties
    this.proxy();
  }

  reset(): void {
    // cleanup
    this.buffer = null;
    this.memory = null;
    // unproxy all properties
    this.unproxy();
  }

  private proxy() {
    // proxy all dimensional properties
    this.proxyDimensions('state', 1);
    this.proxyDimensions('weight', 2);
    this.proxyDimensions('gain', 2);
    this.proxyDimensions('activation', 1);
    this.proxyDimensions('derivative', 1);
    this.proxyDimensions('elegibilityTrace', 2);
    this.proxyDimensions('extendedElegibilityTrace', 3);
    this.proxyDimensions('errorResponsibility', 1);
    this.proxyDimensions('projectedErrorResponsibility', 1);
    this.proxyDimensions('gatedErrorResponsibility', 1);

    // proxy learningRate and seed
    this.proxyProperty('learningRate');
    this.proxyProperty('seed');
  }

  private unproxy() {
    // unproxy all dimensional properties
    this.unproxyDimensions('state', 1);
    this.unproxyDimensions('weight', 2);
    this.unproxyDimensions('gain', 2);
    this.unproxyDimensions('activation', 1);
    this.unproxyDimensions('derivative', 1);
    this.unproxyDimensions('elegibilityTrace', 2);
    this.unproxyDimensions('extendedElegibilityTrace', 3);
    this.unproxyDimensions('errorResponsibility', 1);
    this.unproxyDimensions('projectedErrorResponsibility', 1);
    this.unproxyDimensions('gatedErrorResponsibility', 1);

    // unproxy learningRate and seed
    this.unproxyProperty('learningRate');
    this.unproxyProperty('seed');
  }

  // define a proxy from a given property to the memory array
  private proxyProperty(name: string) {
    const memory = this.memory;
    const variables = this.AST.variables;
    Object.defineProperty(this, name, {
      get() {
        return memory[variables[name].id];
      },
      set(newValue) {
        memory[variables[name].id] = newValue;
      },
      enumerable: true,
      configurable: true
    });
  }

  // define a multidimensional proxy for a given property
  private proxyDimensions(id: string, dimensions: number, parent: Engine = this.AST.topology.engine, key: string = id) {
    if (dimensions > 1) {
      for (let propKey = 0; propKey < parent[key].length; propKey++) {
        this.proxyDimensions(`${id}[${propKey}]`, dimensions - 1, parent[key], propKey.toString());
      }
    } else if (key in parent) { // not all the properties in the engine are in the heap (ie. the state of the input units)
      if (!parent[key]) {
        parent[key] = [];
        return;
      }
      const length = parent[key].length;
      let that = this;
      parent[key] = new Proxy({}, {
        get(obj, prop: string) {
          if (prop === 'length') {
            return length;
          }
          if (prop === 'toJSON') {
            return () => {
              let value: number[] = [];
              for (let index = 0; index < length; index++) {
                const variable = that.AST.variables[`${id}[${index}]`];
                if (variable) {
                  value.push(that.memory[variable.id]);
                } else {
                  value.push(0);
                }
              }
              return value;
            };
          }
          const variable: Variable = that.AST.variables[`${id}[${prop}]`];
          if (variable) {
            return that.memory[variable.id];
          }
          return 0;
        },
        set(obj, prop: string, newValue: number) {
          const variable: Variable = that.AST.variables[`${id}[${prop}]`];
          if (variable) {
            that.memory[variable.id] = newValue;
          }
        }
      });
    }
  }

  // replace multidimentional proxy with a multidimensional array of values
  private unproxyDimensions(id: string, dimensions: number, parent: Engine = this.AST.topology.engine, key: string = id) {
    if (dimensions > 1) {
      for (let propKey = 0; propKey < parent[key].length; propKey++) {
        this.unproxyDimensions(`${id}[${propKey}]`, dimensions - 1, parent[key], propKey.toString());
      }
    } else if (key in parent) {
      const array = [];
      for (let i = 0; i < parent[key].length; i++) {
        array[i] = parent[key][i];
      }
      parent[key] = array;
    }
  }

  // replace a proxy with an actual value
  private unproxyProperty(name: string) {
    Object.defineProperty(this, name, {
      value: this.memory[this.AST.variables[name].id],
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  setInputs(inputs: number[]) {
    for (let i = 0; i < inputs.length; i++) {
      this.memory[this.AST.inputs[i].id] = inputs[i];
    }
  }

  getOutputs(): number[] {
    const outputs = new Array(this.AST.outputs.length);
    for (let i = 0; i < this.AST.outputs.length; i++) {
      outputs[i] = this.memory[this.AST.outputs[i].id];
    }
    return outputs;
  }

  setTargets(targets: number[]) {
    for (let i = 0; i < this.AST.targets.length; i++) {
      this.memory[this.AST.targets[i].id] = targets[i];
    }
  }
}
