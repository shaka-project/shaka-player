import * as esprima from "esprima";
import * as estree from "estree";
import * as doctrine from "@teppeis/doctrine";
import assert, { fail } from "./assert";
import {
  Attributes,
  AnnotationType,
  DefinitionType,
  Definition,
  PropertyDefinition,
  FunctionDefinition,
  CommentDefinition
} from "./base";

type Statement = estree.Statement | estree.ModuleDeclaration;

const ds = doctrine.Syntax;

function staticMemberExpressionToPath(expression: estree.Expression): string[] {
  if (expression.type === "Identifier") {
    return [expression.name];
  }

  assert(
    expression.type === "MemberExpression",
    "Expected MemberExpression, got " + expression.type
  );
  const { object, property } = expression;
  assert(property.type === "Identifier");

  if (object.type === "MemberExpression") {
    return [...staticMemberExpressionToPath(object), property.name];
  }
  if (object.type === "Identifier") {
    return [object.name, property.name];
  }
  if (object.type === "ThisExpression") {
    return ["this", property.name];
  }
  return fail(
    "Expected either member expression, identifier, or `this` as object in path"
  );
}

function parseMethodDefinition(
  md: estree.MethodDefinition
): FunctionDefinition | null {
  assert(md.key.type === "Identifier");
  const [_, attributes] = parseLeadingComment(md.leadingComments);
  if (!attributes.export && md.kind !== "constructor") {
    return null;
  }
  return {
    type: DefinitionType.Function,
    identifier: [md.key.name],
    params: md.value.params.map(p => {
      if (p.type === "RestElement") {
        assert(p.argument.type === "Identifier", p.argument.type);
        return p.argument.name;
      }
      if (p.type === "AssignmentPattern") {
        assert(p.left.type === "Identifier", p.left.type);
        return p.left.name;
      }
      assert(p.type === "Identifier", p.type);
      return p.name;
    }),
    isMethod: md.kind === "method",
    isStatic: md.static,
    isConstructor: md.kind === "constructor",
    definitions: parseBody(md.value.body.body),
    attributes
  };
}

function parseFunctionDeclaration(
  decl: estree.FunctionDeclaration
): FunctionDefinition {
  assert(decl.id);
  return {
    type: DefinitionType.Function,
    identifier: staticMemberExpressionToPath(decl.id),
    params: decl.params.map(p => {
      assert(p.type === "Identifier");
      return p.name;
    })
  };
}

function parseAssignmentExpression(
  expression: estree.AssignmentExpression
): Definition {
  assert(expression.left.type === "MemberExpression");
  const identifier = staticMemberExpressionToPath(expression.left);
  switch (expression.right.type) {
    case "FunctionExpression":
      return {
        type: DefinitionType.Function,
        identifier,
        params: expression.right.params.map(p => {
          assert(p.type === "Identifier");
          return p.name;
        })
      };
    case "ObjectExpression":
      return {
        type: DefinitionType.Object,
        identifier,
        props: expression.right.properties.map(p => {
          if (p.key.type === "Identifier") {
            return p.key.name;
          }
          if (p.key.type === "Literal") {
            return p.key.value as string;
          }
          throw new Error("Unrecognized key type " + p.key.type);
        })
      };
    case "ClassExpression":
      return {
        type: DefinitionType.Class,
        identifier,
        superClass: expression.right.superClass
          ? staticMemberExpressionToPath(expression.right.superClass)
          : undefined,
        methods: expression.right.body.body
          .map(parseMethodDefinition)
          .filter((m): m is FunctionDefinition => m != null)
      };
    default:
      // console.dir(expression.right);
      return {
        type: DefinitionType.Property,
        identifier
      };
  }
}

function parseMemberExpression(
  expression: estree.MemberExpression
): PropertyDefinition {
  return {
    type: DefinitionType.Property,
    identifier: staticMemberExpressionToPath(expression)
  };
}

function parseStatement(statement: Statement): Definition {
  if (statement.type === "FunctionDeclaration") {
    return parseFunctionDeclaration(statement);
  }
  if (statement.type === "ExpressionStatement") {
    switch (statement.expression.type) {
      case "AssignmentExpression":
        return parseAssignmentExpression(statement.expression);
      case "MemberExpression":
        return parseMemberExpression(statement.expression);
      default:
        throw new Error(`Unknown expression type ${statement.expression.type}`);
    }
  }
  throw new Error(`Unknown statement type ${statement.type}`);
}

function normalizeDescription(description: string): string {
  return description
    .split("\n")
    .map(line => line.trim())
    .join(" ");
}

