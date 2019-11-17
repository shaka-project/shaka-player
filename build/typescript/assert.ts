import { strict } from "assert";

export const fail = strict.fail;

// Workaround for node.js "assert" module missing the new TypeScript "asserts" syntax
const assert: (
  condition: unknown,
  message?: string | Error
) => asserts condition = strict.ok;

export default assert;
