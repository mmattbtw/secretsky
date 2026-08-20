import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const TYPEAHEAD_ENDPOINT =
  "https://typeahead.waow.tech/xrpc/tech.waow.typeahead.searchActors";

export type HandleSuggestion = {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
};

type TypeaheadResponse = { actors?: unknown };

export function useHandleTypeahead({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (actor: HandleSuggestion) => void;
}) {
  const listboxId = useId();
  const skipQuery = useRef<string | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<HandleSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const query = normalizeHandle(value);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setSearchedQuery("");
      setLoading(false);
      setOpen(false);
      return;
    }
    if (skipQuery.current === query) {
      skipQuery.current = undefined;
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = new URL(TYPEAHEAD_ENDPOINT);
        url.searchParams.set("q", query);
        url.searchParams.set("limit", "8");
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Typeahead failed: ${response.status}`);
        const actors = parseSuggestions(await response.json() as TypeaheadResponse);
        setSuggestions(actors);
        setSearchedQuery(query);
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSuggestions([]);
          setSearchedQuery("");
          setOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(actor: HandleSuggestion) {
    skipQuery.current = actor.handle;
    onChange(actor.handle);
    setOpen(false);
    setActiveIndex(-1);
    onSelect?.(actor);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    skipQuery.current = undefined;
    onChange(event.target.value.replace(/^@+/, ""));
    setActiveIndex(-1);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    }
  }

  function onInputFocus() {
    if (query.length >= 2 && (suggestions.length > 0 || searchedQuery === query)) {
      setOpen(true);
    }
  }

  function onInputBlur(_event: FocusEvent<HTMLInputElement>) {
    setOpen(false);
    setActiveIndex(-1);
  }

  const showMenu = open && query.length >= 2;
  return {
    inputProps: {
      value,
      onChange: onInputChange,
      onKeyDown: onInputKeyDown,
      onFocus: onInputFocus,
      onBlur: onInputBlur,
      role: "combobox" as const,
      "aria-autocomplete": "list" as const,
      "aria-expanded": showMenu,
      "aria-controls": listboxId,
      "aria-activedescendant":
        activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined,
      autoComplete: "off",
    },
    menuProps: {
      id: listboxId,
      loading,
      open: showMenu,
      activeIndex,
      suggestions,
      onChoose: choose,
    },
  };
}

export function HandleSuggestionMenu({
  id,
  loading,
  open,
  activeIndex,
  suggestions,
  onChoose,
}: {
  id: string;
  loading: boolean;
  open: boolean;
  activeIndex: number;
  suggestions: HandleSuggestion[];
  onChoose: (actor: HandleSuggestion) => void;
}) {
  if (!open) return null;
  return (
    <div className="handle-suggestions" role="listbox" id={id}>
      {suggestions.map((actor, index) => (
        <button
          type="button"
          className="handle-suggestion"
          id={`${id}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          key={actor.did}
          onPointerDown={(event) => {
            event.preventDefault();
            onChoose(actor);
          }}
        >
          <span className="suggestion-copy">
            <strong>@{actor.handle}</strong>
            {actor.displayName && <small>{actor.displayName}</small>}
          </span>
        </button>
      ))}
      {loading && <p className="suggestion-status">Searching...</p>}
      {!loading && suggestions.length === 0 && (
        <p className="suggestion-status">No matching handles</p>
      )}
    </div>
  );
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

function parseSuggestions(data: TypeaheadResponse): HandleSuggestion[] {
  if (!Array.isArray(data.actors)) return [];
  return data.actors.flatMap((actor) => {
    if (!actor || typeof actor !== "object") return [];
    const candidate = actor as Record<string, unknown>;
    if (typeof candidate.did !== "string" || typeof candidate.handle !== "string") {
      return [];
    }
    return [{
      did: candidate.did,
      handle: candidate.handle,
      displayName:
        typeof candidate.displayName === "string" ? candidate.displayName : undefined,
      avatar: typeof candidate.avatar === "string" ? candidate.avatar : undefined,
    }];
  });
}
