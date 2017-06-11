declare var Proxy;
import { DocumentNode, HeapReferenceNode, FunctionNode, ExpressionNode, BlockNode } from "./ast/nodes";
import { func, assignMul, mul, assign, number, assignSum, div, sum, exp, sub, document, max } from "./ast/operations";
import { buildActivationFunction, buildDerivativeFunction } from "./ast/activations";

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

export class Variable extends HeapReferenceNode {
  constructor(
    public id: number,
    public key: string,
    public initialValue: number,
    public tag: string
  ) {
    super(id);
  }
}

// -- Cost Types

export enum CostTypes {
  MEAN_SQUARE_ERROR,
  CROSS_ENTROPY,
  BINARY,
  HINGE,
  MEAN_SQUARE_LOG_ERROR,
  MEAN_ABSOLUTE_ERROR,
  MEAN_ABSOLUTE_PERCENTAGE_ERROR
}

// -- Activation Types

export enum ActivationTypes {
  LOGISTIC_SIGMOID,
  TANH,
  RELU,
  MAX_POOLING,
  DROPOUT,
  IDENTITY,
  // derivative 0
  SOFTMAX,
  // derivative 1
  INVERSE_IDENTITY,
  EXP,
  SOFTPLUS,
  SOFTSIGN,
  MAXOUT,
  GAUSSIAN,
  RELU_PLUSONE,
  STEP
}

// -- Status Types

export enum StatusTypes {
  IDLE,
  INIT,
  REVERSE_INIT,
  ACTIVATING,
  PROPAGATING,
  TRAINING,
  BUILDING
}


// -- Engine


export default class Lysergic {

  static ActivationTypes = ActivationTypes;
  static StatusTypes = StatusTypes;
  static CostTypes = CostTypes;
  static RandomGenerator = () => Math.random() * 2 - 1

  // algorithm
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

  // topology
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
  learningRate: number = 0.1;
  layers: number[][] = [];
  size: number = 0;
  random: Function = null;
  biasUnit: number = null;
  status: StatusTypes = StatusTypes.IDLE;

  // optimization
  locked: boolean = false;
  allocCount: number = 0;
  heap: ArrayBuffer = null;
  memory: Float64Array = null;
  variables: Dictionary<Variable> = {};
  inputs: Variable[] = [];
  outputs: Variable[] = [];
  targets: Variable[] = [];
  AST: DocumentNode = document();

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
    this.weight[j][i] = isSelfConnection ? 1 : weight == null ? this.random() * .3 + .1 : weight; // self-connections have a fixed weight of 1 (this is explained in the text between eq. 14 and eq. 15)
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