function parseBlockComment(comment: estree.Comment): Attributes {
  assert(
    comment.type === "Block",
    "Expected comment of type Block, got " + comment.type
  );

  const ast = doctrine.parse(comment.value, { unwrap: true });

  const attributes: Attributes = {
    description: normalizeDescription(ast.description),
    comments: [],
    export: false
  };

  for (const tag of ast.tags) {
    switch (tag.title) {
      case "summary":
        assert(tag.description);
        attributes.description = normalizeDescription(tag.description);
        break;
      case "description":
        assert(tag.description);
        attributes.description = normalizeDescription(tag.description);
        break;
      case "typedef":
        assert(tag.type);
        attributes.type = AnnotationType.Typedef;
        attributes.typedefType = tag.type;
        break;
      case "property":
        assert(tag.name);
        assert(tag.type);
        attributes.props = attributes.props || [];
        attributes.props.push({
          name: tag.name,
          type: tag.type,
          description: tag.description
            ? normalizeDescription(tag.description)
            : undefined
        });
        if (
          tag.name === "type" &&
          tag.description &&
          attributes.type === AnnotationType.Event
        ) {
          attributes.eventType = normalizeDescription(tag.description);
        }
        break;
      case "const":
        attributes.type = AnnotationType.Const;
        attributes.constType = tag.type || undefined;
        break;
      case "namespace":
        attributes.type = AnnotationType.Namespace;
        break;
      case "define":
        attributes.type = AnnotationType.Const;
        attributes.constType = tag.type || undefined;
        if (tag.description) {
          attributes.description = normalizeDescription(tag.description);
        }
        break;
      case "event":
        assert(tag.description);
        attributes.type = AnnotationType.Event;
        attributes.identifier = tag.description.split(".");
        break;
      case "protected":
      case "type":
        attributes.type = AnnotationType.Property;
        attributes.propType = tag.type || undefined;
        break;
      case "constructor":
        attributes.type = AnnotationType.Class;
        break;
      case "enum":
        attributes.type = AnnotationType.Enum;
        attributes.enumType = tag.type || undefined;
        break;
      case "interface":
        attributes.type = AnnotationType.Interface;
        break;
      case "param":
        assert(tag.name);
        assert(tag.type);
        attributes.paramTypes = attributes.paramTypes || {};
        attributes.paramTypes[tag.name] = tag.type;
        if (tag.description) {
          const description = normalizeDescription(tag.description);
          attributes.comments.push(`@param ${tag.name} ${description}`);
        }
        break;
      case "return":
        attributes.type = AnnotationType.Function;
        attributes.returnType = tag.type || undefined;
        if (tag.description) {
          const description = normalizeDescription(tag.description);
          attributes.comments.push(`@returnType ${description}`);
        }
        break;
      case "implements":
        assert(tag.type);
        attributes.implements = tag.type;
        break;
      case "extends":
        assert(tag.type);
        if (tag.type.type === ds.NameExpression && tag.type.name === "Error") {
          // Refer to built-in Error typeas "window.Error"
          attributes.extends = {
            type: ds.NameExpression,
            name: "window.Error"
          } as doctrine.type.NameExpression;
        } else {
          attributes.extends = tag.type;
        }
        break;
      case "template":
        assert(tag.description);
        attributes.template = tag.description.split(",");
        break;
      case "export":
      case "exportInterface":
      case "exportTypescript":
        attributes.export = true;
        break;
      case "exportDoc":
        attributes.export = attributes.type !== AnnotationType.Namespace;
        break;
      default:
        break;
    }
  }

  if (attributes.description) {
    attributes.comments.unshift(attributes.description);
  }

  return attributes;
}

function parseLeadingComment(
  comments: estree.Comment[] | undefined
): [estree.Comment[], Attributes] {
  const blockComments = comments?.filter(c => c.type === "Block");
  if (!blockComments || !blockComments.length) {
    return [
      [],
      {
        comments: [],
        description: "",
        export: false
      }
    ];
  }
  return [blockComments, parseBlockComment(blockComments.pop()!)];
}

function parseBody(statements: Statement[]): Definition[] {
  return statements.flatMap(statement => {
    const [comments, attributes] = parseLeadingComment(
      statement.leadingComments
    );
    const commentDefinitions = comments.flatMap<CommentDefinition>(comment => {
      const attributes = parseBlockComment(comment);
      if (!attributes.export) {
        return [];
      }
      assert(attributes.identifier);
      return {
        type: DefinitionType.Comment,
        identifier: attributes.identifier,
        attributes
      };
    });
    if (!attributes.export) {
      return commentDefinitions;
    }
    return [
      ...commentDefinitions,
      {
        ...parseStatement(statement),
        attributes
      }
    ];
  });
}

export default function parseExterns(code: string): Definition[] {
  const program = esprima.parseScript(code, { attachComment: true } as any);
  return parseBody(program.body);
}
