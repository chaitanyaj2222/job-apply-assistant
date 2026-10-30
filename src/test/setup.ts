import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { installChromeMock } from "./chromeMock";

beforeEach(() => {
  installChromeMock();
});

afterEach(() => {
  cleanup();
});