  toJSON(asString: boolean = false): object | string {
    const stringified = JSON.stringify({
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
    return asString ? stringified : JSON.parse(stringified);
  }

  static fromJSON(json: string | object) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const engine = new Lysergic();
    Object.keys(data).forEach(key => engine[key] = data[key]);
    return engine;
  }

  clone(): Lysergic {
    return Lysergic.fromJSON(this.toJSON());
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

  lock({ minHeapSize } = { minHeapSize: 0x10000 }): void {
    // cleanup
    this.allocCount = 0;
    this.variables = {};
    this.inputs = [];
    this.outputs = [];
    this.targets = [];
    this.AST = document();
    let outputLayer = this.layers.length - 1;

    // build AST
    this.alloc(`learningRate`, this.learningRate);
    this.alloc(`seed`, this.random());
    const activationFunction: FunctionNode = func('activate');
    this.AST.addNode(activationFunction);
    const propagationFunction: FunctionNode = func('propagate');
    this.AST.addNode(propagationFunction);
    if (this.biasUnit !== null) {
      this.alloc(`activation[${this.biasUnit}]`, this.activation[this.biasUnit]);
    }
    for (let layer = 0; layer < this.layers.length; layer++) {
      for (let unit = 0; unit < this.layers[layer].length; unit++) {
        let activationJ: Variable;
        switch (layer) {
          case 0:
            activationJ = this.alloc(`activation[${this.layers[layer][unit]}]`, this.activation[this.layers[layer][unit]], 'input');
            this.inputs.push(activationJ);
            break;
          case outputLayer:
            activationJ = this.buildActivation(this.layers[layer][unit], layer);
            this.outputs.push(activationJ);
            break;
          default:
            this.buildActivation(this.layers[layer][unit], layer);
        }
      }

      let softmaxUnits = [];

      for (let unit = 0; unit < this.layers[layer].length; unit++) {
        const type = this.activationFunction[this.layers[layer][unit]];

        if (type == ActivationTypes.SOFTMAX) {
          softmaxUnits.push(this.layers[layer][unit]);
        }
      }

      if (softmaxUnits.length > 1) {
        this.softmaxUnits(softmaxUnits, layer);
      }

      for (let unit = 0; unit < this.layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            this.buildActivationDerivative(this.layers[layer][unit], layer);
        }
      }

      for (let unit = 0; unit < this.layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            this.buildActivationTraces(this.layers[layer][unit], layer);
        }
      }
    }

    for (let unit = this.layers[outputLayer].length - 1; unit >= 0; unit--) {
      let targetJ = this.alloc(`target[${unit}]`, null, 'target');
      this.targets.push(targetJ);
      this.buildPropagation(this.layers[outputLayer][unit], outputLayer, targetJ);
    }

    for (let layer = this.layers.length - 2; layer > 0; layer--) {
      for (let unit = this.layers[layer].length - 1; unit >= 0; unit--) {
        this.buildPropagation(this.layers[layer][unit], layer);
      }
    }

    this.targets.reverse();

    // build heap and memory
    this.heap = new ArrayBuffer(Math.max(this.allocCount * 8, minHeapSize));
    this.memory = new Float64Array(this.heap);

    // fill buffer with initial values
    Object.keys(this.variables).forEach(key => {
      const variable = this.variables[key];
      if (typeof variable.initialValue === 'number') {
        this.memory[variable.id] = variable.initialValue;
      }
    });

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

    // lock engine
    this.locked = true;
  }

  unlock(): void {

    // proxy all dimensional properties
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

    // proxy learningRate and seed
    this.unproxyProperty('learningRate');
    this.unproxyProperty('seed');

    // cleanup
    this.allocCount = 0;
    this.heap = null;
    this.memory = null;
    this.variables = {};
    this.AST = document();

    // unlock engine
    this.locked = false;
  }

  private alloc(key: string, value: number, tag: string = null): Variable {
    if (!(key in this.variables)) {
      this.variables[key] = new Variable(this.allocCount++, key, value, tag);
    }
    return this.variables[key];
  }

  private getFunctionBodyNode(functionName: string): BlockNode {
    // grab the function node
    let activationFunction: FunctionNode = this.AST.children.find(node =>
      node instanceof FunctionNode && node.name === functionName
    ) as FunctionNode;

    return activationFunction.body;
  }

  private buildActivationDerivative(j: number, layerJ: number, targetFunction: string = 'activate'): Variable {
    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new BlockNode();
    blockNode.name = `Activation derivative ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);


    const stateJ = this.alloc(`state[${j}]`, this.state[j]);

    /*====================================================================================================================

    Eq. 16: compute activation derivative of j

    y'[j] = f'(j)

    ====================================================================================================================*/
    const activationJ = this.alloc(`activation[${j}]`, this.activation[j], 'output');
    const derivativeJ = this.alloc(`derivative[${j}]`, this.derivative[j]);

    const derivativeFunction = buildDerivativeFunction(stateJ, activationJ, this.activationFunction[j]);

    if (derivativeFunction) {
      statement(assign(derivativeJ, derivativeFunction));
    }

    // return the derivative of j
    return derivativeJ;
  }

  private buildActivationTraces(j: number, layerJ: number) {
    const layerNode = this.getFunctionBodyNode('activate');

    const blockNode = new BlockNode();
    blockNode.name = `Traces of ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);


    const activationJ = this.alloc(`activation[${j}]`, this.activation[j], 'output');
    const derivativeJ = this.alloc(`derivative[${j}]`, this.derivative[j]);

    const isSelfConnected = this.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = this.gates.some(gate => gate.to === j && gate.from === j);

