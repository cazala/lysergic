import { DocumentNode, HeapReferenceNode, FunctionNode, ExpressionNode, BlockNode } from "./ast/nodes";
import { func, assignMul, mul, assign, number, assignSum, div, sum, exp, sub, document, max, assignSub } from "./ast/operations";
import { buildActivationFunction, buildDerivativeFunction, ActivationTypes } from "./ast/activations";
import Topology from "./Topology";

export interface Dictionary<T> {
  [key: string]: T;
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

export interface IASTOptions {
  topology?: Topology;
}

export default class AST {

  topology: Topology;
  count: number = 0;
  variables: Dictionary<Variable> = {};
  inputs: Variable[] = [];
  outputs: Variable[] = [];
  targets: Variable[] = [];
  document: DocumentNode = document();

  constructor({ topology = new Topology() }: IASTOptions = {}) {
    this.topology = topology;
  }

  private alloc(key: string, value: number, tag: string = null): Variable {
    if (!(key in this.variables)) {
      this.variables[key] = new Variable(this.count++, key, value, tag);
    }
    return this.variables[key];
  }

  reset(): void {
    this.count = 0;
    this.variables = {};
    this.inputs = [];
    this.outputs = [];
    this.targets = [];
    this.document = document();
  }

  build(): void {
    // cleanup
    this.reset();

    // shorthands
    const layers = this.topology.layers;
    const engine = this.topology.engine;

    let outputLayer = layers.length - 1;

    // build AST
    this.alloc(`learningRate`, this.topology.engine.learningRate);
    this.alloc(`seed`, this.topology.engine.random());
    const activationFunction: FunctionNode = func('activate');
    this.document.addNode(activationFunction);
    const propagationFunction: FunctionNode = func('propagate');
    this.document.addNode(propagationFunction);
    if (this.topology.biasUnit !== null) {
      this.alloc(`activation[${this.topology.biasUnit}]`, engine.activation[this.topology.biasUnit]);
    }
    for (let layer = 0; layer < layers.length; layer++) {
      if (layer != 0) {
        for (let unit = 0; unit < layers[layer].length; unit++) {
          this.buildComputeState(layers[layer][unit], layer);
        }
      }

      for (let unit = 0; unit < layers[layer].length; unit++) {
        let activationJ: Variable;
        switch (layer) {
          case 0:
            activationJ = this.alloc(`activation[${layers[layer][unit]}]`, engine.activation[layers[layer][unit]], 'input');
            this.inputs.push(activationJ);
            break;
          case outputLayer:
            activationJ = this.buildActivation(layers[layer][unit], layer);
            this.outputs.push(activationJ);
            break;
          default:
            this.buildActivation(layers[layer][unit], layer);
        }
      }

      for (let unit = 0; unit < layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            this.buildActivationDerivative(layers[layer][unit], layer);
        }
      }

      // SOFTMAX COMPUTATION
      let softmaxUnits = [];

      for (let unit = 0; unit < layers[layer].length; unit++) {
        const type = engine.activationFunction[layers[layer][unit]];

        if (type == ActivationTypes.SOFTMAX) {
          softmaxUnits.push(layers[layer][unit]);
        }
      }

      if (softmaxUnits.length > 1) {
        this.softmaxUnits(softmaxUnits, layer);
      }

      for (let unit = 0; unit < layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            this.buildActivationTraces(layers[layer][unit], layer);
        }
      }
    }

    for (let unit = layers[outputLayer].length - 1; unit >= 0; unit--) {
      let targetJ = this.alloc(`target[${unit}]`, null, 'target');
      this.targets.push(targetJ);
      this.buildPropagation(layers[outputLayer][unit], outputLayer, targetJ);
    }

    for (let layer = layers.length - 2; layer > 0; layer--) {
      for (let unit = layers[layer].length - 1; unit >= 0; unit--) {
        this.buildPropagation(layers[layer][unit], layer);
      }
    }

