import type { KeyboardEvent } from "react";

export function isPostShortcut(input: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
}): boolean {
  return (
    input.key === "Enter" &&
    (input.metaKey || input.ctrlKey) &&
    !input.isComposing
  );
}

export function submitPostShortcut(
  event: KeyboardEvent<HTMLTextAreaElement>,
): void {
  if (!isPostShortcut({
    key: event.key,
    metaKey: event.metaKey,
    ctrlKey: event.ctrlKey,
    isComposing: event.nativeEvent.isComposing,
  })) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}
