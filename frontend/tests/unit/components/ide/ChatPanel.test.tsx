import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatPanel } from "@/components/ide/ChatPanel";

vi.mock("@/components/Orb", () => ({ default: () => null }));
vi.mock("@/components/ide/MessageRenderer", () => ({
  MessageRenderer: ({ content }: { content: string }) => <span data-testid="message-content">{content}</span>,
}));
vi.mock("@/lib/api", () => ({
  apiV1: (path: string) => `/api/v1${path.startsWith("/") ? path : `/${path}`}`,
}));
vi.mock("sonner", () => ({
  toast: {
    success: function () {},
    error: function () {},
    warning: function () {},
  },
}));

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "EventSource",
      vi.fn(function (this: unknown) {
        return {
          addEventListener: function () {},
          close: function () {},
        };
      })
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(function () {
        return Promise.resolve({
          ok: true,
          json: function () {
            return Promise.resolve({ threadId: "test-thread-1" });
          },
        });
      })
    );
  });

  it("renders chat input and send area", () => {
    render(
      <ChatPanel
        onCodeAction={function () {}}
        projectId="test-project"
      />
    );
    const input = screen.getByRole("textbox");
    expect(input).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeInTheDocument();
  });

  it("renders message list and shows persisted messages when projectId is set", () => {
    const storageKey = "builder_chat_test-project";
    const messages = [
      { id: "1", role: "user" as const, content: "Hello", timestamp: Date.now() - 60000 },
      { id: "2", role: "assistant" as const, content: "Hi there", timestamp: Date.now() },
    ];
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, JSON.stringify(messages));
    }

    render(
      <ChatPanel
        onCodeAction={function () {}}
        projectId="test-project"
      />
    );

    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Hi there")).toBeInTheDocument();

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(storageKey);
    }
  });

  it("shows view-only hint when builderViewOnly is true", () => {
    render(
      <ChatPanel
        onCodeAction={function () {}}
        projectId="test-project"
        builderViewOnly
      />
    );
    const input = screen.getByPlaceholderText(/view-only access.*clone/i);
    expect(input).toBeDisabled();
    expect(screen.getByText(/view-only access/i)).toBeInTheDocument();
  });
});
