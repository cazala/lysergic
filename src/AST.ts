import nodes = require("./ast/nodes");
import { func, assignMul, mul, assign, number, assignSum, div, sum, exp, sub, document, max, assignSub, krnonecker } from "./ast/operations";
import { buildActivationFunction, buildDerivativeFunction, ActivationTypes, WHOLE_LAYER_ACTIVATION_KIND } from "./ast/activations";
import { Topology } from "./Topology";

export { nodes };

export interface IASTOptions {
  topology: Topology;
}

interface ActivationBucket {
  units: number[];
  type: ActivationTypes;
  layer: number;
}

export class AST {

  static nodes = nodes;

  topology: Topology;

  inputs: nodes.Variable[] = [];
  outputs: nodes.Variable[] = [];
  targets: nodes.Variable[] = [];
  document: nodes.DocumentNode = document();

  constructor(options: IASTOptions) {
    const { topology } = options;
    this.topology = topology;
  }

  reset(): void {
    this.inputs = [];
    this.outputs = [];
    this.targets = [];
    this.document = document();
  }

  isArrayOrdered(items: number[]): boolean {
    let ordered = true;

    let prev = null;

    items.forEach(i => {
      if (prev !== null) {
        ordered = ordered && (prev == i - 1);
      }
      prev = i;
    });

    return ordered;
  }


  isOrdered(from: number, to: number, accessor: (string | number)[]): boolean {
    let ordered = true;
    let prev: nodes.Variable = null;
    for (let i = from; i < to; i++) {
      let args = [...accessor, i];
      const actual = (this.topology.heap.getVariable as any)(...args);
      if (prev) {
        ordered = ordered && (prev.position == (actual.position - 1));
      }
      prev = actual;
    }
    return ordered;
  }

  isSameActivationTypeOrdered(from: number, to: number, accessor: string[]) {

  }

