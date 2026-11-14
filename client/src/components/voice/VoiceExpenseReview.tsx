import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/TextArea";
import type { IExtractedVoiceExpense } from "@/lib/api/voice";
import { VoiceBudgetImpact } from "./VoiceBudgetImpact";

export function VoiceExpenseReview({ note, expense, pending, error, onNoteChange, onPreview, onSave, onDiscard, onAudioFile }: {
  note: string;
  expense?: IExtractedVoiceExpense;
  pending: boolean;
  error: string | null;
  onNoteChange: (note: string) => void;
  onPreview: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onAudioFile: (file: File) => void;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-indigo-500/40 bg-card p-4" aria-label="Review voice expense">
      <div className="space-y-2">
        <Label htmlFor="voice-expense-note">Expense note</Label>
        <Textarea
          id="voice-expense-note"
          value={note}
          onChange={event => onNoteChange(event.target.value)}
          maxLength={4000}
          placeholder="मैंने चाय पर 50 रुपये खर्च किए।"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">Review the amount and category before saving. Edit the note to correct a transcription.</p>
        <Button type="button" size="sm" disabled={pending || Boolean(expense) || !note.trim()} onClick={onPreview}>Review expense</Button>
      </div>
      <div className="space-y-1">
        <Label htmlFor="voice-expense-audio">Upload an expense recording</Label>
        <input
          id="voice-expense-audio"
          type="file"
          accept="audio/*,.webm,.m4a"
          disabled={pending}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-secondary-foreground"
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) onAudioFile(file);
          }}
        />
        <p className="text-xs text-muted-foreground">Up to 30 seconds and 10 MB.</p>
      </div>
      {error && <p role="alert" className="text-sm text-red-800 dark:text-red-300">{error}</p>}
      {expense && (
        <div className="space-y-3" aria-live="polite">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold text-foreground">{new Intl.NumberFormat("en-IN", { style: "currency", currency: expense.currency }).format(expense.amount)}</dd></div>
            <div><dt className="text-muted-foreground">Category</dt><dd className="font-semibold text-foreground">{expense.category}</dd></div>
            <div><dt className="text-muted-foreground">Type</dt><dd className="capitalize text-foreground">{expense.type}</dd></div>
            <div><dt className="text-muted-foreground">Merchant</dt><dd className="text-foreground">{expense.merchantName}</dd></div>
          </dl>
          <VoiceBudgetImpact expense={expense} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={onSave}>Save to ledger</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={onDiscard}>Discard draft</Button>
          </div>
        </div>
      )}
    </section>
  );
}
