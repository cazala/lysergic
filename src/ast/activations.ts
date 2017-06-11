import { Variable, ActivationTypes } from "../index";
import { mul, number, div, sum, exp, neg, sub, conditional, gt, ln, abs, pow } from "./operations";
import { ExpressionNode } from "./nodes";

export function buildActivationFunction(state: Variable, type: ActivationTypes): ExpressionNode {
  switch (type) {
    case ActivationTypes.LOGISTIC_SIGMOID:
      return div(number(1), sum(number(1), exp(neg(state))));

    case ActivationTypes.TANH:
      return div(sub(exp(state), div(number(1), exp(state))), sum(exp(state), div(number(1), exp(state))));

    case ActivationTypes.STEP:
      return conditional(gt(state, number(0)), number(1), number(0));

    case ActivationTypes.RELU_PLUSONE:
      return sum(number(1), conditional(gt(state, number(0)), state, number(0)));

    case ActivationTypes.RELU:
      return conditional(gt(state, number(0)), state, number(0));

    case ActivationTypes.SOFTPLUS:
      return ln(sum(number(1), exp(state)));

    case ActivationTypes.SOFTSIGN:
      // http://www.iro.umontreal.ca/~lisa/publications2/index.php/attachments/single/205
      // http://jmlr.org/proceedings/papers/v9/glorot10a/glorot10a.pdf
      return div(state, sum(number(1), abs(state))); // activation = x / (1 + Math.abs(x));

    case ActivationTypes.EXP:
      return exp(state);

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
  switch (type) {
    case ActivationTypes.LOGISTIC_SIGMOID:
      return mul(activation, sub(number(1), activation));

    case ActivationTypes.TANH:
      return sub(number(1), mul(activation, activation));

    case ActivationTypes.STEP:
      return number(0);

    case ActivationTypes.RELU_PLUSONE:
      return conditional(gt(state, number(0)), number(1), number(0));

    case ActivationTypes.RELU:
      return conditional(gt(state, number(0)), number(1), number(0));

    case ActivationTypes.SOFTPLUS:
      return div(number(1), sum(number(1), exp(neg(state))));

    case ActivationTypes.SOFTSIGN:
      // http://www.iro.umontreal.ca/~lisa/publications2/index.php/attachments/single/205
      // http://jmlr.org/proceedings/papers/v9/glorot10a/glorot10a.pdf
      return div(number(1), pow(sum(number(1), abs(state)), number(2)));

    case ActivationTypes.EXP:
      return activation;

    case ActivationTypes.GAUSSIAN:
      return mul(mul(number(-2), state), activation);

    case ActivationTypes.INVERSE_IDENTITY:
      return number(-1);

    case ActivationTypes.DROPOUT:
      return number(0);

    case ActivationTypes.IDENTITY:
      return number(1);
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
    case ActivationTypes.SOFTMAX:
    case ActivationTypes.MAXOUT:
      return null;
  }
  return number(1);
}