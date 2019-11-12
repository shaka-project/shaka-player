import { strict } from "assert";

export const fail = strict.fail;

export default function assert(
  condition: unknown,
  message?: string | Error
): asserts condition {
  if (!condition) {
    strict.fail(message);
  }
}
