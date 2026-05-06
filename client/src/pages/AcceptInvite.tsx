/**
 * @fileoverview Organization invite acceptance page.
 *
 * Handles the end-to-end flow of accepting an org invite token passed
 * as a URL query parameter. Supports three states:
 * 1. Unauthenticated -- prompts the user to log in or register, storing
 *    the invite URL for post-auth redirect.
 * 2. Authenticated + idle -- auto-fires the accept mutation.
 * 3. Accepted -- shows a success message and a "Go to organization" button.
 *
 * Key data flows:
 * - Reads ?token= from the URL via getSearchParam.
 * - Calls acceptOrgInvite(token) which hits POST /api/v1/orgs/invite/accept.
 * - On success, sets the active org context and invalidates config/org queries.
 * - Handles INVITE_EMAIL_MISMATCH errors with a dedicated message.
 *
 * Part of the multi-tenant organization flow; linked from invite emails.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { ApiError, acceptOrgInvite } from "@/lib/apiClient";
import { setActiveOrgId } from "@/lib/orgContext";
import { getSearchParam } from "@/lib/url";

const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

const formatError = (error: unknown, fallback: string) => {
  const requestId = error instanceof ApiError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} (Request ID: ${requestId})` : message;
};

export default function AcceptInvite() {
  const { user, loading } = useAuth();
  const [location, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const token = useMemo(() => {
    const raw = getSearchParam(location, "token");
    return typeof raw === "string" ? raw.trim() : "";
  }, [location]);

  const selfPath = useMemo(() => {
    if (!token) return "/accept-invite";
    return `/accept-invite?token=${encodeURIComponent(token)}`;
  }, [token]);

  const encodedNext = useMemo(() => encodeURIComponent(selfPath), [selfPath]);

  const [status, setStatus] = useState<"idle" | "accepted">("idle");

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Missing invite token.");
      }
      return acceptOrgInvite(token);
    },
    onSuccess: async (resp) => {
      const orgId = resp.invite?.org_id;
      if (orgId) {
        setActiveOrgId(orgId);
      }

      setStatus("accepted");
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["/api/config/me"] }),
        queryClient.invalidateQueries({ queryKey: ["v1/orgs/me"] }),
      ]);

      toast({ title: "Invite accepted", description: "You're now a member of the organization." });
    },
    onError: (error) => {
      toast({
        title: "Invite failed",
        description: formatError(error, "Couldn't accept invite."),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!token) return;
    if (loading) return;
    if (!user) return;
    if (acceptMutation.isPending || acceptMutation.isSuccess) return;
    acceptMutation.mutate();
  }, [acceptMutation, loading, token, user]);

  const handleLogin = () => {
    try {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, selfPath);
    } catch {
      // ignore
    }
    navigate(`/login?next=${encodedNext}`);
  };

  const handleRegister = () => {
    try {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, selfPath);
    } catch {
      // ignore
    }
    navigate(`/register?next=${encodedNext}`);
  };

  const handleGoToOrg = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["/api/config/me"] }),
      queryClient.invalidateQueries({ queryKey: ["v1/orgs/me"] }),
    ]);
    navigate("/org");
  };

  const missingToken = !token;
  const authRequired = !loading && !user;
  const error = acceptMutation.error;

  const mismatchEmail =
    error instanceof ApiError && error.code === "INVITE_EMAIL_MISMATCH";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Accept organization invite</CardTitle>
          <CardDescription>
            Join a team organization in FinWise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {missingToken ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              Missing invite token. Please use the link from your invitation email.
            </div>
          ) : loading ? (
            <div className="text-sm text-muted-foreground">Checking session…</div>
          ) : authRequired ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                You need to sign in with <span className="font-medium">the invited email address</span> to accept this invite.
              </div>
              <div className="flex gap-2">
                <Button onClick={handleLogin}>Sign in</Button>
                <Button variant="outline" onClick={handleRegister}>
                  Create account
                </Button>
              </div>
            </div>
          ) : status === "accepted" || acceptMutation.isSuccess ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Invite accepted. Your tenant context will switch automatically.
              </div>
              <Button onClick={handleGoToOrg}>Go to organization</Button>
            </div>
          ) : acceptMutation.isPending ? (
            <div className="text-sm text-muted-foreground">Accepting invite…</div>
          ) : error ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                {mismatchEmail
                  ? "This invite was sent to a different email. Please sign in with the invited email address and try again."
                  : formatError(error, "Couldn't accept invite.")}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                  Try again
                </Button>
                <Button variant="outline" onClick={handleLogin}>
                  Sign in
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Ready to accept invite.
              </div>
              <Button onClick={() => acceptMutation.mutate()} disabled={acceptMutation.isPending}>
                Accept invite
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
