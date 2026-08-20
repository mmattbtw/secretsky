import { createFileRoute } from "@tanstack/react-router";
import { apiNotFound } from "~/server/http";

const notFound = () => apiNotFound();

export const Route = createFileRoute("/api/$")({
  server: { handlers: {
    GET: notFound,
    POST: notFound,
    PUT: notFound,
    PATCH: notFound,
    DELETE: notFound,
    OPTIONS: notFound,
  } },
});
