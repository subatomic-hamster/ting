import { runInNewContext } from "node:vm";
import { expect, test } from "vitest";
import { spaRewriteCode } from "../../infra/lib/spa-rewrite";
const route = (uri: string) =>
  runInNewContext(
    `${spaRewriteCode}; handler({request: {uri: ${JSON.stringify(uri)}}}).uri`,
  );
test("PDF workers and other compiled assets pass through the deployed routing function", () => {
  for (const uri of [
    "/assets/pdf.worker.min-abc.mjs",
    "/assets/index-abc.js",
    "/assets/core.wasm",
    "/config.js",
    "/samples/card.png",
    "/samples/summary.pdf",
  ])
    expect(route(uri)).toBe(uri);
});
test("member and dotted share routes still render the SPA", () => {
  for (const uri of [
    "/plan",
    "/enroll",
    "/auth/callback",
    "/share/dale.cheapest.123",
  ])
    expect(route(uri)).toBe("/index.html");
});
