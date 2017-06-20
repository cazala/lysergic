import { Variable } from "./ast/nodes";
declare var console;
export interface IHeapOptions {

}

export interface Dictionary<T> {
  [key: string]: T;
}

export interface IBuildHeapOptions {
  minHeapSize?: number;
  buffer?: ArrayBuffer;
}

export class Heap {
  buffer: ArrayBuffer = null;
  memory: Float64Array = null;

  constructor(public options: IHeapOptions) { }

  allocationCount: number = 0;
  private variables: Dictionary<Variable> = {};

  private alloc(key: string, value: number, tag: string = null): Variable {
    if (!(key in this.variables)) {
      this.variables[key] = new Variable(this.allocationCount++, key, value, tag);
    }
    this.variables[key].initialValue = value || 0;
    return this.variables[key];
  }

  setVariable(key: string, value: number): Variable;
  setVariable(key: string, i: number, value: number): Variable;
  setVariable(key: string, i: number, j: number, value: number): Variable;
  setVariable(key: string, i: number, j: number, k: number, value: number): Variable;
  setVariable(key: string, ...indexes: number[]) {
    let value = indexes.pop();
    const variableKey = key + indexes.map($ => `[${$}]`).join('');
    return this.alloc(variableKey, value);
  }

  getVariable(key: string): Variable;
  getVariable(key: string, i: number): Variable;
  getVariable(key: string, i: number, j: number): Variable;
  getVariable(key: string, i: number, j: number, k: number): Variable;
  getVariable(key: string, ...indexes: number[]) {
    const variableKey = key + indexes.map($ => `[${$}]`).join('');
    let variable = this.variables[variableKey];
    if (!variable) {
      console.dir(this.variables);
      throw new Error(variableKey + ' is not declared');
    }
    return variable;
  }

  hasVariable(key: string): boolean;
  hasVariable(key: string, i: number): boolean;
  hasVariable(key: string, i: number, j: number): boolean;
  hasVariable(key: string, i: number, j: number, k: number): boolean;
  hasVariable(key: string, ...indexes: number[]) {
    return !!this.variables[key + indexes.map($ => `[${$}]`).join('')];
  }


  sortVariables() {
    const variables = this.variables;


    let keys = Object.keys(variables).map($ => ({
      original: variables[$],
      standard: $.replace(/\[(\d+)\]/g, function (a, $) {
        return '[' + ('00000000' + $).substr(-9) + ']';
      })
    }));

    keys.sort((a, b) => {
      if (a.standard > b.standard) return 1;
      return -1;
    });

    // wipe variables
    this.variables = {};
    keys.forEach(($, $$) => {
      this.variables[$.original.key] = $.original;
      // variables[$.original].position = $$;
    });
  }

  async build({ minHeapSize = 0x10000, buffer }: IBuildHeapOptions = {}) {
    this.sortVariables();

    const variables = this.getVariables();

    variables.forEach($ => {
      if (($.position + 1) > this.allocationCount)
        this.allocationCount = $.position + 1;
    });

    // build heap and memory
    this.buffer = buffer || new ArrayBuffer(Math.max(this.allocationCount * 8, minHeapSize));
    this.memory = new Float64Array(this.buffer);

    // fill buffer with initial values
    variables
      .forEach(variable => {
        if (typeof variable.initialValue === 'number') {
          this.memory[variable.id] = variable.initialValue;
        }
      });
  }

  getVariables() {
    return Object.keys(this.variables).map(key => this.variables[key]);
  }
}
