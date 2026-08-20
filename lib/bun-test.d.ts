declare module "bun:test" {
  export { test, describe, before, after, beforeEach, afterEach } from "node:test";

  type Matchers = {
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
  };

  export function expect(actual: unknown): Matchers & {
    rejects: Matchers;
  };
}
