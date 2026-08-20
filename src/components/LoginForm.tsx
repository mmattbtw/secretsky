import { useState } from "react";
import {
  HandleSuggestionMenu,
  useHandleTypeahead,
} from "./HandleTypeahead";

export function LoginForm() {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const typeahead = useHandleTypeahead({ value: handle, onChange: setHandle });

  return (
    <form
      className="login-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!handle.trim() || busy) return;
        setBusy(true);
        setError(undefined);
        const response = await fetch("/oauth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle }),
        });
        const body = await response.json() as {
          redirectUrl?: string;
          error?: string;
        };
        if (!response.ok || !body.redirectUrl) {
          setBusy(false);
          setError(body.error ?? "Could not sign in");
          return;
        }
        window.location.href = body.redirectUrl;
      }}
    >
      <label htmlFor="login-handle">Handle</label>
      <div className="login-row">
        <div className="handle-typeahead">
          <input
            id="login-handle"
            {...typeahead.inputProps}
            onKeyDown={(event) => {
              typeahead.inputProps.onKeyDown(event);
              if (
                event.defaultPrevented ||
                event.key !== "Enter" ||
                event.nativeEvent.isComposing
              ) return;
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder="you.example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <HandleSuggestionMenu {...typeahead.menuProps} />
        </div>
        <button disabled={busy || !handle.trim()}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
