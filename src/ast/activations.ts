// https://stats.stackexchange.com/questions/115258/comprehensive-list-of-activation-functions-in-neural-networks-with-pros-cons
// https://en.wikipedia.org/wiki/Activation_function
// https://nn.readthedocs.io/en/rtd/transfer/
// https://math.stackexchange.com/questions/945871/derivative-of-softmax-loss-function

import { mul, number, div, sum, exp, neg, sub, conditional, gt, ln, abs, pow, max, gte } from "./operations";
import { ExpressionNode, Variable } from "./nodes";

export const WHOLE_LAYER_ACTIVATION_KIND = 128;

export enum ActivationTypes {
  IDENTITY = 0,
  LOGISTIC_SIGMOID = 1,
  TANH = 2,
  // 3 is free

  INVERSE_IDENTITY = 5,
  EXP = 6,
  SOFTPLUS = 7,
  SOFTSIGN = 8,
  GAUSSIAN = 9,
  STEP = 11,

  // https://arxiv.org/pdf/1502.01852.pdf
  RELU = 12,
  PRELU = 13, // parametric ReLU => PReLU(x) = { x > 0 ? x : ax }
  RELU_PLUSONE = 14, // f(x) = ReLU(x) + 1
  ELU = 15,
  PELU = 16,

  POW = 17,
  POW_MINUS1 = 18,



  AVG_POOLING = WHOLE_LAYER_ACTIVATION_KIND | 1,
  MAX_POOLING = WHOLE_LAYER_ACTIVATION_KIND | 2,
  MAXOUT = WHOLE_LAYER_ACTIVATION_KIND | 3,
  SOFTMAX = WHOLE_LAYER_ACTIVATION_KIND | 4,
  SHARPEN = WHOLE_LAYER_ACTIVATION_KIND | 5,

  // https://leonardoaraujosantos.gitbooks.io/artificial-inteligence/content/batch_norm_layer.html
  // https://kratzert.github.io/2016/02/12/understanding-the-gradient-flow-through-the-batch-normalization-layer.html
  // http://lasagne.readthedocs.io/en/latest/modules/layers/normalization.html
  BATCH_NORM = WHOLE_LAYER_ACTIVATION_KIND | 6
}

export function buildActivationFunction(state: ExpressionNode, type: ActivationTypes): ExpressionNode {
  if (type & WHOLE_LAYER_ACTIVATION_KIND) return null;
  switch (type) {
    case ActivationTypes.LOGISTIC_SIGMOID:
      return div(number(1), sum(number(1), exp(neg(state))));

    case ActivationTypes.TANH:
      return div(sub(exp(state), div(number(1), exp(state))), sum(exp(state), div(number(1), exp(state))));

    case ActivationTypes.STEP:
      return conditional(gt(state, number(0)), number(1), number(0));

    case ActivationTypes.RELU_PLUSONE:
      return sum(number(1), max(state, number(0)));

    case ActivationTypes.RELU:
      return max(state, number(0));

    case ActivationTypes.SOFTPLUS:
      return ln(sum(number(1), exp(state)));

    case ActivationTypes.SOFTSIGN:
      // http://www.iro.umontreal.ca/~lisa/publications2/index.php/attachments/single/205
      // http://jmlr.org/proceedings/papers/v9/glorot10a/glorot10a.pdf
      return div(state, sum(number(1), abs(state))); // activation = x / (1 + Math.abs(x));

    case ActivationTypes.EXP:
      return exp(state);

    case ActivationTypes.POW:
      return mul(state, state);

    case ActivationTypes.POW_MINUS1:
      return div(number(1), state);

    case ActivationTypes.GAUSSIAN:
      return exp(neg(mul(state, state)));

    case ActivationTypes.INVERSE_IDENTITY:
      return sub(number(1), state);

    case ActivationTypes.IDENTITY:
      return state;
  }
  return state;
}

/*case ActivationTypes.MAX_POOLING:
  const inputUnit = this.inputsOf[unit][0]
  const gatedUnit = this.gatedBy[unit][0]
  const inputsOfGatedUnit = this.inputsOfGatedBy[gatedUnit][unit]
  const maxActivation = inputsOfGatedUnit.reduce((max, input) => Math.max(this.activation[input], max), -Infinity)
  const inputUnitWithHigherActivation = inputsOfGatedUnit.find(input => this.activation[input] === maxActivation)
  return inputUnitWithHigherActivation === inputUnit ? 1 : 0*/
/*case ActivationTypes.DROPOUT:
  const chances = this.state[unit]
  return this.random() < chances && this.status === StatusTypes.TRAINING ? 0 : 1*/

export function buildDerivativeFunction(state: Variable, activation: Variable, type: ActivationTypes): ExpressionNode {
  if ((type & WHOLE_LAYER_ACTIVATION_KIND) != 0) return null;
  switch (type) {
    case ActivationTypes.IDENTITY:
      return number(1);

    case ActivationTypes.LOGISTIC_SIGMOID:
      return mul(activation, sub(number(1), activation));

    case ActivationTypes.TANH:
      return sub(number(1), mul(activation, activation));

    case ActivationTypes.STEP:
      return number(0);

    case ActivationTypes.RELU_PLUSONE:
      return conditional(gte(state, number(0)), number(1), number(0));

    case ActivationTypes.RELU:
      return conditional(gte(state, number(0)), number(1), number(0));

    case ActivationTypes.SOFTPLUS:
      return div(number(1), sum(number(1), exp(neg(state))));

    case ActivationTypes.SOFTSIGN:
      // http://www.iro.umontreal.ca/~lisa/publications2/index.php/attachments/single/205
      // http://jmlr.org/proceedings/papers/v9/glorot10a/glorot10a.pdf
      return div(number(1), pow(sum(number(1), abs(state)), number(2)));

    case ActivationTypes.EXP:
      return activation;

    case ActivationTypes.POW:
      return mul(number(2), state);

    case ActivationTypes.POW_MINUS1:
      return div(number(1), mul(state, state));

    case ActivationTypes.GAUSSIAN:
      return mul(mul(number(-2), state), activation);

    case ActivationTypes.INVERSE_IDENTITY:
      return number(-1);

    /*case ActivationTypes.MAX_POOLING:
      const inputUnit = this.inputsOf[unit][0]
      const gatedUnit = this.gatedBy[unit][0]
      const inputsOfGatedUnit = this.inputsOfGatedBy[gatedUnit][unit]
      const maxActivation = inputsOfGatedUnit.reduce((max, input) => Math.max(this.activation[input], max), -Infinity)
      const inputUnitWithHigherActivation = inputsOfGatedUnit.find(input => this.activation[input] === maxActivation)
      return inputUnitWithHigherActivation === inputUnit ? 1 : 0*/
    /*case ActivationTypes.DROPOUT:
      const chances = this.state[unit]
      return this.random() < chances && this.status === StatusTypes.TRAINING ? 0 : 1*/
  }
  return number(1);
}