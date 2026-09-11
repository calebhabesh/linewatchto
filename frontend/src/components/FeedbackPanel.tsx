"use client";

import { useMemo, useState } from "react";
import { Send, MessageSquareText } from "lucide-react";
import { PanelHeader } from "./PanelHeader";
import { lineWatchAppVersionLabel } from "../app/app-build";
import {
  FeedbackRequestError,
  MAX_FEEDBACK_MESSAGE_LENGTH,
  buildFeedbackMailtoUrl,
  submitFeedback,
  type SubmitFeedbackInput,
} from "../app/feedback-data";

type Props = {
  dataSource: string;
  supportUrl: string;
  onBack: () => void;
  onClose: () => void;
};

export function FeedbackPanel({ dataSource, supportUrl, onBack, onClose }: Props) {
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo<SubmitFeedbackInput>(() => ({
    message,
    pageUrl: typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}` || "/",
    appVersion: lineWatchAppVersionLabel,
    dataSource,
    viewport: typeof window === "undefined" ? "unknown" : `${window.innerWidth}x${window.innerHeight}`,
    website,
  }), [dataSource, message, website]);

  const remaining = MAX_FEEDBACK_MESSAGE_LENGTH - message.length;
  const canSubmit = message.trim().length > 0 && message.length <= MAX_FEEDBACK_MESSAGE_LENGTH && !busy;
  const mailtoUrl = buildFeedbackMailtoUrl(context);
  const trimmedSupportUrl = supportUrl.trim();

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError(message.trim().length === 0 ? "Enter a suggestion before sending feedback." : `Feedback must be ${MAX_FEEDBACK_MESSAGE_LENGTH} characters or less.`);
      setStatus(null);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await submitFeedback(context);
      setStatus(response.message);
      setMessage("");
    } catch (submitError) {
      if (submitError instanceof FeedbackRequestError) {
        setError(submitError.message);
      } else {
        setError("Feedback could not be sent.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="feedback-panel panel" aria-label="Leave feedback">
      <PanelHeader
        title="Leave Feedback"
        icon={<MessageSquareText className="w-5 h-5 text-blue-500 shrink-0" aria-hidden="true" />}
        onBack={onBack}
        backLabel="Back to menu"
        onClose={onClose}
        closeLabel="Close feedback"
      />

      <div className="feedback-content">
        <label className="feedback-field">
          <span>What could LineWatchTO make clearer or easier to use?</span>
          <div className="feedback-textarea-container">
            <textarea
              className="feedback-textarea"
              value={message}
              maxLength={MAX_FEEDBACK_MESSAGE_LENGTH}
              onChange={(event) => {
                setMessage(event.target.value);
                setError(null);
                setStatus(null);
              }}
              rows={7}
            />
            <span className={remaining < 0 ? "feedback-count feedback-count-error" : "feedback-count"}>
              {remaining} characters remaining
            </span>
          </div>
        </label>
        <label className="feedback-honeypot" aria-hidden="true">
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
        <div className="feedback-actions">
          {trimmedSupportUrl ? (
            <div className="feedback-support-card feedback-support-inline">
              <span className="feedback-support-prompt">Enjoy the App?</span>
              <a href={trimmedSupportUrl} target="_blank" rel="noreferrer" className="feedback-support-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="support-mug-icon" aria-hidden="true">
                  <path d="M17 5.5h1a4 4 0 1 1 0 8h-1" />
                  <path d="M3 5.5h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
                  <path
                    d="M10 13.5l-.35-.32C8.35 12.1 7.4 11.3 7.4 10.3c0-.8.6-1.4 1.4-1.4.45 0 .9.2 1.2.55.3-.35.75-.55 1.2-.55.8 0 1.4.6 1.4 1.4 0 1.0-.95 1.8-2.25 2.88l-.35.32z"
                    fill="#ff5f5f"
                    stroke="none"
                  />
                </svg>
                Support LineWatchTO
              </a>
            </div>
          ) : null}
          <button type="button" className="account-primary-button feedback-submit-button" disabled={!canSubmit} onClick={handleSubmit}>
            <Send size={16} />
            {busy ? "Sending" : "Send Feedback"}
          </button>
        </div>
        {status ? <p className="feedback-status" role="status">{status}</p> : null}
        {error ? (
          <p className="feedback-error" role="alert">
            {error} <a href={mailtoUrl}>Open Email App</a>
          </p>
        ) : null}
        {/* Help keep independent transit tooling maintained. Support LineWatchTO */}
      </div>
    </section>
  );
}