  build(): void {
    // cleanup
    this.reset();

    // shorthands
    const layers = this.topology.layers;

    let outputLayer = layers.length - 1;

    // build AST
    const activationFunction: nodes.FunctionNode = func('activate');
    this.document.addNode(activationFunction);
    const propagationFunction: nodes.FunctionNode = func('propagate');
    this.document.addNode(propagationFunction);

    for (let layer = 0; layer < layers.length; layer++) {
      // build state
      if (layer != 0) {
        for (let unit = 0; unit < layers[layer].length; unit++) {
          if (this.topology.activationFunction[layers[layer][unit]] !== ActivationTypes.MAX_POOLING) {
            this.buildComputeState(layers[layer][unit], layer);
          }
        }
      }

      let sameActivationFunction = true;

      let prevActivationFunction: ActivationTypes = null;

      // build activation
      for (let unit = 0; unit < layers[layer].length; unit++) {
        const activationFunction = this.topology.activationFunction[layers[layer][unit]];

        if (unit > 0) {
          sameActivationFunction = sameActivationFunction && (activationFunction == prevActivationFunction);
        }

        prevActivationFunction = activationFunction;
      }

      for (let unit = 0; unit < layers[layer].length; unit++) {
        let activationJ: nodes.Variable;
        switch (layer) {
          case 0:
            activationJ = this.topology.heap.getVariable('activation', layers[layer][unit]); // TODO: Tag, input
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

      // build whole layer activation
      let buckets: ActivationBucket[] = [];
      for (let unitIndex = 0; unitIndex < layers[layer].length; unitIndex++) {
        const unit = layers[layer][unitIndex];
        const type = this.topology.activationFunction[unit];
        if (type & WHOLE_LAYER_ACTIVATION_KIND) {
          let bucket = buckets.find(bucket => bucket.type === type);
          if (bucket == null) {
            bucket = {
              units: [],
              type,
              layer
            };
            buckets.push(bucket);
          }
          bucket.units.push(unit);
        }
      }
      buckets.forEach(bucket => this.buildWholeLayerActivation(bucket));

      // build activation derivative
      for (let unit = 0; unit < layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            this.buildActivationDerivative(layers[layer][unit], layer);
        }
      }

      // build traces and extended elegibility traces
      for (let unit = 0; unit < layers[layer].length; unit++) {
        switch (layer) {
          case 0:
            break;
          default:
            if (this.topology.activationFunction[layers[layer][unit]] !== ActivationTypes.MAX_POOLING) {
              this.buildActivationTraces(layers[layer][unit], layer);
            }
        }
      }
    }

    // build propagation from environment
    for (let unit = layers[outputLayer].length - 1; unit >= 0; unit--) {
      let targetJ = this.topology.heap.setVariable(`target`, unit, 0);
      this.targets.push(targetJ);
      this.buildPropagation(layers[outputLayer][unit], outputLayer, targetJ);
    }

    // build propagation from error responsibility
    for (let layer = layers.length - 2; layer > 0; layer--) {
      for (let unit = layers[layer].length - 1; unit >= 0; unit--) {
        this.buildPropagation(layers[layer][unit], layer);
      }
    }

    this.targets.reverse();
  }


  private getFunctionBodyNode(functionName: string): nodes.BlockNode {
    // grab the function node
    let activationFunction: nodes.FunctionNode = this.document.children.find(node =>
      node instanceof nodes.FunctionNode && node.name === functionName
    ) as nodes.FunctionNode;

    return activationFunction.body;
  }

  private buildActivationDerivative(j: number, layerJ: number, targetFunction: string = 'activate'): nodes.Variable {
    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new nodes.BlockNode();
    blockNode.name = `Activation derivative ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);

    /*====================================================================================================================

    Eq. 16: compute activation derivative of j

    y'[j] = f'(j)

    ====================================================================================================================*/
    const stateJ = this.topology.heap.getVariable(`state`, j);
    const activationJ = this.topology.heap.getVariable(`activation`, j); // TODO: tag output
    const derivativeJ = this.topology.heap.getVariable(`derivative`, j);

    const derivativeFunction = buildDerivativeFunction(stateJ, activationJ, this.topology.activationFunction[j]);

    if (derivativeFunction) {
      statement(assign(derivativeJ, derivativeFunction));
    }

    // return the derivative of j
    return derivativeJ;
  }

  private buildActivationTraces(j: number, layerJ: number) {
    const topology = this.topology;

    const layerNode = this.getFunctionBodyNode('activate');

    const blockNode = new nodes.BlockNode();
    blockNode.name = `Traces of ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);

    const activationJ = this.topology.heap.getVariable(`activation`, j); // TODO: tag output
    const derivativeJ = this.topology.heap.getVariable(`derivative`, j);

    const isSelfConnected = topology.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = topology.gates.some(gate => gate.to === j && gate.from === j);

    let i, k, h, g, l, a, to, from;
    /*====================================================================================================================

    Eq. 17: compute elegibility traces for j's inputs

    ε[j][i] = g[j][j] * w[j][j] * ε[j][i] + g[j][i] * y[i];

    ====================================================================================================================*/
    for (h = 0; h < topology.inputSet[j].length; h++) {
      i = topology.inputSet[j][h];
      const elegibilityTraceJI = this.topology.heap.getVariable(`elegibilityTrace`, j, i);
      const activationI = this.topology.heap.getVariable(`activation`, i);
      const gainJI = this.topology.heap.getVariable(`gain`, j, i);

      if (isSelfConnected && isSelfConnectionGated) {
        const gainJJ = this.topology.heap.getVariable(`gain`, j, j);
        const weightJJ = this.topology.heap.getVariable(`weight`, j, j);
        statement(assign(elegibilityTraceJI, sum(mul(mul(gainJJ, weightJJ), elegibilityTraceJI), mul(gainJI, activationI))));
      } else if (isSelfConnected) {
        const weightJJ = this.topology.heap.getVariable(`weight`, j, j);
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

        const bigParenthesisTermResult = this.topology.heap.setVariable('bigParenthesisTermResult', 0);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;

        if (isSelfConnectedK && this.topology.heap.hasVariable('derivativeTerm', k, j) && this.topology.heap.getVariable('derivativeTerm', k, j).initialValue) {
          const stateK = this.topology.heap.getVariable(`state`, k);
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
            const weightKA = this.topology.heap.getVariable(`weight`, k, a);
            const activationA = this.topology.heap.getVariable(`activation`, a);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }

        const extendedElegibilityTraceJIK = this.topology.heap.getVariable(`extendedElegibilityTrace`, j, i, k);

        if (isSelfConnectedK && isSelfConnectionGatedK) {
          const gainKK = this.topology.heap.getVariable(`gain`, k, k);
          const weightKK = this.topology.heap.getVariable(`weight`, k, k);
          if (keepBigParenthesisTerm) {
            statement(assign(extendedElegibilityTraceJIK, sum(mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK), mul(mul(derivativeJ, elegibilityTraceJI), bigParenthesisTermResult))));
          } else {
            statement(assign(extendedElegibilityTraceJIK, mul(mul(gainKK, weightKK), extendedElegibilityTraceJIK)));
          }
        } else if (isSelfConnectedK) {
          const weightKK = this.topology.heap.getVariable(`weight`, k, k);
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
        const gainToFrom = this.topology.heap.getVariable(`gain`, to, from);
        statement(assign(gainToFrom, activationJ));
      }
    }
  }

