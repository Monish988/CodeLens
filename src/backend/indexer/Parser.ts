import Parser from 'tree-sitter';
// @ts-ignore - native bindings often lack types
import JavaScript from 'tree-sitter-javascript';
// @ts-ignore
import TypeScript from 'tree-sitter-typescript';

export interface ParsedEntity {
  type: 'function' | 'class' | 'variable' | 'comment';
  name: string;
  content: string;
  start_line: number;
  end_line: number;
  complexity?: number;
  calls?: string[];
}

export class ASTParser {
  private jsParser: Parser;
  private tsParser: Parser;
  private tsxParser: Parser;

  constructor() {
    this.jsParser = new Parser();
    this.jsParser.setLanguage(JavaScript);

    this.tsParser = new Parser();
    this.tsParser.setLanguage(TypeScript.typescript);

    this.tsxParser = new Parser();
    this.tsxParser.setLanguage(TypeScript.tsx);
  }

  public parse(filePath: string, fileContent: string): ParsedEntity[] {
    let parser: Parser;

    if (filePath.endsWith('.ts')) {
      parser = this.tsParser;
    } else if (filePath.endsWith('.tsx')) {
      parser = this.tsxParser;
    } else if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
      parser = this.jsParser;
    } else {
      // Unsupported extension, just return empty for now
      return [];
    }

    const tree = parser.parse(fileContent);
    const entities: ParsedEntity[] = [];

    this.traverse(tree.rootNode, fileContent, entities);
    return entities;
  }

  private traverse(node: Parser.SyntaxNode, fileContent: string, entities: ParsedEntity[], currentEntity?: ParsedEntity) {
    const type = node.type;
    let newEntity: ParsedEntity | undefined;

    if (
      type === 'function_declaration' || 
      type === 'arrow_function' || 
      type === 'method_definition'
    ) {
      let name = 'anonymous';
      if (type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) name = nameNode.text;
      } else if (type === 'method_definition') {
        const nameNode = node.childForFieldName('name');
        // method_definition name can be a computed property — guard against null
        name = nameNode ? nameNode.text : 'anonymous_method';
      }
      if (type === 'arrow_function' && node.parent?.type === 'variable_declarator') {
        const nameNode = node.parent.childForFieldName('name');
        if (nameNode) name = nameNode.text;
      }

      newEntity = {
        type: 'function',
        name,
        content: node.text,
        start_line: node.startPosition.row + 1,
        end_line: node.endPosition.row + 1,
        complexity: 1,
        calls: [],
      };
      entities.push(newEntity);
    } else if (type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      newEntity = {
        type: 'class',
        name: nameNode ? nameNode.text : 'anonymous_class',
        content: node.text,
        start_line: node.startPosition.row + 1,
        end_line: node.endPosition.row + 1,
        complexity: 1,
        calls: [],
      };
      entities.push(newEntity);
    } else if (type === 'variable_declarator') {
      const nameNode = node.childForFieldName('name');
      const valueNode = node.childForFieldName('value');
      
      if (valueNode && valueNode.type !== 'arrow_function') {
        newEntity = {
          type: 'variable',
          name: nameNode ? nameNode.text : 'unknown',
          content: node.text,
          start_line: node.startPosition.row + 1,
          end_line: node.endPosition.row + 1,
          calls: [],
        };
        entities.push(newEntity);
      }
    } else if (type === 'comment') {
      entities.push({
        type: 'comment',
        name: 'comment',
        content: node.text,
        start_line: node.startPosition.row + 1,
        end_line: node.endPosition.row + 1,
      });
    } else if (type === 'call_expression') {
      // Find what is being called
      const functionNode = node.childForFieldName('function');
      if (functionNode && currentEntity) {
        let calledName = '';
        if (functionNode.type === 'identifier') {
          calledName = functionNode.text;
        } else if (functionNode.type === 'member_expression') {
          const propertyNode = functionNode.childForFieldName('property');
          if (propertyNode) calledName = propertyNode.text;
        }
        
        if (calledName && !currentEntity.calls?.includes(calledName)) {
          currentEntity.calls?.push(calledName);
        }
      }
    }

    // Cyclomatic complexity check
    const complexityNodes = [
      'if_statement',
      'for_statement',
      'for_in_statement',
      'while_statement',
      'do_statement',
      'switch_case',
      'catch_clause',
      'ternary_expression'
    ];

    if (currentEntity && complexityNodes.includes(type)) {
      currentEntity.complexity = (currentEntity.complexity || 1) + 1;
    }

    // Recursively traverse children
    for (const child of node.namedChildren) {
      this.traverse(child, fileContent, entities, newEntity || currentEntity);
    }
  }
}