    let i, k, h, g, l, a, to, from;
    /*====================================================================================================================

    Eq. 17: compute elegibility traces for j's inputs

    ε[j][i] = g[j][j] * w[j][j] * ε[j][i] + g[j][i] * y[i];

    ====================================================================================================================*/
    for (h = 0; h < this.inputSet[j].length; h++) {
      i = this.inputSet[j][h];
      const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, this.elegibilityTrace[j][i]);
      const activationI = this.alloc(`activation[${i}]`, this.activation[i]);
      const gainJI = this.alloc(`gain[${j}][${i}]`, this.gain[j][i]);

      if (isSelfConnected && isSelfConnectionGated) {
        const gainJJ = this.alloc(`gain[${j}][${j}]`, this.gain[j][j]);
        const weightJJ = this.alloc(`weight[${j}][${j}]`, this.weight[j][j]);
        statement(assign(elegibilityTraceJI, sum(mul(mul(gainJJ, weightJJ), elegibilityTraceJI), mul(gainJI, activationI))));
      } else if (isSelfConnected) {
        const weightJJ = this.alloc(`weight[${j}][${j}]`, this.weight[j][j]);
        statement(assign(elegibilityTraceJI, sum(mul(weightJJ, elegibilityTraceJI), mul(gainJI, activationI))));
      } else {
        statement(assign(elegibilityTraceJI, mul(gainJI, activationI)));
      }

