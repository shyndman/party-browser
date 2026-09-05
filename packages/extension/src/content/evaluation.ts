import { parse, parseExpressionAt, tokenizer, tokTypes, type Expression, type Options } from 'acorn';

type EvaluationFunction = (this: Window) => Promise<unknown>;
type AsyncFunctionConstructor = new (body: string) => EvaluationFunction;

const AsyncFunction = (async function () {}).constructor as AsyncFunctionConstructor;
const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'script',
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  preserveParens: true,
} satisfies Options;

export function compileEvaluation(script: string): EvaluationFunction {
  let expression = parseWholeExpression(script);
  if (!expression) {
    const { body } = parse(script, PARSE_OPTIONS);
    let lastIndex = body.length - 1;
    while (lastIndex >= 0 && body[lastIndex].type === 'EmptyStatement') {
      lastIndex -= 1;
    }
    const lastStatement = body[lastIndex];
    if (lastStatement?.type === 'ExpressionStatement') {
      expression = lastStatement.expression;
    }
  }
  const functionBody = expression
    ? `${script.slice(0, expression.start)}return (${script.slice(expression.start, expression.end)}\n)${script.slice(expression.end)}`
    : script;
  return new AsyncFunction(functionBody);
}

function parseWholeExpression(script: string): Expression | undefined {
  try {
    const expression = parseExpressionAt(script, 0, PARSE_OPTIONS);
    const suffix = tokenizer(script.slice(expression.end), PARSE_OPTIONS);
    let token = suffix.getToken();
    while (token.type === tokTypes.semi) {
      token = suffix.getToken();
    }
    return token.type === tokTypes.eof ? expression : undefined;
  } catch (error) {
    // A statement body can be valid even when it is not a single expression.
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

