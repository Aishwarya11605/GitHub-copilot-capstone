import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/app/App";

describe("application shell", () => {
  it("renders the main page heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Task list", level: 1 })).toBeVisible();
  });
});