      /*====================================================================================================================

      Eq. 18: comupute extended elegibility traces for j's inputs

      xε[j][i][k] = g[k][k] * w[k][k] * xε[j][i][k] + df(j) * ε[j][i] * bigParenthesisTerm(k, j)

      dt:     the derivative term is 1 if and only if j gates k's self-connection, otherwise is 0
      units:  this index runs over all the inputs of k, that are gated by j

      bigParenthesisTerm: (k, j) => dt * w[k][k] * s[k] + Σ(units.filter(a => a !== k), a => w[k][a] * y[a])

      ====================================================================================================================*/
      for (g = 0; g < this.gatedBy[j].length; g++) {
        k = this.gatedBy[j][g];

        const isSelfConnectedK = this.connections.some(connection => connection.to === k && connection.from === k);
        const isSelfConnectionGatedK = this.gates.some(gate => gate.to === k && gate.from === k);

        const bigParenthesisTermResult = this.alloc('bigParenthesisTermResult', null);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;
        if (isSelfConnectedK && this.derivativeTerm[k][j]) {
          const stateK = this.alloc(`state[${k}]`, this.state[k]);
          statement(assign(bigParenthesisTermResult, stateK));
          keepBigParenthesisTerm = true;
        } else {
          initializeBigParenthesisTerm = true;
        }


        for (l = 0; l < this.inputsOfGatedBy[k][j].length; l++) {
          a = this.inputsOfGatedBy[k][j][l];
          if (a !== k) {
            if (initializeBigParenthesisTerm) {
              statement(assign(bigParenthesisTermResult, number(0)));
              initializeBigParenthesisTerm = false;
            }
            const weightKA = this.alloc(`weight[${k}][${a}]`, this.weight[k][a]);
            const activationA = this.alloc(`activation[${a}]`, this.activation[a]);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }

        const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, this.extendedElegibilityTrace[j][i][k]);

        if (isSelfConnectedK && isSelfConnectionGatedK) {
          const gainKK = this.alloc(`gain[${k}][${k}]`, this.gain[k][k]);
          const weightKK = this.alloc(`weight[${k}][${k}]`, this.weight[k][k]);
          if (keepBigParenthesisTerm) {
            statement(assign(extendedElegibilityTraceJIK, sum(mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK), mul(mul(derivativeJ, elegibilityTraceJI), bigParenthesisTermResult))));
          } else {
            statement(assign(extendedElegibilityTraceJIK, mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK)));
          }
        } else if (isSelfConnectedK) {
          const weightKK = this.alloc(`weight[${k}][${k}]`, this.weight[k][k]);
          if (keepBigParenthesisTerm) {
            statement(assign(extendedElegibilityTraceJIK, sum(mul(weightKK, extendedElegibilityTraceJIK), mul(mul(derivativeJ, elegibilityTraceJI), bigParenthesisTermResult))));
          } else {
            statement(assign(extendedElegibilityTraceJIK, mul(weightKK, extendedElegibilityTraceJIK)));
          }
        } else {
          if (keepBigParenthesisTerm) {
            statement(assign(extendedElegibilityTraceJIK, mul(mul(derivativeJ, elegibilityTraceJI), bigParenthesisTermResult)));
          }
        }
      }
    }

    // Update the gain of the connections gated by j with its activation value
    for (h = 0; h < this.gatedBy[j].length; h++) {
      to = this.gatedBy[j][h];
      for (g = 0; g < this.inputsOfGatedBy[to][j].length; g++) {
        from = this.inputsOfGatedBy[to][j][g];
        const gainToFrom = this.alloc(`gain[${to}][${from}]`, this.gain[to][from]);
        statement(assign(gainToFrom, activationJ));
      }
    }
  }

  private softmaxUnits(units: number[], layerJ: number) {
    const layerNode = this.getFunctionBodyNode('activate');

    const blockNode = new BlockNode();
    blockNode.name = `Softmax ${layerJ}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    // --------- VARS ---------

    const activations: Variable[] = units.map($ => this.alloc(`activation[${$}]`, this.activation[$]));
    const derivatives: Variable[] = units.map($ => this.alloc(`derivative[${$}]`, this.derivative[$]));

    const maximum = this.alloc(`softmaxMaximum[${layerJ}]`, 0);
    const denominator = this.alloc(`softmaxDenominator[${layerJ}]`, 0);
    const nominators: Variable[] = [];

    units.forEach((unit, i) => {
      const nominator = this.alloc(`softmaxNominators[${layerJ}][${unit}]`, 0);
      nominators.push(nominator);
    });

    // --------- IMPL ---------

    // Activation
    statement(assign(maximum, number(0)));
    statement(assign(denominator, number(0)));

    // Find the maximum activation value
    // Snyman, Jan. Practical mathematical optimization: an introduction to basic optimization theory and
    // classical and new gradient-based algorithms. Vol. 97. Springer Science & Business Media, 2005.
    activations.forEach($ => {
      statement(assign(maximum, max(maximum, $)));
    });

    activations.forEach($ => {
      statement(assign($, exp(sub($, maximum))));
      statement(assignSum(denominator, $));
    });

    activations.forEach($ => {
      statement(assign($, div($, denominator)));
    });

    // Derivative
    activations.forEach(($, ix) => {
      statement(assign(derivatives[ix], mul($, sub(number(1), $))));
    });
  }

  private buildActivation(j: number, layerJ: number, targetFunction: string = 'activate'): Variable {
    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new BlockNode();
    blockNode.name = `Activation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    /*====================================================================================================================

    Eq. 15: compute state of j

    s[j] = g[j][j] * w[j][j] * s[j] + Σ(inputSet[j], i => g[j][i] * w[j][i] * y[i]);

    ====================================================================================================================*/
    let i, h;

    const stateJ = this.alloc(`state[${j}]`, this.state[j]);
    const isSelfConnected = this.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = this.gates.some(gate => gate.to === j && gate.from === j);

    if (isSelfConnected && isSelfConnectionGated) {
      const gainJJ = this.alloc(`gain[${j}][${j}]`, this.gain[j][j]);
      const weightJJ = this.alloc(`weight[${j}][${j}]`, this.weight[j][j]);
      statement(assignMul(stateJ, mul(gainJJ, weightJJ)));
    } else if (isSelfConnected) {
      const weightJJ = this.alloc(`weight[${j}][${j}]`, this.weight[j][j]);
      statement(assignMul(stateJ, weightJJ));
    } else {
      statement(assign(stateJ, number(0)));
    }

    for (h = 0; h < this.inputSet[j].length; h++) {
      i = this.inputSet[j][h];
      const isGated = this.gates.some(gate => gate.from === i && gate.to === j);
      if (isGated) {
        const stateJ = this.alloc(`state[${j}]`, this.state[j]);
        const gainJI = this.alloc(`gain[${j}][${i}]`, this.gain[j][i]);
        const weightJI = this.alloc(`weight[${j}][${i}]`, this.weight[j][i]);
        const activationI = this.alloc(`activation[${i}]`, this.activation[i]);
        statement(assignSum(stateJ, mul(mul(gainJI, weightJI), activationI)));
      } else {
        const stateJ = this.alloc(`state[${j}]`, this.state[j]);
        const weightJI = this.alloc(`weight[${j}][${i}]`, this.weight[j][i]);
        const activationI = this.alloc(`activation[${i}]`, this.activation[i]);
        statement(assignSum(stateJ, mul(weightJI, activationI)));
      }
    }

    /*====================================================================================================================

    Eq. 16: compute activation of j (and cache derivative for later use)

    y[j] = f(j)
    y'[j] = f'(j)

    ====================================================================================================================*/
    const activationJ = this.alloc(`activation[${j}]`, this.activation[j], 'output');

    const activationFunction = buildActivationFunction(stateJ, this.activationFunction[j]);

    if (activationFunction) {
      statement(assign(activationJ, activationFunction));
    }

    // return the activation of j
    return activationJ;
  }

  private buildPropagation(j: number, layerJ: number, targetJ?: Variable) {
    const layerNode = this.getFunctionBodyNode('propagate');

    const blockNode = new BlockNode();
    blockNode.name = `Propagation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    // step 1: compute error responsibility (δ) for j

    let i, k, h, g, l, a;
    let hasProjectedError = this.projectionSet[j].length > 0;
    const hasGatedError = this.gateSet[j].length > 0;

    /*====================================================================================================================

    Eq. 10: this is only for output neurons, the error is injected from the environment

    δ[j] = δP[j] = target - y[j];

    ====================================================================================================================*/
    if (typeof targetJ !== 'undefined') {
      hasProjectedError = true;
      const errorResponsibilityJ = this.alloc(`errorResponsibility[${j}]`, this.errorResponsibility[j]);
      const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, this.projectedErrorResponsibility[j]);
      const activationJ = this.alloc(`activation[${j}]`, this.activation[j]);
      statement(assign(errorResponsibilityJ, sub(targetJ, activationJ)));
      statement(assign(projectedErrorResponsibilityJ, errorResponsibilityJ));
    } else {
      /*====================================================================================================================

      Eq. 21: compute projected error responsibility for j

      δP[j] = df(j) * Σ(P[j], k => δ[k] * g[k][j] * w[k][j]);

      ====================================================================================================================*/
      const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, this.projectedErrorResponsibility[j]);
      if (hasProjectedError) {
        statement(assign(projectedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < this.projectionSet[j].length; h++) {
        k = this.projectionSet[j][h];
        const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, this.errorResponsibility[k]);
        const isGated = this.gates.some(gate => gate.to === k && gate.from === j);
        if (isGated) {
          const weightKJ = this.alloc(`weight[${k}][${j}]`, this.weight[k][j]);
          const gainKJ = this.alloc(`gain[${k}][${j}]`, this.gain[k][j]);
          statement(assignSum(projectedErrorResponsibilityJ, mul(mul(gainKJ, weightKJ), errorResponsibilityK)));
        } else {
          const weightKJ = this.alloc(`weight[${k}][${j}]`, this.weight[k][j]);
          statement(assignSum(projectedErrorResponsibilityJ, mul(weightKJ, errorResponsibilityK)));
        }
      }
      const derivativeJ = this.alloc(`derivative[${j}]`, this.derivative[j]);
      if (hasProjectedError) {
        statement(assignMul(projectedErrorResponsibilityJ, derivativeJ));
      }

      /*====================================================================================================================

      Eq. 22: compute gated error responsibility for j

      δG[j] = df(j) * Σ(G[j], k => δ[k] * bigParenthesisTerm(k, j))

      dt:     the derivative term is 1 if and only if j gates k's self-connection, otherwise is 0
      units:  this index runs over all the inputs of k, that are gated by j

      bigParenthesisTerm: (k, j) => dt * w[k][k] * s[k] + Σ(units.filter(a => a !== k), a => w[k][a] * y[a])

      ====================================================================================================================*/
      const gatedErrorResponsibilityJ = this.alloc(`gatedErrorResponsibility[${j}]`, this.gatedErrorResponsibility[j]);
      if (hasGatedError) {
        statement(assignMul(gatedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < this.gateSet[j].length; h++) {
        k = this.gateSet[j][h];
        const isSelfConnectedK = this.connections.some(connection => connection.to === k && connection.from === k);
        const bigParenthesisTermResult = this.alloc('bigParenthesisTermResult', null);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;

        if (isSelfConnectedK && this.derivativeTerm[k][j]) {
          const stateK = this.alloc(`state[${k}]`, this.state[k]);
          statement(assign(bigParenthesisTermResult, stateK));
          keepBigParenthesisTerm = true;
        } else {
          initializeBigParenthesisTerm = true;
        }
        for (l = 0; l < this.inputsOfGatedBy[k][j].length; l++) {
          a = this.inputsOfGatedBy[k][j][l];
          if (a !== k) {
            if (initializeBigParenthesisTerm) {
              statement(assign(bigParenthesisTermResult, number(0)));
              initializeBigParenthesisTerm = false;
            }
            const weightKA = this.alloc(`weight[${k}][${a}]`, this.weight[k][a]);
            const activationA = this.alloc(`activation[${a}]`, this.activation[a]);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }
        if (keepBigParenthesisTerm) {
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, this.errorResponsibility[k]);
          statement(assignSum(gatedErrorResponsibilityJ, mul(errorResponsibilityK, bigParenthesisTermResult)));
        }
      }
      if (hasGatedError) {
        statement(assignMul(gatedErrorResponsibilityJ, derivativeJ));
      }

      /*====================================================================================================================

      Eq. 22: compute error responsibility for j

      δ[j] = δP[j] + δG[j];

      ====================================================================================================================*/
      const errorResponsibilityJ = this.alloc(`errorResponsibility[${j}]`, this.errorResponsibility[j]);
      if (hasProjectedError && hasGatedError) {
        statement(assign(errorResponsibilityJ, sum(projectedErrorResponsibilityJ, gatedErrorResponsibilityJ)));
      } else if (hasProjectedError) {
        statement(assign(errorResponsibilityJ, projectedErrorResponsibilityJ));
      } else if (hasGatedError) {
        statement(assign(errorResponsibilityJ, gatedErrorResponsibilityJ));
      }
    }

    /*====================================================================================================================

    Eq. 24: compute error responsibility for j

    Δw = α * δP[j] * ε[j][i] + α * Σ(G[j], k => δ[k] * xε[j][i][k])

    and adjust the weights using the deltas

    w[j][i] += Δw

    ====================================================================================================================*/
    for (h = 0; h < this.inputSet[j].length; h++) {
      if (hasProjectedError && hasGatedError) {
        i = this.inputSet[j][h];
        const Δw = this.alloc(`Δw`, null);
        const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, this.projectedErrorResponsibility[j]);
        const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, this.elegibilityTrace[j][i]);
        statement(assign(Δw, mul(projectedErrorResponsibilityJ, elegibilityTraceJI)));
        for (g = 0; g < this.gateSet[j].length; g++) {
          k = this.gateSet[j][g];
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, this.errorResponsibility[k]);
          const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, this.extendedElegibilityTrace[j][i][k]);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.alloc('learningRate', this.learningRate);
        statement(assignMul(Δw, learningRate));
        const weightJI = this.alloc(`weight[${j}][${i}]`, this.weight[j][i]);
        statement(assignSum(weightJI, Δw));
      } else if (hasProjectedError) {
        i = this.inputSet[j][h];
        const weightJI = this.alloc(`weight[${j}][${i}]`, this.weight[j][i]);
        const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, this.projectedErrorResponsibility[j]);
        const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, this.elegibilityTrace[j][i]);
        const learningRate = this.alloc('learningRate', this.learningRate);
        statement(assignSum(weightJI, mul(mul(projectedErrorResponsibilityJ, elegibilityTraceJI), learningRate)));
      } else if (hasGatedError) {
        i = this.inputSet[j][h];
        const Δw = this.alloc(`Δw`, null);
        statement(assign(Δw, number(0)));
        for (g = 0; g < this.gateSet[j].length; g++) {
          k = this.gateSet[j][g];
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, this.errorResponsibility[k]);
          const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, this.extendedElegibilityTrace[j][i][k]);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.alloc('learningRate', this.learningRate);
        statement(assignMul(Δw, learningRate));
        const weightJI = this.alloc(`weight[${j}][${i}]`, this.weight[j][i]);
        statement(assignSum(weightJI, Δw));
      }
    }
  }

  // define a proxy from a given property to the memory array
  private proxyProperty(name: string) {
    const memory = this.memory;
    const variables = this.variables;
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
  private proxyDimensions(id: string, dimensions: number, parent: any = this, key: string = id) {
    if (dimensions > 1) {
      for (let propKey = 0; propKey < parent[key].length; propKey++) {
        this.proxyDimensions(`${id}[${propKey}]`, dimensions - 1, parent[key], propKey.toString());
      }
    } else if (key in parent) { // not all the properties in the engine are in the heap (ie. the state of the input units)

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
                const variable = that.variables[`${id}[${index}]`];
                if (variable) {
                  value.push(that.memory[variable.id]);
                } else {
                  value.push(0);
                }
              }
              return value;
            };
          }
          const variable: Variable = that.variables[`${id}[${prop}]`];
          if (variable) {
            return that.memory[variable.id];
          }
          return 0;
        },
        set(obj, prop: string, newValue: number) {
          const variable: Variable = that.variables[`${id}[${prop}]`];
          if (variable) {
            that.memory[variable.id] = newValue;
          }
        }
      });
    }
  }

  // replace multidimentional proxy with a multidimensional array of values
  private unproxyDimensions(id: string, dimensions: number, parent: any = this, key: string = id) {
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
      value: this.memory[this.variables[name].id],
      writable: true,
      enumerable: true,
      configurable: true
    });
  }

  getAST() {
    if (!this.locked) {
      this.lock();
    }
    return this.AST;
  }

  getVariables() {
    if (!this.locked) {
      this.lock();
    }
    return Object.keys(this.variables).map(key => this.variables[key]);
  }

  setInputs(inputs: number[]) {
    for (let i = 0; i < inputs.length; i++) {
      this.memory[this.inputs[i].id] = inputs[i];
    }
  }

  getOutputs(): number[] {
    const outputs = new Array(this.outputs.length);
    for (let i = 0; i < this.outputs.length; i++) {
      outputs[i] = this.memory[this.outputs[i].id];
    }
    return outputs;
  }

  setTargets(targets: number[]) {
    for (let i = 0; i < this.targets.length; i++) {
      this.memory[this.targets[i].id] = targets[i];
    }
  }

  static costFunction(target: number[], predicted: ArrayLike<number>, costType: CostTypes): number {
    let i: number, x = 0;

    switch (costType) {
      case CostTypes.HINGE:
        for (i = 0; i < predicted.length; i++) {
          x += Math.max(0, 1 - target[i] * predicted[i]);
        }
        return x;

      case CostTypes.MEAN_ABSOLUTE_PERCENTAGE_ERROR:
        for (i = 0; i < predicted.length; i++) {
          x += Math.abs((predicted[i] - target[i]) / Math.max(target[i], 1e-15));
        }
        return x / predicted.length;

      case CostTypes.MEAN_SQUARE_LOG_ERROR:
        for (i = 0; i < predicted.length; i++) {
          x += Math.log(Math.max(target[i], 1e-15)) - Math.log(Math.max(predicted[i], 1e-15));
        }
        return x;

      case CostTypes.MEAN_SQUARE_ERROR:
        for (i = 0; i < target.length; i++) {
          x += Math.pow(target[i] - predicted[i], 2);
        }
        return x / target.length;

      case CostTypes.MEAN_ABSOLUTE_ERROR:
        for (i = 0; i < predicted.length; i++) {
          x += Math.abs(target[i] - predicted[i]);
        }
        return x / predicted.length;

      case CostTypes.CROSS_ENTROPY:
        for (i = 0; i < target.length; i++) {
          x -= (target[i] * Math.log(predicted[i] + 1e-15)) + ((1 - target[i]) * Math.log((1 + 1e-15) - predicted[i])); // +1e-15 is a tiny push away to avoid Math.log(0)
        }
        return x;

      case CostTypes.BINARY:
        for (i = 0; i < target.length; i++) {
          x += Math.round(target[i] * 2) != Math.round(predicted[i] * 2) ? 1 : 0;
        }
        return x;
    }
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
