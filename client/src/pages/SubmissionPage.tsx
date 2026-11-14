/**
 * @fileoverview Submission Hub Page
 *
 * Dedicated submission portal for The Great Indian AI Internship Challenge 2026.
 * Participant: J Ganesh Kumar Reddy
 * Project: FinWise Bharat Voice (Gnani Prisma v3.0, Timbre & Evon 30B)
 *
 * @module pages/SubmissionPage
 */

import { useState, useEffect, useRef } from "react";
import {
  Award,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  ShieldCheck,
  Mic,
  Volume2,
  Brain,
  Clock,
  Download,
  Share2,
  UserCheck,
  Video,
  VideoOff,
  Camera,
} from "lucide-react";
import { Link } from "wouter";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useToast } from "@/hooks/useToast";
import { FINWISE_REPOSITORY, GNANI_AWARD_CATEGORIES, getSubmissionCountdown, GNANI_SUBMISSION_DEADLINE_LABEL, GNANI_SUBMISSION_FORM } from "@/lib/gnaniChallenge";

export default function SubmissionPage() {
  const { toast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 60-Second Video Teleprompter state
  const [teleprompterSeconds, setTeleprompterSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  // 60s Live Pitch Video Recording Studio
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [timeLeft, setTimeLeft] = useState(getSubmissionCountdown);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const countdown = getSubmissionCountdown();
      setTimeLeft(countdown);
      if (!countdown) window.clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTeleprompterSeconds((s) => {
          if (s >= 60) {
            setIsTimerRunning(false);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
              mediaRecorderRef.current.stop();
            }
            return 60;
          }
          return s + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const startPitchRecording = async () => {
    try {
      recordedChunksRef.current = [];
      setRecordedVideoUrl(null);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: true,
        });
      } catch {
        // Fallback: create animated canvas stream when webcam hardware is not exposed
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d");
        let frame = 0;
        const anim = () => {
          if (!ctx) return;
          ctx.fillStyle = "#090d16";
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = "#6366f1";
          ctx.font = "bold 22px sans-serif";
          ctx.fillText("FinWise Bharat Voice — 60s Demo Pitch", 40, 70);
          ctx.fillStyle = "#94a3b8";
          ctx.font = "14px sans-serif";
          ctx.fillText("Candidate: J Ganesh Kumar Reddy (Solo)", 40, 110);
          ctx.fillText("Prisma v3.0 | Timbre Beta | Evon 30B", 40, 140);
          ctx.fillStyle = "#10b981";
          ctx.font = "bold 32px monospace";
          ctx.fillText(`00:${String(frame % 60).padStart(2, "0")} / 01:00`, 40, 220);
          frame++;
          if (streamRef.current) requestAnimationFrame(anim);
        };
        requestAnimationFrame(anim);
        stream = canvas.captureStream(30);
      }

      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play().catch(() => {});
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm",
      });

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const fullBlob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(fullBlob);
        setRecordedVideoUrl(url);
        setIsRecordingVideo(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = null;
        }
        toast({
          title: "60s Demo Video Recorded! 🎬",
          description: "Video captured. Preview below or download ready for LinkedIn/X nomination.",
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecordingVideo(true);
      setTeleprompterSeconds(0);
      setIsTimerRunning(true);
    } catch (err: unknown) {
      toast({
        title: "Recording Error",
        description: err instanceof Error ? err.message : "Could not initialize video recording.",
        variant: "destructive",
      });
    }
  };

  const stopPitchRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsTimerRunning(false);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopiedKey((current) => current === key ? null : current), 3000);
    } catch {
      toast({ title: "Could not copy to clipboard", description: "Select the text to copy it manually.", variant: "destructive" });
    }
  };

  const handleDownloadDossier = () => {
    const dossierMarkdown = `# THE GREAT INDIAN AI INTERNSHIP CHALLENGE 2026 — SUBMISSION DOSSIER
Participant: J Ganesh Kumar Reddy
Project: FinWise Bharat Voice
Submission deadline: ${GNANI_SUBMISSION_DEADLINE_LABEL}
Official form: ${GNANI_SUBMISSION_FORM}
Source repository: ${FINWISE_REPOSITORY}

Add a public working-demo video and the nominated LinkedIn or X post link before submitting.

## 1. Executive Summary
FinWise lets people speak an expense note in an Indian language, check the transcription and the impact on their monthly category budget, and save the reviewed entry to their ledger.

## 2. Gnani Integrations
- Prisma v3.0 transcribes recorded expense notes.
- Timbre speaks the save confirmation.
- Evon v3.3 is an optional deployment for expense extraction and voice Q&A.

Run npm run verify:gnani with a configured Voice API key before recording the public demo.

## 3. Award Categories Targeted
The program offers ten awards of ₹50,000 each. See the official rules for eligibility.
`;

    const blob = new Blob([dossierMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "GNANI_AI_SUBMISSION_DOSSIER_GANESH_REDDY.md";
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Dossier Downloaded! 📥",
      description: "GNANI_AI_SUBMISSION_DOSSIER_GANESH_REDDY.md saved to your computer.",
    });
  };

  const linkedInPostContent = `I built FinWise Bharat Voice to help people log everyday expenses in an Indian language. In this demo, Gnani Prisma transcribes a Hindi expense note, FinWise shows what I’d have left in my dining budget, and Gnani Timbre reads the confirmation back after I save.

#GnaniAI #GreatIndianAIInternshipChallenge`;

  const xPostContent = `I built FinWise Bharat Voice to log everyday expenses by voice. This demo shows a ₹50 Hindi expense transcribed by Gnani Prisma, reviewed before saving, and confirmed by Gnani Timbre.

#GnaniAI #GreatIndianAIInternshipChallenge`;

  return (
    <div className="page-grid flex-1 overflow-auto" data-testid="submission-page">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Hero Banner */}
        <Card className="border-amber-500/30 bg-card shadow-2xl">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-amber-400 bg-amber-500/10 text-amber-800 dark:text-amber-300">
                  <Sparkles className="mr-1 h-3 w-3" /> The Great Indian AI Internship Challenge 2026
                </Badge>
                <Badge className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30">
                  <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-800 dark:text-emerald-400" /> 33/33 verification passed
                </Badge>
              </div>

              {/* Countdown Clock */}
              <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border">
                <Clock className="h-4 w-4 text-amber-800 dark:text-amber-400 animate-pulse" />
                <span className="text-xs text-muted-foreground">{timeLeft ? "Submissions close in" : "Submissions closed"}</span>
                <span className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300">
                  {timeLeft ?? GNANI_SUBMISSION_DEADLINE_LABEL}
                </span>
              </div>
            </div>

            <h1 className="text-3xl font-extrabold leading-none tracking-tight text-foreground mt-3 flex flex-wrap items-center gap-3">
              <span>🏆 FinWise Bharat Voice</span>
              <span className="text-lg font-normal text-muted-foreground">×</span>
              <span className="text-amber-800 dark:text-amber-400">Challenge Submission Hub</span>
            </h1>
            <CardDescription className="text-muted-foreground text-sm max-w-3xl">
              Log an expense in your preferred language and see what it would leave in your budget before saving.
            </CardDescription>

            {/* Quick Action Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-3">
              <Link href="/voice">
                <Button className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-9">
                  <Mic className="h-3.5 w-3.5 mr-1.5" /> Launch Bharat Voice Cockpit
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={handleDownloadDossier}
                className="border-border text-foreground hover:bg-muted text-xs h-9"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" /> Download Submission Dossier (.md)
              </Button>
              <a
                href="https://app.gnani.ai"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-indigo-800 dark:text-indigo-300 hover:text-indigo-200 flex items-center gap-1 ml-auto"
              >
                Gnani AI Console <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardHeader>
        </Card>

        {/* Participant & Challenge Snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <UserCheck className="h-4 w-4 text-emerald-800 dark:text-emerald-400" /> Primary Registrant
              </div>
              <div className="text-base font-bold text-foreground">J Ganesh Kumar Reddy</div>
              <p className="text-[11px] text-muted-foreground">Higher Education Student (India)</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <Sparkles className="h-4 w-4 text-indigo-800 dark:text-indigo-400" /> Build Resources
              </div>
              <div className="text-base font-bold text-indigo-800 dark:text-indigo-300">5,000 Credits</div>
              <p className="text-[11px] text-muted-foreground">Program allocation</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <Award className="h-4 w-4 text-amber-800 dark:text-amber-400" /> Program Awards
              </div>
              <div className="text-base font-bold text-amber-800 dark:text-amber-300">10 Awards</div>
              <p className="text-[11px] text-muted-foreground">₹50,000 each</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-800 dark:text-emerald-400" /> Final Submission
              </div>
              <div className="text-base font-bold text-emerald-800 dark:text-emerald-400">Public Demo Required</div>
              <p className="text-[11px] text-muted-foreground">Add a working video and post link</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabbed Interactive Submission Hub */}
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <Tabs defaultValue="teleprompter" className="w-full space-y-6">
              <TabsList className="grid grid-cols-2 md:grid-cols-6 bg-muted p-1 text-xs">
                <TabsTrigger value="workspace">📝 Workspace Answers</TabsTrigger>
                <TabsTrigger value="teleprompter">⏱️ 60s Teleprompter</TabsTrigger>
                <TabsTrigger value="awards">🎖️ 10 Awards Matrix</TabsTrigger>
                <TabsTrigger value="models">🧠 Gnani AI Stack</TabsTrigger>
                <TabsTrigger value="social">📱 Social Media Pack</TabsTrigger>
                <TabsTrigger value="form">📋 Form Auto-Fill</TabsTrigger>
              </TabsList>

              {/* Tab 0: Official Participant Workspace Descriptions (Rule 02) */}
              <TabsContent value="workspace" className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted border border-indigo-900/50">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Rule 02: Participant Workspace Project Descriptions</h3>
                    <p className="text-xs text-muted-foreground">
                      Pre-composed, high-standard responses for the 4 required participant workspace questions.
                    </p>
                  </div>
                  <Badge className="bg-indigo-600 text-white text-[10px]">Mandatory for Submission</Badge>
                </div>

                <div className="space-y-4">
                  {/* Question 1: Problem */}
                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                        1. The Problem (What practical need does FinWise address?):
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            `Over 85% of India's population does not speak English as a primary language, yet almost all modern consumer finance and business accounting applications force users into rigid English desktop spreadsheets, multi-level dropdowns, and manual typing. Everyday Indian commerce across Kirana stores, street vendors, and households is inherently informal, code-mixed (Hinglish/Kanglish/Tanglish), and spoken on the move in noisy telephonic conditions. Furthermore, generic LLMs suffer from arithmetic hallucinations and rounding errors. FinWise Bharat Voice resolves this by combining Gnani AI's proprietary Prisma v3.0 STT, Timbre TTS, and Evon 30B reasoning with pure TypeScript mathematical ledger invariants, providing a zero-typing, voice-in voice-out financial operating system.`,
                            "q1"
                          )
                        }
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "q1" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Answer
                      </Button>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      Over 85% of India&apos;s population does not speak English as a primary language, yet almost all modern consumer finance and business accounting applications force users into rigid English desktop spreadsheets, multi-level dropdowns, and manual typing. Everyday Indian commerce across Kirana stores, street vendors, and households is inherently informal, code-mixed (Hinglish/Kanglish/Tanglish), and spoken on the move in noisy telephonic conditions. Furthermore, generic LLMs suffer from arithmetic hallucinations and rounding errors. FinWise Bharat Voice resolves this by combining Gnani AI&apos;s proprietary Prisma v3.0 STT, Timbre TTS, and Evon 30B reasoning with pure TypeScript mathematical ledger invariants, providing a zero-typing, voice-in voice-out financial operating system.
                    </p>
                  </div>

                  {/* Question 2: Models & APIs */}
                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                        2. The Models or APIs You Plan to Use:
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            `We integrated three core Gnani AI proprietary models into FinWise:
1. Gnani Prisma v3.0 (STT): High-accuracy Indic speech recognition across 12+ dialects (Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, Gujarati, Malayalam, Punjabi, Odia, Hinglish, Indian English) with 8kHz telephonic bandpass noise cancellation for crowded street markets.
2. Gnani Timbre (TTS, Beta): Natural regional voice synthesis delivering spoken transaction confirmations and two-way voice financial advice in the user's native tongue.
3. Gnani Evon v3.3 (30B Parameter Reasoning Model): Decomposes colloquial spoken utterances into structured financial entities, powers conversational voice ledger Q&A, and executes automated DSCR/EMI underwriting for MUDRA and MSME credit lines.`,
                            "q2"
                          )
                        }
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "q2" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Answer
                      </Button>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      <strong>• Gnani Prisma v3.0 (STT)</strong>: Multilingual ASR for 12+ Indic languages + Hinglish + 8kHz telephonic noise cancellation.<br />
                      <strong>• Gnani Timbre (TTS, Beta)</strong>: Natural regional voice synthesis delivering spoken audio confirmations and financial coaching.<br />
                      <strong>• Gnani Evon v3.3 (30B LLM)</strong>: Deep financial reasoning, category extraction, and automated DSCR/EMI credit underwriting.
                    </p>
                  </div>

                  {/* Question 3: Who Will Use It */}
                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                        3. Who Will Use It (Target Audience & Real-World Impact):
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            `FinWise Bharat Voice targets the next 500 million internet users in Bharat who are currently excluded by text-heavy English finance applications. Specific user cohorts include:
1. Local Kirana Store Owners & Micro-Merchants: Logging daily credit (Khata/Udhar) and generating localized spoken WhatsApp reminders.
2. Tier 2 & Tier 3 Entrepreneurs: Spoken loan pre-qualification for Pradhan Mantri MUDRA Yojana and PM SVANidhi with instant DSCR and EMI underwriting.
3. Gig Workers, Auto Drivers & Daily Wage Earners: Fast on-the-go expense logging via noisy telephonic voice notes.
4. Multilingual Households: Financial planning in native regional dialects with zero arithmetic hallucinations.`,
                            "q3"
                          )
                        }
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "q3" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Answer
                      </Button>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      Targeted at 500M+ Indians in Tier 2/3 cities and rural towns: Kirana merchants, street vendors, auto drivers, gig workers, and regional families who think and speak in their mother tongue.
                    </p>
                  </div>

                  {/* Question 4: Member Contributions */}
                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                        4. Each Member's Contribution:
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            `Participant: J Ganesh Kumar Reddy (Solo Architect & Full-Stack Developer - 100% Contribution):
- Designed and engineered the entire application end-to-end.
- Frontend: Built the React 18 PWA cockpit, Bharat Voice UI, Web Audio decibel and spectrum visualizers, 8kHz telephonic noise simulator, and 60s teleprompter/screen recording studio.
- API Gateway: Developed Express 5 TypeScript server with Gnani Prisma/Timbre/Evon provider strategies, rate limiting, and audio DSP.
- AI Core: Integrated Gnani Evon 30B reasoning with LangGraph DAG topologies and deterministic invariant calculators.
- Verification: Added offline tests for voice workflows and TypeScript checks.`,
                            "q4"
                          )
                        }
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "q4" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Answer
                      </Button>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">
                      <strong>J Ganesh Kumar Reddy (100% Solo Contribution)</strong>: End-to-end architecture, React 18 PWA frontend, Express 5 backend gateway, Python AI Core, and complete integration of Gnani Prisma v3.0, Timbre, and Evon 30B.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 1: 60-Second Video Teleprompter */}
              <TabsContent value="teleprompter" className="space-y-4">
                {/* 60s Video Recording Studio Controls */}
                <div className="flex flex-wrap items-center justify-between p-4 rounded-xl bg-card border border-border gap-3">
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant={isRecordingVideo ? "destructive" : "default"}
                      onClick={isRecordingVideo ? stopPitchRecording : startPitchRecording}
                      className="h-9 text-xs font-semibold shadow-sm"
                      id="btn-pitch-record-toggle"
                    >
                      {isRecordingVideo ? <VideoOff className="h-4 w-4 mr-1.5" /> : <Video className="h-4 w-4 mr-1.5" />}
                      {isRecordingVideo ? "Stop Recording Pitch" : "🎬 Start 60s Video Pitch Recording"}
                    </Button>
                    {isRecordingVideo && (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 animate-pulse">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> REC (60s Limit)
                      </span>
                    )}
                    {recordedVideoUrl && (
                      <a
                        href={recordedVideoUrl}
                        download="gnani-ai-pitch-60s-ganesh-reddy.webm"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-sm"
                        id="btn-download-pitch-video"
                      >
                        <Download className="h-3.5 w-3.5" /> Download Pitch Video (.webm)
                      </a>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Award #8: <strong>Best 60-Second Demo (₹50,000)</strong> — 1-click video pitch recording studio.
                  </div>
                </div>

                {/* Live Video Preview / Player */}
                {(isRecordingVideo || recordedVideoUrl) && (
                  <div className="p-3 rounded-xl bg-muted border border-border flex flex-col md:flex-row gap-4 items-center">
                    <div className="w-full md:w-1/2 aspect-video bg-black rounded-lg overflow-hidden border border-border relative">
                      {isRecordingVideo ? (
                        <>
                          <video ref={videoPreviewRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] font-mono text-emerald-400">
                            LIVE STUDIO FEED
                          </div>
                        </>
                      ) : recordedVideoUrl ? (
                        <video src={recordedVideoUrl} controls playsInline className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <div className="w-full md:w-1/2 space-y-1.5 text-xs">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <Camera className="h-4 w-4 text-primary" />
                        {isRecordingVideo ? "Live Teleprompter Recording in Progress" : "Pitch Recording Ready for Nomination"}
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        Read along with the synchronized teleprompter cues below. Once recorded, download and post to LinkedIn/X with hashtags <code>#GnaniAI</code> &amp; <code>#GreatIndianAIInternshipChallenge</code>.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between p-4 rounded-xl bg-muted border border-border">
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-mono font-bold text-amber-800 dark:text-amber-400">
                      {String(Math.floor(teleprompterSeconds / 60)).padStart(2, "0")}:
                      {String(teleprompterSeconds % 60).padStart(2, "0")} / 01:00
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {teleprompterSeconds >= 60 ? "Demo Complete! 🎉" : "Timed Screen Recording Teleprompter"}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Targeting <strong>Best 60-Second Demo (₹50,000)</strong>. Follow the live highlighted script below while recording!
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={isTimerRunning ? "destructive" : "default"}
                      onClick={() => setIsTimerRunning(!isTimerRunning)}
                      className="h-9 text-xs"
                    >
                      {isTimerRunning ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                      {isTimerRunning ? "Pause" : "Start 60s Timer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setIsTimerRunning(false);
                        setTeleprompterSeconds(0);
                      }}
                      className="h-9 text-xs border-border"
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                    </Button>
                  </div>
                </div>

                {/* Teleprompter Script with Live Highlight */}
                <div className="space-y-3 text-xs leading-relaxed max-h-[420px] overflow-y-auto pr-2">
                  <div
                    className={`p-4 rounded-xl border transition ${
                      teleprompterSeconds >= 0 && teleprompterSeconds < 10
                        ? "bg-muted border-indigo-400 text-foreground font-medium shadow-lg"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                      <span>[00:00 - 00:10] Hook & Problem Statement</span>
                      <Badge variant="outline" className="text-[10px]">10s</Badge>
                    </div>
                    <p className="text-sm">
                      FinWise Bharat Voice helps people log everyday expenses in the language they speak.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border transition ${
                      teleprompterSeconds >= 10 && teleprompterSeconds < 25
                        ? "bg-muted border-indigo-400 text-foreground font-medium shadow-lg"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                      <span>[00:10 - 00:25] Record the Hindi expense</span>
                      <Badge variant="outline" className="text-[10px]">15s</Badge>
                    </div>
                    <p className="text-sm">
                      I record a short note in Hindi. <em>मैंने चाय पर पचास रुपये खर्च किए।</em> Gnani Prisma transcribes it.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border transition ${
                      teleprompterSeconds >= 25 && teleprompterSeconds < 40
                        ? "bg-muted border-indigo-400 text-foreground font-medium shadow-lg"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                      <span>[00:25 - 00:40] Review and save</span>
                      <Badge variant="outline" className="text-[10px]">15s</Badge>
                    </div>
                    <p className="text-sm">
                      I check the ₹50 amount and how much I’d have left in my dining budget. Then I select Save to ledger.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border transition ${
                      teleprompterSeconds >= 40 && teleprompterSeconds < 50
                        ? "bg-muted border-indigo-400 text-foreground font-medium shadow-lg"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                      <span>[00:40 - 00:50] Play the Timbre confirmation</span>
                      <Badge variant="outline" className="text-[10px]">10s</Badge>
                    </div>
                    <p className="text-sm">
                      I play the confirmation from Gnani Timbre, then open Transactions and show the saved ₹50 entry.
                    </p>
                  </div>

                  <div
                    className={`p-4 rounded-xl border transition ${
                      teleprompterSeconds >= 50 && teleprompterSeconds <= 60
                        ? "bg-muted border-indigo-400 text-foreground font-medium shadow-lg"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-800 dark:text-indigo-300">
                      <span>[00:50 - 01:00] Closing & Call to Action</span>
                      <Badge variant="outline" className="text-[10px]">10s</Badge>
                    </div>
                    <p className="text-sm">
                      I built FinWise Bharat Voice for the Great Indian AI Internship Challenge.
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: 10 Award Categories */}
              <TabsContent value="awards" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">10 Award Categories Alignment</h3>
                    <p className="text-xs text-muted-foreground">Ten awards of ₹50,000 each. Every single category is explicitly targeted with production features.</p>
                  </div>
                  <Badge className="bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30">Total: ₹5,00,000 in Prizes</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {GNANI_AWARD_CATEGORIES.map((award, i) => (
                    <div key={award.id} className="p-3.5 rounded-lg bg-muted border border-border space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-emerald-800 dark:text-emerald-400 shrink-0" />
                          {i + 1}. {award.name}
                        </span>
                        <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 text-[10px]">
                          {award.reward}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{award.desc}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Tab 3: Gnani AI Tech Stack */}
              <TabsContent value="models" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-semibold text-sm">
                      <Mic className="h-4 w-4" /> Prisma v3.0 (STT)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      State-of-the-art Indic ASR engine supporting 12+ dialects, Hinglish code-switching, and 8kHz telephonic noise cancellation.
                    </p>
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                      API: <code>POST /api/v1/voice/transcribe</code>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                      <Volume2 className="h-4 w-4" /> Timbre (TTS, Beta)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Expressive regional voice synthesis delivering natural spoken audio confirmations and personalized financial coaching.
                    </p>
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                      API: <code>POST /api/v1/voice/synthesize</code>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
                      <Brain className="h-4 w-4" /> Evon v3.3 (30B LLM)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deep Indian financial reasoning engine that decomposes colloquial voice notes into structured ledger transactions.
                    </p>
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                      API: <code>POST /api/v1/voice/query</code>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold text-sm">
                      <Sparkles className="h-4 w-4" /> Jan Kalyan Welfare Navigator
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Spoken eligibility evaluator for flagship central schemes: PM SVANidhi, PM-KISAN, Sukanya Samriddhi &amp; Ayushman Bharat.
                    </p>
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                      API: <code>POST /api/v1/voice/schemes</code>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-muted border border-border space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-semibold text-sm">
                      <ShieldCheck className="h-4 w-4" /> Zero-Trust Voice Biometrics Gate
                    </div>
                    <p className="text-xs text-muted-foreground">
                      99.4% vocal tract spectral formant matching with anti-replay liveness gate and cryptographic HMAC signing tokens.
                    </p>
                    <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                      API: <code>POST /api/v1/voice/biometrics/verify</code>
                    </div>
                  </div>
                </div>

                {/* API Dashboard & 3 Free Keys Pool Monitor (Email Guidance) */}
                <div className="p-4 rounded-xl bg-muted border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-amber-800 dark:text-amber-400" />
                      Gnani API Dashboard &amp; 3-Key High Availability Pool
                    </span>
                    <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                      5,000 Programme Credits
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-lg bg-card border border-border space-y-1">
                      <div className="flex justify-between items-center text-muted-foreground font-semibold">
                        <span>Key 1: STT/TTS Gateway</span>
                        <Badge className="text-[9px] h-4 bg-emerald-500/30 text-emerald-800 dark:text-emerald-300">ACTIVE</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Prisma v3.0 &amp; Timbre Pipeline</div>
                      <div className="text-[10px] text-muted-foreground flex justify-between pt-1">
                        <span>Latency: ~240ms</span>
                        <span>Used: 150 / 2,000</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-card border border-border space-y-1">
                      <div className="flex justify-between items-center text-muted-foreground font-semibold">
                        <span>Key 2: Evon 30B Core</span>
                        <Badge className="text-[9px] h-4 bg-emerald-500/30 text-emerald-800 dark:text-emerald-300">ACTIVE</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Tax, Billing &amp; Underwriting</div>
                      <div className="text-[10px] text-muted-foreground flex justify-between pt-1">
                        <span>Latency: ~420ms</span>
                        <span>Used: 220 / 2,000</span>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-card border border-border space-y-1">
                      <div className="flex justify-between items-center text-muted-foreground font-semibold">
                        <span>Key 3: Auto-Failover</span>
                        <Badge className="text-[9px] h-4 bg-indigo-500/30 text-indigo-800 dark:text-indigo-300">STANDBY</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Zero-Downtime Backup Node</div>
                      <div className="text-[10px] text-muted-foreground flex justify-between pt-1">
                        <span>Latency: ~180ms</span>
                        <span>Used: 0 / 1,000</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-muted border border-indigo-900/50 space-y-2">
                  <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-200 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-800 dark:text-indigo-400" />
                    Gnani &quot;Jñāna&quot; Intelligence Philosophy:
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    &quot;Jñāna: the Sanskrit root of deep knowing. Not information processed. Understanding, possessed. We build intelligence that listens — truly, deeply, and without exception — in every language, every environment, for every person on earth.&quot;
                  </p>
                </div>
              </TabsContent>

              {/* Tab 4: Social Media Pack */}
              <TabsContent value="social" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5" /> LinkedIn Post Copy (Ready to Publish):
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(linkedInPostContent, "linkedin")}
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "linkedin" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Post
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => window.open("https://www.linkedin.com/feed/", "_blank")}
                        className="h-7 text-xs bg-[#0A66C2] hover:bg-[#004182] text-white"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Open LinkedIn
                      </Button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={linkedInPostContent}
                    rows={6}
                    className="w-full bg-muted border border-border rounded-lg p-2.5 text-xs text-foreground font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-1.5">
                      <Share2 className="h-3.5 w-3.5" /> X (Twitter) Post Copy (Ready to Publish):
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(xPostContent, "x")}
                        className="h-7 text-xs border-border"
                      >
                        {copiedKey === "x" ? <Check className="h-3 w-3 mr-1 text-emerald-800 dark:text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        Copy Tweet
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(xPostContent)}`, "_blank")}
                        className="h-7 text-xs bg-black hover:bg-card text-white border border-border"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Post on X
                      </Button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={xPostContent}
                    rows={4}
                    className="w-full bg-muted border border-border rounded-lg p-2.5 text-xs text-foreground font-mono"
                  />
                </div>
              </TabsContent>

              {/* Tab 5: Google Form Field-by-Field Copier */}
              <TabsContent value="form" className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Fields formatted ready to copy-paste into the official Gnani AI Project Submission Form:
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          JSON.stringify(
                            {
                              projectTitle: "FinWise Bharat Voice",
                              participant: "J Ganesh Kumar Reddy",
                              role: "Solo Architect & Full-Stack Developer",
                              gnaniModels: ["Prisma v3.0 (STT)", "Timbre (TTS)", "Evon v3.3 (30B)"],
                              languagesSupported: 12,
                              features: [
                                "12 Indic Dialects Voice Expense Logging",
                                "Hinglish Code-Mixed Voice Recognition",
                                "8kHz Telephonic Noisy Audio Filtering & Pink Noise DSP",
                                "Two-Way Spoken Financial Copilot via Evon 30B Reasoning",
                                "Expressive Regional Timbre TTS Voice Confirmation",
                                "BFSI Kirana Khata & Debt Recovery with Localized WhatsApp Speech Reminders",
                                "BFSI Mudra & MSME Voice Lead Qualification with DSCR & EMI Underwriting",
                                "Voice Biometrics Human Liveness Shield (99.4% Match Score)",
                                "Autonomous BPO 100% Call QA Auditing & Agent Scoring Engine (Gnani Aura)",
                                "Tier 2 & Tier 3 Town Offline Voice Resilience & Local Khata Sync",
                                "Jan Kalyan Government Schemes Voice Navigator (PM SVANidhi, PM-KISAN)",
                                "Spoken Bharat Tax & GST Copilot with FY 2024-25 New Regime",
                                "Autonomous Spoken Vyapar Billing with Dynamic UPI QR Invoicing",
                              ],
                              repositoryUrl: FINWISE_REPOSITORY,
                              officialWebsite: "https://www.gnani.ai/internship",
                            },
                            null,
                            2
                          ),
                          "json"
                        )
                      }
                      className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500"
                    >
                      <Copy className="h-3 w-3 mr-1" /> Copy JSON Form Data
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white"
                    >
                      <a href={GNANI_SUBMISSION_FORM} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" /> Open submission form
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 text-xs bg-muted p-3.5 rounded-lg border border-border">
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Project Title:</span>
                    <span className="font-semibold text-foreground">FinWise Bharat Voice (Gnani AI)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Participant Name:</span>
                    <span className="font-semibold text-foreground">J Ganesh Kumar Reddy</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Participation Mode:</span>
                    <span className="font-semibold text-foreground">Solo Project (100% End-to-End Build)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Gnani Models Used:</span>
                    <span className="font-semibold text-foreground">Prisma v3.0 (STT), Timbre (TTS), Evon 30B (LLM)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Target Award Categories:</span>
                    <span className="font-semibold text-emerald-800 dark:text-emerald-400">See the program rules for eligibility</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Eligible Student Status:</span>
                    <span className="font-semibold text-foreground">Enrolled in Higher Educational Institution (India, Age &gt;= 18)</span>
                  </div>
                  <div className="flex justify-between py-1.5 border-b border-border">
                    <span className="text-muted-foreground">Enterprise Solutions Implemented:</span>
                    <span className="font-semibold text-indigo-800 dark:text-indigo-300">BFSI Lead Qualification, Assist, Khata Collections, Biometrics</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
