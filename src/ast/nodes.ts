import { childrenRef, indent } from './helpers';

export type BinaryOperator = '+' | '-' | '/' | '*' | '=' | '*=' | '/=' | '+=' | '-=' | '^' | '>' | '<' | '>=' | '<=' | '=='
export type UnaryOperator = '-' | 'exp' | 'rand'

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

  addNode(node: Node) {
    if (!node) return;
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

export class FunctionNode extends ExpressionNode {
  name: string;

  @childrenRef(0)
  parameters: ParametersNode;

  @childrenRef(1)
  body: LayerNode;

  toString() {
    return `function ${this.name}() {`
      + '\n'
      + indent(this.children.map(x => x + ';').join('\n'))
      + '\n}';
  }
}

export class ParametersNode extends Node {
  children: ParameterNode[];

  toString() {
    return `(${this.children.join(', ')})`;
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

export class LayerNode extends Node {
  id: number;
  children: UnitNode[];
  toString() {
    return `// Layer ${this.id}\n`
      + indent(this.children.map(x => x + ';').join('\n'))
      + '\n';
  }
}

export class UnitNode extends Node {
  id: number;
  children: ExpressionNode[];
  toString() {
    return `// Unit ${this.id}\n`
      + indent(this.children.map(x => x + ';').join('\n'))
      + '\n';
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
    return this.numericValue.toFixed(1);
  }
}