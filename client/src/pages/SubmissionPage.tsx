import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { GNANI_SUBMISSION_DEADLINE_LABEL, GNANI_SUBMISSION_FORM } from "@/lib/gnaniChallenge";

export default function SubmissionPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6" data-testid="submission-page">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">FinWise Bharat Voice demo</h1>
        <p className="text-muted-foreground">Review a spoken expense, check its budget impact, and ask follow-up questions in Finance Chat.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Try the demo</CardTitle>
          <CardDescription>Use a signed-in workspace with sample records.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-inside list-decimal space-y-2 text-sm text-foreground">
            <li>In Bharat Voice, upload a Hindi expense recording or enter the note.</li>
            <li>Review the amount, category, and budget impact before saving. Play the Timbre confirmation.</li>
            <li>In Finance Chat, ask a new question and open the workflow trace to see how it was answered.</li>
          </ol>
          <div className="flex flex-wrap gap-4 text-sm font-medium">
            <Link href="/voice" className="underline underline-offset-4">Open Bharat Voice</Link>
            <Link href="/chat" className="underline underline-offset-4">Open Finance Chat</Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit the demo</CardTitle>
          <CardDescription>Deadline {GNANI_SUBMISSION_DEADLINE_LABEL}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Publish the working demo on LinkedIn or X. Tag Gnani AI and use #GnaniAI and #GreatIndianAIInternshipChallenge.</p>
          <p>Include the video, project explanation, Gnani APIs demonstrated, each participant’s contribution, and one public post link per platform in the form.</p>
          <div className="flex flex-wrap gap-4 font-medium">
            <a href="https://www.gnani.ai/internship" className="underline underline-offset-4">Official rules</a>
            <a href={GNANI_SUBMISSION_FORM} className="underline underline-offset-4">Submission form</a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
