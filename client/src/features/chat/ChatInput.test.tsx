import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadWorkspaceFiles } from "@/lib/api/files";
import { ChatInput } from "./ChatInput";

vi.mock("@/lib/api/files", () => ({ uploadWorkspaceFiles: vi.fn() }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

const fileId = "507f1f77bcf86cd799439011";
const savedFile = { workspaceFileId: "507f1f77bcf86cd799439099", fileId: "507f1f77bcf86cd799439098", originalName: "saved-budget.pdf", mimeType: "application/pdf", sizeBytes: 2048 };
const addFile = (name = "synthetic-statement.pdf") => {
  const file = new File(["Synthetic statement only"], name, { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose files for chat"), { target: { files: [file] } });
  return file;
};
const typeMessage = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Message to your finance assistant" }), { target: { value: text } });
const send = () => fireEvent.click(screen.getByRole("button", { name: "Send message" }));

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("chat composer recovery", () => {
  it("focuses the composer and sends a saved document without uploading again", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} isSending={false} workspaceAttachments={[savedFile]} />);
    expect(screen.getByRole("textbox")).toHaveFocus();
    typeMessage("What is the savings target in this document?");
    send();
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("What is the savings target in this document?", { narrative: false, fileIds: [savedFile.workspaceFileId] }));
    expect(uploadWorkspaceFiles).not.toHaveBeenCalled();
  });

  it("combines a saved file with a newly uploaded file", async () => {
    vi.mocked(uploadWorkspaceFiles).mockResolvedValueOnce({ files: [{ id: fileId }] } as Awaited<ReturnType<typeof uploadWorkspaceFiles>>);
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} isSending={false} workspaceAttachments={[savedFile]} />);
    const localFile = addFile();
    typeMessage("Compare these documents");
    send();
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("Compare these documents", { narrative: false, fileIds: [savedFile.workspaceFileId, fileId] }));
    expect(uploadWorkspaceFiles).toHaveBeenCalledWith([localFile]);
  });

  it("retains saved context on failure and lets the user remove it", async () => {
    const onRemove = vi.fn();
    render(<ChatInput onSend={vi.fn().mockResolvedValue(false)} isSending={false} workspaceAttachments={[savedFile]} onRemoveWorkspaceAttachment={onRemove} />);
    typeMessage("Keep my saved context");
    send();
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("Keep my saved context");
    fireEvent.click(screen.getByRole("button", { name: "Remove saved saved-budget.pdf" }));
    expect(onRemove).toHaveBeenCalledWith(savedFile.workspaceFileId);
    expect(uploadWorkspaceFiles).not.toHaveBeenCalled();
  });

  it("enforces the combined ten-file limit before uploading or sending", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isSending={false} workspaceAttachments={Array.from({ length: 10 }, (_, i) => ({ ...savedFile, workspaceFileId: `${i}` }))} />);
    addFile();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 10 files");
    expect(uploadWorkspaceFiles).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("keeps a rejected draft and attachment, then reuses the upload when retrying", async () => {
    vi.mocked(uploadWorkspaceFiles).mockResolvedValue({ files: [{ id: fileId }] } as Awaited<ReturnType<typeof uploadWorkspaceFiles>>);
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChatInput onSend={onSend} isSending={false} />);
    typeMessage("Please check the synthetic fee");
    const file = addFile();
    send();
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("Please check the synthetic fee");
    expect(screen.getByRole("button", { name: `Remove ${file.name}` })).toBeEnabled();
    send();
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(""));
    expect(uploadWorkspaceFiles).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenLastCalledWith("Please check the synthetic fee", { narrative: false, fileIds: [fileId] });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Remove ${file.name}` })).not.toBeInTheDocument();
  });

  it("keeps the draft on upload failure and never sends incomplete attachments", async () => {
    vi.mocked(uploadWorkspaceFiles).mockRejectedValueOnce(new Error("Upload unavailable"));
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isSending={false} />);
    typeMessage("Keep my question");
    addFile();
    send();
    expect(await screen.findByRole("alert")).toHaveTextContent("draft and attachments are kept");
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Keep my question");
  });

  it("uploads only newly added files after a failed send", async () => {
    vi.mocked(uploadWorkspaceFiles)
      .mockResolvedValueOnce({ files: [{ id: fileId }] } as Awaited<ReturnType<typeof uploadWorkspaceFiles>>)
      .mockResolvedValueOnce({ files: [{ id: "507f1f77bcf86cd799439012" }] } as Awaited<ReturnType<typeof uploadWorkspaceFiles>>);
    const onSend = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ChatInput onSend={onSend} isSending={false} />);
    const first = addFile();
    send();
    await screen.findByRole("alert");
    const second = addFile("second-synthetic.pdf");
    send();
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(uploadWorkspaceFiles).toHaveBeenNthCalledWith(1, [first]);
    expect(uploadWorkspaceFiles).toHaveBeenNthCalledWith(2, [second]);
    expect(onSend).toHaveBeenLastCalledWith(expect.any(String), { narrative: false, fileIds: [fileId, "507f1f77bcf86cd799439012"] });
  });

  it("locks the whole composer while a send is pending", async () => {
    let finish!: (sent: boolean) => void;
    const onSend = vi.fn().mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    const onBusyChange = vi.fn();
    render(<ChatInput onSend={onSend} isSending={false} onBusyChange={onBusyChange} />);
    typeMessage("One send only");
    send();
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Attach files" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Narrative mode" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
    await act(async () => finish(true));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("does not send when Enter confirms IME composition or inserts a new line", async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    render(<ChatInput onSend={onSend} isSending={false} />);
    typeMessage("A multilingual question");
    const input = screen.getByRole("textbox");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
  });

  it("keeps the message if the caller rejects instead of returning a result", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("Connection lost"));
    render(<ChatInput onSend={onSend} isSending={false} />);
    typeMessage("Do not lose this");
    send();
    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue("Do not lose this");
  });
});