    this.targets.reverse();
  }

  private getFunctionBodyNode(functionName: string): BlockNode {
    // grab the function node
    let activationFunction: FunctionNode = this.document.children.find(node =>
      node instanceof FunctionNode && node.name === functionName
    ) as FunctionNode;

    return activationFunction.body;
  }

  private buildActivationDerivative(j: number, layerJ: number, targetFunction: string = 'activate'): Variable {

    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new BlockNode();
    blockNode.name = `Activation derivative ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);


    const stateJ = this.alloc(`state[${j}]`, engine.state[j]);

    /*====================================================================================================================

    Eq. 16: compute activation derivative of j

    y'[j] = f'(j)

    ====================================================================================================================*/
    const activationJ = this.alloc(`activation[${j}]`, engine.activation[j], 'output');
    const derivativeJ = this.alloc(`derivative[${j}]`, engine.derivative[j]);

    const derivativeFunction = buildDerivativeFunction(stateJ, activationJ, engine.activationFunction[j]);

    if (derivativeFunction) {
      statement(assign(derivativeJ, derivativeFunction));
    }

    // return the derivative of j
    return derivativeJ;
  }

  private buildActivationTraces(j: number, layerJ: number) {

    const topology = this.topology;
    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode('activate');

    const blockNode = new BlockNode();
    blockNode.name = `Traces of ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);


    const activationJ = this.alloc(`activation[${j}]`, engine.activation[j], 'output');
    const derivativeJ = this.alloc(`derivative[${j}]`, engine.derivative[j]);

    const isSelfConnected = topology.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = topology.gates.some(gate => gate.to === j && gate.from === j);

    let i, k, h, g, l, a, to, from;
    /*====================================================================================================================

    Eq. 17: compute elegibility traces for j's inputs

    ε[j][i] = g[j][j] * w[j][j] * ε[j][i] + g[j][i] * y[i];

    ====================================================================================================================*/
    for (h = 0; h < topology.inputSet[j].length; h++) {
      i = topology.inputSet[j][h];
      const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, engine.elegibilityTrace[j][i]);
      const activationI = this.alloc(`activation[${i}]`, engine.activation[i]);
      const gainJI = this.alloc(`gain[${j}][${i}]`, engine.gain[j][i]);

      if (isSelfConnected && isSelfConnectionGated) {
        const gainJJ = this.alloc(`gain[${j}][${j}]`, engine.gain[j][j]);
        const weightJJ = this.alloc(`weight[${j}][${j}]`, engine.weight[j][j]);
        statement(assign(elegibilityTraceJI, sum(mul(mul(gainJJ, weightJJ), elegibilityTraceJI), mul(gainJI, activationI))));
      } else if (isSelfConnected) {
        const weightJJ = this.alloc(`weight[${j}][${j}]`, engine.weight[j][j]);
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
      for (g = 0; g < topology.gatedBy[j].length; g++) {
        k = topology.gatedBy[j][g];

        const isSelfConnectedK = topology.connections.some(connection => connection.to === k && connection.from === k);
        const isSelfConnectionGatedK = topology.gates.some(gate => gate.to === k && gate.from === k);

        const bigParenthesisTermResult = this.alloc('bigParenthesisTermResult', null);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;
        if (isSelfConnectedK && engine.derivativeTerm[k][j]) {
          const stateK = this.alloc(`state[${k}]`, engine.state[k]);
          statement(assign(bigParenthesisTermResult, stateK));
          keepBigParenthesisTerm = true;
        } else {
          initializeBigParenthesisTerm = true;
        }


        for (l = 0; l < topology.inputsOfGatedBy[k][j].length; l++) {
          a = topology.inputsOfGatedBy[k][j][l];
          if (a !== k) {
            if (initializeBigParenthesisTerm) {
              statement(assign(bigParenthesisTermResult, number(0)));
              initializeBigParenthesisTerm = false;
            }
            const weightKA = this.alloc(`weight[${k}][${a}]`, engine.weight[k][a]);
            const activationA = this.alloc(`activation[${a}]`, engine.activation[a]);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }

        const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, engine.extendedElegibilityTrace[j][i][k]);

        if (isSelfConnectedK && isSelfConnectionGatedK) {
          const gainKK = this.alloc(`gain[${k}][${k}]`, engine.gain[k][k]);
          const weightKK = this.alloc(`weight[${k}][${k}]`, engine.weight[k][k]);
          if (keepBigParenthesisTerm) {
            statement(assign(extendedElegibilityTraceJIK, sum(mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK), mul(mul(derivativeJ, elegibilityTraceJI), bigParenthesisTermResult))));
          } else {
            statement(assign(extendedElegibilityTraceJIK, mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK)));
          }
        } else if (isSelfConnectedK) {
          const weightKK = this.alloc(`weight[${k}][${k}]`, engine.weight[k][k]);
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
    for (h = 0; h < topology.gatedBy[j].length; h++) {
      to = topology.gatedBy[j][h];
      for (g = 0; g < topology.inputsOfGatedBy[to][j].length; g++) {
        from = topology.inputsOfGatedBy[to][j][g];
        const gainToFrom = this.alloc(`gain[${to}][${from}]`, engine.gain[to][from]);
        statement(assign(gainToFrom, activationJ));
      }
    }
  }

  private softmaxUnits(units: number[], layerJ: number) {

    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode('activate');

    const blockNode = new BlockNode();
    blockNode.name = `Softmax ${layerJ}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    // --------- VARS ---------

    const activations: Variable[] = units.map($ => this.alloc(`activation[${$}]`, engine.activation[$]));
    const derivatives: Variable[] = units.map($ => this.alloc(`derivative[${$}]`, engine.derivative[$]));
    const states: Variable[] = units.map($ => this.alloc(`state[${$}]`, engine.derivative[$]));

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
    states.forEach($ => {
      statement(assign(maximum, max(maximum, $)));
    });

    // maximum = max(activations)

    // activation(i)' = (activation(i) - maximum)^E
    states.forEach(($, i) => {
      statement(assign(activations[i], exp(sub($, maximum))));
    });

    // denominator = Σ activation'
    activations.forEach($ => statement(assignSum(denominator, $)));

    // activation(i) = activation(i) / denominator
    activations.forEach($ => {
      statement(assign($, div($, denominator)));
    });

    // derivative(j) = activation(i) * (1 - activation(i)) - knockner(j, i) * activation(j)^2
    states.forEach(($pi, $i) => {
      statement(assign(derivatives[$i], mul($pi, sub(number(1), $pi))));

      states.forEach(($pj, $j) => {
        if ($i !== $j) {
          statement(assignSub(derivatives[$i], mul($pj, $pi)));
        }
      });
    });

    // outdw[j] = 1

    /*
      for (var i = 0; i < X; i++) {
        var sum = outw[i] * (1 - outw[i]) * outdw[i]

        for (var j = 0; j < X; j++) {
            if (i !== j)  sum -= outw[j] * outw[i] * outdw[j]
        }

        inpdw[i] = sum
      }
    */
  }


  private buildComputeState(j: number, layerJ: number, targetFunction: string = 'activate'): Variable {

    const topology = this.topology;
    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new BlockNode();
    blockNode.name = `ActivationState ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    /*====================================================================================================================

    Eq. 15: compute state of j

    s[j] = g[j][j] * w[j][j] * s[j] + Σ(inputSet[j], i => g[j][i] * w[j][i] * y[i]);

    ====================================================================================================================*/
    let i, h;

    const stateJ = this.alloc(`state[${j}]`, engine.state[j]);
    const isSelfConnected = topology.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = topology.gates.some(gate => gate.to === j && gate.from === j);

    if (isSelfConnected && isSelfConnectionGated) {
      const gainJJ = this.alloc(`gain[${j}][${j}]`, engine.gain[j][j]);
      const weightJJ = this.alloc(`weight[${j}][${j}]`, engine.weight[j][j]);
      statement(assignMul(stateJ, mul(gainJJ, weightJJ)));
    } else if (isSelfConnected) {
      const weightJJ = this.alloc(`weight[${j}][${j}]`, engine.weight[j][j]);
      statement(assignMul(stateJ, weightJJ));
    } else {
      statement(assign(stateJ, number(0)));
    }

    for (h = 0; h < topology.inputSet[j].length; h++) {
      i = topology.inputSet[j][h];
      const isGated = topology.gates.some(gate => gate.from === i && gate.to === j);
      if (isGated) {
        const stateJ = this.alloc(`state[${j}]`, engine.state[j]);
        const gainJI = this.alloc(`gain[${j}][${i}]`, engine.gain[j][i]);
        const weightJI = this.alloc(`weight[${j}][${i}]`, engine.weight[j][i]);
        const activationI = this.alloc(`activation[${i}]`, engine.activation[i]);
        statement(assignSum(stateJ, mul(mul(gainJI, weightJI), activationI)));
      } else {
        const stateJ = this.alloc(`state[${j}]`, engine.state[j]);
        const weightJI = this.alloc(`weight[${j}][${i}]`, engine.weight[j][i]);
        const activationI = this.alloc(`activation[${i}]`, engine.activation[i]);
        statement(assignSum(stateJ, mul(weightJI, activationI)));
      }
    }

    // return the activation of j
    return stateJ;
  }

  private buildActivation(j: number, layerJ: number, targetFunction: string = 'activate'): Variable {

    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new BlockNode();
    blockNode.name = `Activation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);
    /*====================================================================================================================

    Eq. 16: compute activation of j (and cache derivative for later use)

    y[j] = f(j)
    y'[j] = f'(j)

    ====================================================================================================================*/
    const stateJ = this.alloc(`state[${j}]`, engine.state[j]);

    const activationJ = this.alloc(`activation[${j}]`, engine.activation[j], 'output');

    const activationFunction = buildActivationFunction(stateJ, engine.activationFunction[j]);

    if (activationFunction) {
      statement(assign(activationJ, activationFunction));
    }

    // return the activation of j
    return activationJ;
  }

  private buildPropagation(j: number, layerJ: number, targetJ?: Variable) {

    const topology = this.topology;
    const engine = this.topology.engine;

    const layerNode = this.getFunctionBodyNode('propagate');

    const blockNode = new BlockNode();
    blockNode.name = `Propagation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: ExpressionNode) => blockNode.addNode(node);

    // step 1: compute error responsibility (δ) for j

    let i, k, h, g, l, a;
    let hasProjectedError = topology.projectionSet[j].length > 0;
    const hasGatedError = topology.gateSet[j].length > 0;

    /*====================================================================================================================

    Eq. 10: this is only for output neurons, the error is injected from the environment

    δ[j] = δP[j] = target - y[j];

    ====================================================================================================================*/
    if (typeof targetJ !== 'undefined') {
      hasProjectedError = true;
      const errorResponsibilityJ = this.alloc(`errorResponsibility[${j}]`, engine.errorResponsibility[j]);
      const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, engine.projectedErrorResponsibility[j]);
      const activationJ = this.alloc(`activation[${j}]`, engine.activation[j]);
      statement(assign(errorResponsibilityJ, sub(targetJ, activationJ)));
      statement(assign(projectedErrorResponsibilityJ, errorResponsibilityJ));
    } else {
      /*====================================================================================================================

      Eq. 21: compute projected error responsibility for j

      δP[j] = df(j) * Σ(P[j], k => δ[k] * g[k][j] * w[k][j]);

      ====================================================================================================================*/
      const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, engine.projectedErrorResponsibility[j]);
      if (hasProjectedError) {
        statement(assign(projectedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < topology.projectionSet[j].length; h++) {
        k = topology.projectionSet[j][h];
        const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, engine.errorResponsibility[k]);
        const isGated = topology.gates.some(gate => gate.to === k && gate.from === j);
        if (isGated) {
          const weightKJ = this.alloc(`weight[${k}][${j}]`, engine.weight[k][j]);
          const gainKJ = this.alloc(`gain[${k}][${j}]`, engine.gain[k][j]);
          statement(assignSum(projectedErrorResponsibilityJ, mul(mul(gainKJ, weightKJ), errorResponsibilityK)));
        } else {
          const weightKJ = this.alloc(`weight[${k}][${j}]`, engine.weight[k][j]);
          statement(assignSum(projectedErrorResponsibilityJ, mul(weightKJ, errorResponsibilityK)));
        }
      }
      const derivativeJ = this.alloc(`derivative[${j}]`, engine.derivative[j]);
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
      const gatedErrorResponsibilityJ = this.alloc(`gatedErrorResponsibility[${j}]`, engine.gatedErrorResponsibility[j]);
      if (hasGatedError) {
        statement(assignMul(gatedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < topology.gateSet[j].length; h++) {
        k = topology.gateSet[j][h];
        const isSelfConnectedK = topology.connections.some(connection => connection.to === k && connection.from === k);
        const bigParenthesisTermResult = this.alloc('bigParenthesisTermResult', null);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;

        if (isSelfConnectedK && engine.derivativeTerm[k][j]) {
          const stateK = this.alloc(`state[${k}]`, engine.state[k]);
          statement(assign(bigParenthesisTermResult, stateK));
          keepBigParenthesisTerm = true;
        } else {
          initializeBigParenthesisTerm = true;
        }
        for (l = 0; l < topology.inputsOfGatedBy[k][j].length; l++) {
          a = topology.inputsOfGatedBy[k][j][l];
          if (a !== k) {
            if (initializeBigParenthesisTerm) {
              statement(assign(bigParenthesisTermResult, number(0)));
              initializeBigParenthesisTerm = false;
            }
            const weightKA = this.alloc(`weight[${k}][${a}]`, engine.weight[k][a]);
            const activationA = this.alloc(`activation[${a}]`, engine.activation[a]);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }
        if (keepBigParenthesisTerm) {
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, engine.errorResponsibility[k]);
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
      const errorResponsibilityJ = this.alloc(`errorResponsibility[${j}]`, engine.errorResponsibility[j]);
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
    for (h = 0; h < topology.inputSet[j].length; h++) {
      if (hasProjectedError && hasGatedError) {
        i = topology.inputSet[j][h];
        const Δw = this.alloc(`Δw`, null);
        const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, engine.projectedErrorResponsibility[j]);
        const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, engine.elegibilityTrace[j][i]);
        statement(assign(Δw, mul(projectedErrorResponsibilityJ, elegibilityTraceJI)));
        for (g = 0; g < topology.gateSet[j].length; g++) {
          k = topology.gateSet[j][g];
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, engine.errorResponsibility[k]);
          const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, engine.extendedElegibilityTrace[j][i][k]);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.alloc('learningRate', engine.learningRate);
        statement(assignMul(Δw, learningRate));
        const weightJI = this.alloc(`weight[${j}][${i}]`, engine.weight[j][i]);
        statement(assignSum(weightJI, Δw));
      } else if (hasProjectedError) {
        i = topology.inputSet[j][h];
        const weightJI = this.alloc(`weight[${j}][${i}]`, engine.weight[j][i]);
        const projectedErrorResponsibilityJ = this.alloc(`projectedErrorResponsibility[${j}]`, engine.projectedErrorResponsibility[j]);
        const elegibilityTraceJI = this.alloc(`elegibilityTrace[${j}][${i}]`, engine.elegibilityTrace[j][i]);
        const learningRate = this.alloc('learningRate', engine.learningRate);
        statement(assignSum(weightJI, mul(mul(projectedErrorResponsibilityJ, elegibilityTraceJI), learningRate)));
      } else if (hasGatedError) {
        i = topology.inputSet[j][h];
        const Δw = this.alloc(`Δw`, null);
        statement(assign(Δw, number(0)));
        for (g = 0; g < topology.gateSet[j].length; g++) {
          k = topology.gateSet[j][g];
          const errorResponsibilityK = this.alloc(`errorResponsibility[${k}]`, engine.errorResponsibility[k]);
          const extendedElegibilityTraceJIK = this.alloc(`extendedElegibilityTrace[${j}][${i}][${k}]`, engine.extendedElegibilityTrace[j][i][k]);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.alloc('learningRate', engine.learningRate);
        statement(assignMul(Δw, learningRate));
        const weightJI = this.alloc(`weight[${j}][${i}]`, engine.weight[j][i]);
        statement(assignSum(weightJI, Δw));
      }
    }
  }

  getDocument() {
    return this.document;
  }

  getVariables() {
    return Object.keys(this.variables).map(key => this.variables[key]);
  }
}
