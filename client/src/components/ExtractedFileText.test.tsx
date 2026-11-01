import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ExtractedFileText } from "./ExtractedFileText";

afterEach(cleanup);

it("navigates physical PDF pages without skipping a blank middle page", () => {
  render(<ExtractedFileText text={"Income USD 7500\f\fPrepayment fee USD 25"} pageCount={3} />);
  expect(screen.getByRole("status")).toHaveTextContent("Page 1 of 3");
  expect(screen.getByRole("button", { name: "Previous extracted page" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toHaveValue("Income USD 7500");
  fireEvent.click(screen.getByRole("button", { name: "Next extracted page" }));
  expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 3");
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByText(/No selectable text/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next extracted page" }));
  expect(screen.getByRole("textbox", { name: "Extracted text, page 3" })).toHaveValue("Prepayment fee USD 25");
  expect(screen.getByRole("button", { name: "Next extracted page" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous extracted page" }));
  expect(screen.getByRole("status")).toHaveTextContent("Page 2 of 3");
});

it("retains leading and trailing blank pages", () => {
  render(<ExtractedFileText text={"\fCoverage\f"} pageCount={3} />);
  expect(screen.getByRole("textbox")).toHaveValue("");
  fireEvent.click(screen.getByRole("button", { name: "Next extracted page" }));
  expect(screen.getByRole("textbox")).toHaveValue("Coverage");
  fireEvent.click(screen.getByRole("button", { name: "Next extracted page" }));
  expect(screen.getByRole("status")).toHaveTextContent("Page 3 of 3");
  expect(screen.getByRole("textbox")).toHaveValue("");
});

it("explains that later PDF pages are missing after bounded extraction", () => {
  render(<ExtractedFileText text="Only first page retained..." pageCount={8} />);
  expect(screen.getByText(/Text is available for 1 of 8 PDF pages/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next extracted page" })).toBeDisabled();
});

it("keeps legacy flattened files and plain notes readable without invented page numbers", () => {
  render(<ExtractedFileText text={"Original note\nSecond line"} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Extracted text" })).toHaveValue("Original note\nSecond line");
});

it("does not substitute a different page when a citation points past the extracted text", () => {
  const onPageChange = vi.fn();
  render(<ExtractedFileText text="First page retained..." pageCount={8} page={4} onPageChange={onPageChange} />);
  expect(screen.getByRole("status")).toHaveTextContent("Page 4 is not available");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Go to first extracted page" }));
  expect(onPageChange).toHaveBeenCalledWith(1);
});
