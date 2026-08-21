import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  HandleSuggestionMenu,
  useHandleTypeahead,
} from "./HandleTypeahead";

export function SiteHeader({ viewer }: { viewer?: { handle: string | null } | null }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const typeahead = useHandleTypeahead({
    value: search,
    onChange: setSearch,
    onSelect: (actor) => {
      void navigate({ to: "/$handle", params: { handle: actor.handle } });
    },
  });

  return (
    <header className="site-header">
      <div className="site-nav">
        <Link className="wordmark" to="/" search={{}}>secretsky</Link>
        <nav aria-label="Main navigation">
          <Link to="/" search={{}}>home</Link>
          {viewer && <Link to="/notifications">notifications</Link>}
          {viewer?.handle && (
            <Link to="/$handle" params={{ handle: viewer.handle }}>@{viewer.handle}</Link>
          )}
          <Link to="/about">about</Link>
          {viewer && (
            <button
              className="link-button"
              onClick={async () => {
                await fetch("/oauth/logout", { method: "POST" });
                window.location.href = "/";
              }}
            >sign out</button>
          )}
        </nav>
      </div>

      {viewer && (
        <form
          className="profile-search"
          onSubmit={(event) => {
            event.preventDefault();
            const handle = search.trim().replace(/^@/, "");
            if (handle) void navigate({ to: "/$handle", params: { handle } });
          }}
        >
          <label htmlFor="profile-search">Find a user</label>
          <div className="handle-typeahead">
            <input
              id="profile-search"
              {...typeahead.inputProps}
              placeholder="handle.example"
            />
            <HandleSuggestionMenu {...typeahead.menuProps} />
          </div>
          <button>Go</button>
        </form>
      )}
    </header>
  );
}
