import assert from "node:assert/strict";
import { test } from "bun:test";
import type { KeyboardEvent } from "react";
import {
  isPostShortcut,
  submitPostShortcut,
} from "../src/components/form-shortcuts";

test("Cmd+Enter and Ctrl+Enter are post shortcuts", () => {
  assert.equal(isPostShortcut({
    key: "Enter",
    metaKey: true,
    ctrlKey: false,
  }), true);
  assert.equal(isPostShortcut({
    key: "Enter",
    metaKey: false,
    ctrlKey: true,
  }), true);
});

test("plain Enter remains available for line breaks", () => {
  assert.equal(isPostShortcut({
    key: "Enter",
    metaKey: false,
    ctrlKey: false,
  }), false);
  assert.equal(isPostShortcut({
    key: "Enter",
    metaKey: true,
    ctrlKey: false,
    isComposing: true,
  }), false);
});

test("the post shortcut submits the textarea form", () => {
  let prevented = false;
  let submitted = false;
  submitPostShortcut({
    key: "Enter",
    metaKey: true,
    ctrlKey: false,
    nativeEvent: { isComposing: false },
    preventDefault: () => {
      prevented = true;
    },
    currentTarget: {
      form: {
        requestSubmit: () => {
          submitted = true;
        },
      },
    },
  } as unknown as KeyboardEvent<HTMLTextAreaElement>);

  assert.equal(prevented, true);
  assert.equal(submitted, true);
});
