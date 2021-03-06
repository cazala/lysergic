import { childrenRef, indent } from './helpers';

export type BinaryOperator = '+' | '-' | '/' | '*' | '=' | '*=' | '/=' | '+=' | '-=' | '^' | '>' | '<' | '>=' | '<=' | '==' | 'max' | 'kronecker';
export type UnaryOperator = '-' | 'exp' | 'rand' | 'abs' | 'sqrt' | 'ln' | 'sign';

export abstract class Node {
  children: Node[] = [];

  hasParenthesis: boolean = false;

  nameMapping: { [i: number]: string };

  originalText: string;

  constructor() {
    let originalToString = this.toString;

    this.toString = () => {
      if (this.hasParenthesis)
        return '(' + originalToString.apply(this) + ')';
      return originalToString.apply(this);
    };
  }

  parent: Node;

  addNode(node: Node | Node[]) {
    if (!node) return;
    if (node instanceof Array) {
      node.forEach($ => this.addNode($));
      return;
    }
    node.parent = this;
    this.children.push(node);
  }

  toString(): string {
    if (this.originalText) {
      return this.originalText;
    }
    return this.children.map(x => x.toString()).join('\n');
  }

  get value(): string {
    return null;
  }

  inspect() {
    let childrenInspected = this.children.map((x, i) => {
      let name = this.nameMapping && this.nameMapping[i];
      if (name) name = name + ': ';
      else name = '';

      return name + (!x ? 'null' : x.inspect());
    }).join('\n');

    return (this as any).constructor.name +
      (this.value ? ' value=' + this.value : '')
      + ' [' + (
        childrenInspected ? '\n' + indent(childrenInspected) + '\n'
          : ''
      ) + ']';
  }
}

export class ExpressionNode extends Node { }

export class DocumentNode extends Node {
  children: ExpressionNode[];
  toString() {
    return this.children.join(';\n');
  }
}


export class ParameterNode extends ExpressionNode {
  constructor(public name: string) {
    super();
  }

  toString() {
    return this.name;
  }
}

export class ParametersNode extends Node {
  children: ParameterNode[];

  toString() {
    return `(${this.children.join(', ')})`;
  }
}


export class BlockNode extends Node {
  name: string;
  children: ExpressionNode[];
  toString() {
    return `{\n` + indent(this.children.map(x => x + ';').join('\n')) + `\n};`;
  }
}

export class FunctionNode extends ExpressionNode {
  name: string;

  @childrenRef(0)
  parameters: ParametersNode;

  @childrenRef(1)
  body: BlockNode;

  toString() {
    return `function ${this.name}() {`
      + '\n'
      + indent(this.body.toString())
      + '\n}';
  }
}


export class HeapPointer extends ExpressionNode {
  @childrenRef(0)
  position: ExpressionNode;

  toString() {
    return `H[${this.position}]`;
  }
}

export class HeapReferenceNode extends ExpressionNode {
  constructor(public position: number) {
    super();
  }

  toString() {
    return `H[${this.position}]`;
  }
}

export class TernaryExpressionNode extends ExpressionNode {
  @childrenRef(0)
  condition: ExpressionNode;

  @childrenRef(1)
  truePart: ExpressionNode;

  @childrenRef(2)
  falsePart: ExpressionNode;

  constructor() {
    super();
  }

  toString() {
    return this.condition.toString() + ' ? ' + this.truePart.toString() + ' : ' + this.falsePart.toString();
  }
}

export class BinaryExpressionNode extends ExpressionNode {
  @childrenRef(0)
  lhs: ExpressionNode;

  @childrenRef(1)
  rhs: ExpressionNode;

  operator: BinaryOperator;

  toString() {
    switch (this.operator) {
      case "^":
        return `Math.pow(${this.lhs}, ${this.rhs})`;
    }
    return this.lhs.toString() + ' ' + this.operator + ' ' + this.rhs.toString();
  }
}



export class UnaryExpressionNode extends ExpressionNode {
  @childrenRef(0)
  rhs: ExpressionNode;
  operator: UnaryOperator;

  toString() {
    return this.operator + '(' + this.rhs.toString() + ')';
  }
}

export class FloatNumberNode extends ExpressionNode {
  constructor(public numericValue: number) {
    super();
  }

  toString() {
    return this.numericValue.toFixed(10);
  }
}


export class IntNumberNode extends ExpressionNode {
  constructor(public numericValue: number) {
    super();
  }

  toString() {
    return this.numericValue.toFixed(0);
  }
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


export class VariableDeclaration extends ExpressionNode {
  constructor(
    public name: string,
    public type: 'int' | 'float',
    public initialValue: number
  ) {
    super();
  }
}

export class VariableReference extends ExpressionNode {
  constructor(public variable: VariableDeclaration) {
    super();
  }
}

export class ForLoopNode extends ExpressionNode {
  from: number;
  to: number;
  @childrenRef(0)
  var: VariableReference;
  @childrenRef(1)
  expression: ExpressionNode;
}