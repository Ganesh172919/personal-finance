/**
 * @fileoverview Dedicated Bharat Voice AI Page
 *
 * Full-page immersion cockpit for Indic Voice Financial Operations:
 * - Powered by Gnani AI Prisma v3.0 (STT), Timbre (TTS), and Evon 30B reasoning
 * - Supports 12+ Indic languages, code-mixed Hinglish, and 8kHz telephonic audio
 * - Built for The Great Indian AI Internship Challenge 2026 (Participant: J Ganesh Kumar Reddy)
 *
 * @module pages/BharatVoicePage
 */

import { Mic, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { PageIntro } from "@/components/layout/PageIntro";
import { useAuth } from "@/hooks/useAuth";
import { BharatVoiceAssistant } from "@/components/voice/BharatVoiceAssistant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function BharatVoicePage() {
  const { user, loading } = useAuth();

  return (
    <div className="page-grid flex-1 overflow-auto" data-testid="bharat-voice-page">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <PageIntro
          icon={Mic}
          eyebrow="Voice tools"
          title="Bharat Voice"
          description="Speak in Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, or Hinglish to log expenses and check your budget."
          actions={user ? (
            <Link href="/chat?voice=live" className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
              Open live voice chat
            </Link>
          ) : !loading && (
            <Link href="/login?next=%2Fvoice" className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
              Sign in to use voice tools
            </Link>
          )}
        />

        {/* Core Interactive Assistant Cockpit */}
        {user && <BharatVoiceAssistant />}

        {/* Telephonic & Noisy Market Benchmark Sandbox Info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-800 dark:text-indigo-400" />
              Telephonic audio processing
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs">
              Audio and transcript processing for noisy or low-bandwidth recordings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-muted-foreground">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="border-indigo-400 text-indigo-800 dark:text-indigo-300">8kHz Bandpass</Badge>
                </div>
                <p className="text-muted-foreground">
                  Filters audio to 300Hz–3400Hz telephone bandwidth, reproducing realistic 2G/telephony conditions before dispatching to Prisma v3.0.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="border-emerald-400 text-emerald-800 dark:text-emerald-300">Hinglish Tokenizer</Badge>
                </div>
                <p className="text-muted-foreground">
                  Phonetic token normalizer tuned for code-switched Indian English-Hindi phrases like &quot;Swiggy dinner&quot;, &quot;Kirana rashan&quot;, &quot;Paytm UPI&quot;.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-muted border border-border space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Badge variant="outline" className="border-amber-400 text-amber-800 dark:text-amber-300">Number Invariant</Badge>
                </div>
                <p className="text-muted-foreground">
                  FinWise parses rupee amounts as numbers and shows them for review before saving.
                </p>
              </div>
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
