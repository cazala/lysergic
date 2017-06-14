import {
  DocumentNode,
  ExpressionNode,
  FunctionNode,
  HeapReferenceNode,
  FloatNumberNode,
  TernaryExpressionNode,
  BinaryExpressionNode,
  BinaryOperator,
  UnaryExpressionNode,
  UnaryOperator,
  ParametersNode,
  ParameterNode,
  BlockNode
} from './nodes';

export function heap(position: number) {
  return new HeapReferenceNode(position | 0);
}

export function number(floatingNumber: number) {
  return new FloatNumberNode(floatingNumber);
}

export function assign(target: HeapReferenceNode, rhs: ExpressionNode) {
  return binaryOp(target, '=', rhs);
}

// https://en.wikipedia.org/wiki/Kronecker_delta
export function krnonecker(i: ExpressionNode, j: ExpressionNode) {
  // i == j ? 1 : 0
  return binaryOp(i, 'kronecker', j);
}

export function assignMul(target: HeapReferenceNode, rhs: ExpressionNode) {
  return binaryOp(target, '*=', rhs);
}

export function assignSum(target: HeapReferenceNode, rhs: ExpressionNode) {
  return binaryOp(target, '+=', rhs);
}

export function assignSub(target: HeapReferenceNode, rhs: ExpressionNode) {
  return binaryOp(target, '-=', rhs);
}

export function assignDiv(target: HeapReferenceNode, rhs: ExpressionNode) {
  return binaryOp(target, '/=', rhs);
}

export function sum(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '+', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function max(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, 'max', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function gt(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '>', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function gte(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '>=', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function lt(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '<', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function lte(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '<=', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function equal(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '==', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function pow(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '^', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function sub(lhs: ExpressionNode, rhs: ExpressionNode) {
  let bo = binaryOp(lhs, '-', rhs);
  bo.hasParenthesis = true;
  return bo;
}

export function mul(lhs: ExpressionNode, rhs: ExpressionNode) {
  return binaryOp(lhs, '*', rhs);
}

export function div(lhs: ExpressionNode, rhs: ExpressionNode) {
  return binaryOp(lhs, '/', rhs);
}

export function exp(rhs: ExpressionNode) {
  return unaryOp('exp', rhs);
}

export function ln(rhs: ExpressionNode) {
  return unaryOp('ln', rhs);
}

export function sqrt(rhs: ExpressionNode) {
  return unaryOp('sqrt', rhs);
}

export function neg(rhs: ExpressionNode) {
  return unaryOp('-', rhs);
}
export function abs(rhs: ExpressionNode) {
  return unaryOp('abs', rhs);
}

export function rand(rhs: ExpressionNode) {
  return unaryOp('rand', rhs);
}

export function conditional(condition, truePart, falsePart) {
  const node = new TernaryExpressionNode();
  node.condition = condition;
  node.truePart = truePart;
  node.falsePart = falsePart;
  return node;
}

export function binaryOp(lhs: ExpressionNode, op: BinaryOperator, rhs: ExpressionNode) {
  let node = new BinaryExpressionNode();
  node.operator = op;
  node.lhs = lhs;
  node.rhs = rhs;
  return node;
}

export function unaryOp(op: UnaryOperator, rhs: ExpressionNode) {
  let node = new UnaryExpressionNode();
  node.operator = op;
  node.rhs = rhs;
  return node;
}

export function func(name: string, ...parameters: string[]) {
  let node = new FunctionNode();
  node.name = name;
  node.body = new BlockNode();
  return node;
}

export function params(...parameters: string[]) {
  let node = new ParametersNode();
  node.children = parameters.map(paramName => new ParameterNode(paramName));
  return node;
}

export function document(...args: ExpressionNode[]) {
  let node = new DocumentNode();
  for (let i of args) {
    if (i) {
      node.children.push(i);
    }
  }
  return node;
}