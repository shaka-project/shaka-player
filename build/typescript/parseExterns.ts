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
  FunctionDefinition
} from "./base";

function staticMemberExpressionToPath(expression: estree.Expression): string[] {
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
  return fail(
    "Expected either member expression or identifier as object in path"
  );
}

function parseMethodDefinition(
  md: estree.MethodDefinition
): FunctionDefinition {
  assert(md.key.type === "Identifier");
  return {
    type: DefinitionType.Function,
    identifier: [md.key.name],
    params: md.value.params.map(p => {
      if (p.type === "RestElement") {
        assert(p.argument.type === "Identifier", p.argument.type);
        return "..." + p.argument.name;
      }
      assert(p.type === "Identifier", p.type);
      return p.name;
    }),
    isMethod: md.kind === "method",
    isStatic: md.static,
    isConstructor: md.kind === "constructor",
    attributes: parseLeadingComments(md.leadingComments)
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
        identifier: identifier,
        params: expression.right.params.map(p => {
          assert(p.type === "Identifier");
          return p.name;
        })
      };
    case "ObjectExpression":
      return {
        type: DefinitionType.Object,
        identifier: identifier,
        props: expression.right.properties.map(p => {
          if (p.key.type === "Identifier") {
            return p.key.name;
          }
          if (p.key.type === "Literal") {
            return p.key.value as string;
          }
          throw new Error("Unrecognited key type " + p.key.type);
        })
      };
    case "ClassExpression":
      return {
        type: DefinitionType.Class,
        identifier: identifier,
        superClass: expression.right.superClass
          ? staticMemberExpressionToPath(expression.right.superClass)
          : undefined,
        methods: expression.right.body.body.map(parseMethodDefinition)
      };
    default:
      console.dir(expression.right);
      throw new Error(
        `Unknown expression type ${expression.right.type} for assignment value`
      );
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

function parseExpressionStatement(
  statement: estree.ExpressionStatement
): Definition {
  switch (statement.expression.type) {
    case "AssignmentExpression":
      return parseAssignmentExpression(statement.expression);
    case "MemberExpression":
      return parseMemberExpression(statement.expression);
    default:
      throw new Error(`Unknown expression type ${statement.expression.type}`);
  }
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
    comments: []
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
        break;
      case "const":
        attributes.type = AnnotationType.Const;
        attributes.constType = tag.type || undefined;
        break;
      case "namespace":
        attributes.type = AnnotationType.Const;
        attributes.constType = undefined;
        break;
      case "define":
        attributes.type = AnnotationType.Const;
        attributes.constType = tag.type || undefined;
        if (tag.description) {
          attributes.description = normalizeDescription(tag.description);
        }
        break;
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
        if (tag.type.type === doctrine.Syntax.NameExpression) {
          attributes.implements = tag.type.name;
        } else if (tag.type.type === doctrine.Syntax.TypeApplication) {
          assert(tag.type.expression.type === doctrine.Syntax.NameExpression);
          attributes.implements = tag.type.expression.name;
        } else {
          fail(
            "Expected name or type application expression after implements keyword"
          );
        }
        break;
      case "extends":
        assert(tag.type);
        assert(tag.type.type === doctrine.Syntax.NameExpression);
        attributes.extends = tag.type.name;
        break;
      case "template":
        assert(tag.description);
        attributes.template = tag.description.split(",");
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

function parseLeadingComments(comments?: estree.Comment[]): Attributes {
  if (!comments) {
    return {
      comments: [],
      description: ""
    };
  }
  assert(
    comments.length > 0,
    "Expected at least one leading comment, found none"
  );
  // Only parse the comment closest to the statement
  const comment = comments[comments.length - 1];
  return parseBlockComment(comment);
}

export default function parseExterns(code: string) {
  const program = esprima.parseScript(code, { attachComment: true } as any);
  const definitions = program.body
    // Only take expressions into consideration.
    // Variable declarations are discarded because they are only used for
    // declaring namespaces.
    .filter(
      (statement): statement is estree.ExpressionStatement =>
        statement.type === "ExpressionStatement"
    )
    // Prepare for further inspection
    .map(statement => ({
      ...parseExpressionStatement(statement),
      attributes: parseLeadingComments(statement.leadingComments)
    }))
    // @const without type is only used to define namespaces, discard.
    .filter(
      definition =>
        definition.attributes.type !== AnnotationType.Const ||
        definition.attributes.constType !== undefined
    );

  return definitions;
}
