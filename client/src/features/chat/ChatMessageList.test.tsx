import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IChatMessage } from "@/types/chat.types";
import { ChatMessageList } from "./ChatMessageList";

vi.mock("./ChatMessage", () => ({ ChatMessage: ({ message }: { message: IChatMessage }) => <p>{message.content}</p> }));
vi.mock("./TypingIndicator", () => ({ TypingIndicator: () => <p>Working</p> }));

const reply: IChatMessage = { id: "answer", sessionId: "test-chat", role: "assistant", content: "Your fee is USD 25", createdAt: "2026-10-28T12:00:00Z" };
const question: IChatMessage = { ...reply, id: "question", role: "user", content: "What is my fee?" };
let scrolled: Array<{ element: HTMLElement; options: ScrollIntoViewOptions }>;
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeEach(() => {
  scrolled = [];
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: HTMLElement, options: ScrollIntoViewOptions) { scrolled.push({ element: this, options }); },
  });
});
afterEach(() => {
  cleanup();
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("chat answer visibility", () => {
  it("reveals the beginning of a saved answer after loading", () => {
    const view = render(<ChatMessageList messages={[]} isLoading isSending={false} />);
    expect(scrolled).toHaveLength(0);
    view.rerender(<ChatMessageList messages={[question, reply]} isLoading={false} isSending={false} />);
    expect(scrolled.at(-1)?.element).toHaveTextContent("Your fee is USD 25");
    expect(scrolled.at(-1)?.options.block).toBe("start");
  });

  it("follows a pending send, then reveals the answer rather than its action-card footer", () => {
    const view = render(<ChatMessageList messages={[question]} isLoading={false} isSending />);
    expect(scrolled.at(-1)?.options.block).toBe("end");
    view.rerender(<ChatMessageList messages={[question, reply]} isLoading={false} isSending={false} />);
    expect(scrolled.at(-1)?.element).toHaveTextContent("Your fee is USD 25");
    expect(scrolled.at(-1)?.options.block).toBe("start");
  });

  it("does not move the reader when message metadata refreshes", () => {
    const view = render(<ChatMessageList messages={[reply]} isLoading={false} isSending={false} />);
    scrolled = [];
    view.rerender(<ChatMessageList messages={[{ ...reply, metadata: { llmCallCount: 0 } }]} isLoading={false} isSending={false} />);
    expect(scrolled).toHaveLength(0);
  });
});