  private buildWholeLayerActivation(bucket: ActivationBucket) {

    const units = bucket.units;
    const type = bucket.type;
    const layerJ = bucket.layer;

    const layerNode = this.getFunctionBodyNode('activate');
    const blockNode = new nodes.BlockNode();
    blockNode.name = `Whole Layer Activation (${type}) ${layerJ}`;
    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);

    switch (type) {
      case ActivationTypes.MAX_POOLING: {
        units.forEach(unit => {
          const inputs = this.topology.inputsOf[unit];
          const maximum = this.topology.heap.getVariable('activation', unit);
          const activations = inputs.map(input => this.topology.heap.getVariable(`activation`, input));
          activations.forEach((activation, index) => {
            statement(assign(maximum, index === 0 ? activation : max(maximum, activation)));
          });
          inputs.forEach(input => {
            const activation = this.topology.heap.getVariable(`activation`, input);
            const weight = this.topology.heap.getVariable(`weight`, unit, input);
            const derivative = this.topology.heap.getVariable(`derivative`, input);
            statement(assign(weight, krnonecker(activation, maximum)));
            statement(assign(derivative, krnonecker(activation, maximum)));
          });
        });
        break;
      }
      case ActivationTypes.SOFTMAX: {

        const activations: nodes.Variable[] = units.map(unit => this.topology.heap.getVariable(`activation`, unit));
        const derivatives: nodes.Variable[] = units.map(unit => this.topology.heap.getVariable(`derivative`, unit));
        const states: nodes.Variable[] = units.map(unit => this.topology.heap.getVariable(`state`, unit));

        const maximum = this.topology.heap.setVariable(`softmaxMaximum`, layerJ, 0);
        const denominator = this.topology.heap.setVariable(`softmaxDenominator`, layerJ, 0);
        const nominators: nodes.Variable[] = [];

        units.forEach((unit, i) => {
          const nominator = this.topology.heap.setVariable(`softmaxNominators`, layerJ, unit, 0);
          nominators.push(nominator);
        });

        /*====================================================================================================================
          Find the maximum activation value
          Snyman, Jan. Practical mathematical optimization: an introduction to basic optimization theory and
          classical and new gradient-based algorithms. Vol. 97. Springer Science & Business Media, 2005.

          outdw[j] = 1

          for (var i = 0; i < X; i++) {
            var sum = outw[i] * (1 - outw[i]) * outdw[i]

            for (var j = 0; j < X; j++) {
                if (i !== j)  sum -= outw[j] * outw[i] * outdw[j]
            }

            inpdw[i] = sum
          }
        ====================================================================================================================*/

        statement(assign(maximum, number(0)));
        statement(assign(denominator, number(0)));

        // maximum = max(activations)
        states.forEach(state => {
          statement(assign(maximum, max(maximum, state)));
        });

        // activation(i)' = (activation(i) - maximum)^E
        states.forEach((state, i) => {
          statement(assign(activations[i], exp(sub(state, maximum))));
        });

        // denominator = Σ activation'
        activations.forEach(activation => statement(assignSum(denominator, activation)));

        // activation(i) = activation(i) / denominator
        activations.forEach(activation => {
          statement(assign(activation, div(activation, denominator)));
        });

        // derivative(j) = activation(i) * (1 - activation(i)) - knockner(j, i) * activation(j)^2
        states.forEach((state, i) => {
          statement(assign(derivatives[i], mul(state, sub(number(1), state))));

          states.forEach((state, j) => {
            if (i !== j) {
              statement(assignSub(derivatives[i], mul(state, state)));
            }
          });
        });

        break;
      }
      default:
    }
  }


  private buildComputeState(j: number, layerJ: number, targetFunction: string = 'activate'): nodes.Variable {
    const topology = this.topology;

    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new nodes.BlockNode();
    blockNode.name = `State ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);

    /*====================================================================================================================

    Eq. 15: compute state of j

    s[j] = g[j][j] * w[j][j] * s[j] + Σ(inputSet[j], i => g[j][i] * w[j][i] * y[i]);

    ====================================================================================================================*/
    let i, h;

    const stateJ = this.topology.heap.getVariable(`state`, j);

    const isSelfConnected = topology.connections.some(connection => connection.to === j && connection.from === j);
    const isSelfConnectionGated = topology.gates.some(gate => gate.to === j && gate.from === j);

    if (isSelfConnected && isSelfConnectionGated) {
      const gainJJ = this.topology.heap.getVariable(`gain`, j, j);
      const weightJJ = this.topology.heap.getVariable(`weight`, j, j);
      statement(assignMul(stateJ, mul(gainJJ, weightJJ)));
    } else if (isSelfConnected) {
      const weightJJ = this.topology.heap.getVariable(`weight`, j, j);
      statement(assignMul(stateJ, weightJJ));
    } else {
      statement(assign(stateJ, number(0)));
    }

    for (h = 0; h < topology.inputSet[j].length; h++) {
      i = topology.inputSet[j][h];
      const isGated = topology.gates.some(gate => gate.from === i && gate.to === j);
      if (isGated) {
        const stateJ = this.topology.heap.getVariable(`state`, j);
        const gainJI = this.topology.heap.getVariable(`gain`, j, i);
        const weightJI = this.topology.heap.getVariable(`weight`, j, i);
        const activationI = this.topology.heap.getVariable(`activation`, i);
        statement(assignSum(stateJ, mul(mul(gainJI, weightJI), activationI)));
      } else {
        const stateJ = this.topology.heap.getVariable(`state`, j);
        const weightJI = this.topology.heap.getVariable(`weight`, j, i);
        const activationI = this.topology.heap.getVariable(`activation`, i);
        statement(assignSum(stateJ, mul(weightJI, activationI)));
      }
    }

    // return the activation of j
    return stateJ;
  }

  private buildActivation(j: number, layerJ: number, targetFunction: string = 'activate'): nodes.Variable {
    const layerNode = this.getFunctionBodyNode(targetFunction);

    const blockNode = new nodes.BlockNode();
    blockNode.name = `Activation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);
    /*====================================================================================================================

    Eq. 16: compute activation of j (and cache derivative for later use)

    y[j] = f(j)
    y'[j] = f'(j)

    ====================================================================================================================*/
    const stateJ = this.topology.heap.getVariable(`state`, j);
    const activationJ = this.topology.heap.getVariable(`activation`, j); // TODO: tag output

    const activationFunction = buildActivationFunction(stateJ, this.topology.activationFunction[j]);

    if (activationFunction) {
      statement(assign(activationJ, activationFunction));
    }

    // return the activation of j
    return activationJ;
  }

  private buildPropagation(j: number, layerJ: number, targetJ?: nodes.Variable): void {

    const layerNode = this.getFunctionBodyNode('propagate');

    const blockNode = new nodes.BlockNode();
    blockNode.name = `Propagation ${layerJ}:${j}`;

    layerNode.addNode(blockNode);

    // helper to add a statement to the unit node
    const statement = (node: nodes.ExpressionNode) => blockNode.addNode(node);

    // step 1: compute error responsibility (δ) for j

    let i, k, h, g, l, a;
    let hasProjectedError = this.topology.projectionSet[j].length > 0;
    const hasGatedError = this.topology.gateSet[j].length > 0;

    /*====================================================================================================================

    Eq. 10: this is only for output neurons, the error is injected from the environment

    δ[j] = δP[j] = target - y[j];

    ====================================================================================================================*/
    if (typeof targetJ !== 'undefined') {
      hasProjectedError = true;
      const errorResponsibilityJ = this.topology.heap.getVariable(`errorResponsibility`, j);
      const projectedErrorResponsibilityJ = this.topology.heap.getVariable(`projectedErrorResponsibility`, j);
      const activationJ = this.topology.heap.getVariable(`activation`, j);
      statement(assign(errorResponsibilityJ, sub(targetJ, activationJ)));
      statement(assign(projectedErrorResponsibilityJ, errorResponsibilityJ));
    } else {
      /*====================================================================================================================

      Eq. 21: compute projected error responsibility for j

      δP[j] = df(j) * Σ(P[j], k => δ[k] * g[k][j] * w[k][j]);

      ====================================================================================================================*/
      const projectedErrorResponsibilityJ = this.topology.heap.getVariable(`projectedErrorResponsibility`, j);
      if (hasProjectedError) {
        statement(assign(projectedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < this.topology.projectionSet[j].length; h++) {
        k = this.topology.projectionSet[j][h];
        const errorResponsibilityK = this.topology.heap.getVariable(`errorResponsibility`, k);
        const isGated = this.topology.gates.some(gate => gate.to === k && gate.from === j);
        if (isGated) {
          const weightKJ = this.topology.heap.getVariable(`weight`, k, j);
          const gainKJ = this.topology.heap.getVariable(`gain`, k, j);
          statement(assignSum(projectedErrorResponsibilityJ, mul(mul(gainKJ, weightKJ), errorResponsibilityK)));
        } else {
          const weightKJ = this.topology.heap.getVariable(`weight`, k, j);
          statement(assignSum(projectedErrorResponsibilityJ, mul(weightKJ, errorResponsibilityK)));
        }
      }
      const derivativeJ = this.topology.heap.getVariable(`derivative`, j);
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
      const gatedErrorResponsibilityJ = this.topology.heap.getVariable(`gatedErrorResponsibility`, j);
      if (hasGatedError) {
        statement(assignMul(gatedErrorResponsibilityJ, number(0)));
      }
      for (h = 0; h < this.topology.gateSet[j].length; h++) {
        k = this.topology.gateSet[j][h];
        const isSelfConnectedK = this.topology.connections.some(connection => connection.to === k && connection.from === k);
        const bigParenthesisTermResult = this.topology.heap.setVariable('bigParenthesisTermResult', null);

        let keepBigParenthesisTerm = false;
        let initializeBigParenthesisTerm = false;

        if (isSelfConnectedK && this.topology.heap.hasVariable('derivativeTerm', k, j)) {
          const stateK = this.topology.heap.getVariable(`state`, k);
          statement(assign(bigParenthesisTermResult, stateK));
          keepBigParenthesisTerm = true;
        } else {
          initializeBigParenthesisTerm = true;
        }
        for (l = 0; l < this.topology.inputsOfGatedBy[k][j].length; l++) {
          a = this.topology.inputsOfGatedBy[k][j][l];
          if (a !== k) {
            if (initializeBigParenthesisTerm) {
              statement(assign(bigParenthesisTermResult, number(0)));
              initializeBigParenthesisTerm = false;
            }
            const weightKA = this.topology.heap.getVariable(`weight`, k, a);
            const activationA = this.topology.heap.getVariable(`activation`, a);
            statement(assignSum(bigParenthesisTermResult, mul(weightKA, activationA)));
            keepBigParenthesisTerm = true;
          }
        }
        if (keepBigParenthesisTerm) {
          const errorResponsibilityK = this.topology.heap.getVariable(`errorResponsibility`, k);
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
      const errorResponsibilityJ = this.topology.heap.getVariable(`errorResponsibility`, j);
      if (hasProjectedError && hasGatedError) {
        statement(assign(errorResponsibilityJ, sum(projectedErrorResponsibilityJ, gatedErrorResponsibilityJ)));
      } else if (hasProjectedError) {
        statement(assign(errorResponsibilityJ, projectedErrorResponsibilityJ));
      } else if (hasGatedError) {
        statement(assign(errorResponsibilityJ, gatedErrorResponsibilityJ));
      }
    }

    // MaxPool doesn't update weights
    if (this.topology.activationFunction[j] === ActivationTypes.MAX_POOLING) {
      return;
    }

    /*====================================================================================================================

    Eq. 24: compute error responsibility for j

    Δw = α * δP[j] * ε[j][i] + α * Σ(G[j], k => δ[k] * xε[j][i][k])

    and adjust the weights using the deltas

    w[j][i] += Δw

    ====================================================================================================================*/
    for (h = 0; h < this.topology.inputSet[j].length; h++) {
      if (hasProjectedError && hasGatedError) {
        i = this.topology.inputSet[j][h];
        const Δw = this.topology.heap.setVariable(`Δw`, null);
        const projectedErrorResponsibilityJ = this.topology.heap.getVariable(`projectedErrorResponsibility`, j);
        const elegibilityTraceJI = this.topology.heap.getVariable(`elegibilityTrace`, j, i);
        statement(assign(Δw, mul(projectedErrorResponsibilityJ, elegibilityTraceJI)));
        for (g = 0; g < this.topology.gateSet[j].length; g++) {
          k = this.topology.gateSet[j][g];
          const errorResponsibilityK = this.topology.heap.getVariable(`errorResponsibility`, k);
          const extendedElegibilityTraceJIK = this.topology.heap.getVariable(`extendedElegibilityTrace`, j, i, k);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.topology.heap.getVariable('learningRate');
        statement(assignMul(Δw, learningRate));
        const weightJI = this.topology.heap.getVariable(`weight`, j, i);
        statement(assignSum(weightJI, Δw));
      } else if (hasProjectedError) {
        i = this.topology.inputSet[j][h];
        const weightJI = this.topology.heap.getVariable(`weight`, j, i);
        const projectedErrorResponsibilityJ = this.topology.heap.getVariable(`projectedErrorResponsibility`, j);
        const elegibilityTraceJI = this.topology.heap.getVariable(`elegibilityTrace`, j, i);
        const learningRate = this.topology.heap.getVariable('learningRate');
        statement(assignSum(weightJI, mul(mul(projectedErrorResponsibilityJ, elegibilityTraceJI), learningRate)));
      } else if (hasGatedError) {
        i = this.topology.inputSet[j][h];
        const Δw = this.topology.heap.setVariable(`Δw`, null);
        statement(assign(Δw, number(0)));
        for (g = 0; g < this.topology.gateSet[j].length; g++) {
          k = this.topology.gateSet[j][g];
          const errorResponsibilityK = this.topology.heap.getVariable(`errorResponsibility`, k);
          const extendedElegibilityTraceJIK = this.topology.heap.getVariable(`extendedElegibilityTrace`, j, i, k);
          statement(assignSum(Δw, mul(errorResponsibilityK, extendedElegibilityTraceJIK)));
        }
        const learningRate = this.topology.heap.getVariable('learningRate');
        statement(assignMul(Δw, learningRate));
        const weightJI = this.topology.heap.getVariable(`weight`, j, i);
        statement(assignSum(weightJI, Δw));
      }
    }
  }

  getDocument() {
    return this.document;
  }
}

export default AST;