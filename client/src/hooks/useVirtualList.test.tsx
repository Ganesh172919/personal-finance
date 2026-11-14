import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useVirtualList } from "./useVirtualList";

function ScrollList() {
  const { containerRef, visibleItems } = useVirtualList({
    items: Array.from({ length: 100 }, (_, index) => `Item ${index}`),
    itemHeight: 20, containerHeight: 100, overscan: 0,
  });
  return <div ref={containerRef} data-testid="scroll-list">{visibleItems.map(row => <p key={row.index}>{row.item}</p>)}</div>;
}

describe("virtual list scrolling", () => {
  it("renders the new viewport after scrolling instead of leaving the first rows frozen", () => {
    render(<ScrollList />);
    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.queryByText("Item 20")).not.toBeInTheDocument();
    fireEvent.scroll(screen.getByTestId("scroll-list"), { target: { scrollTop: 400 } });
    expect(screen.getByText("Item 20")).toBeInTheDocument();
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
  });
});
