"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Send, X } from "lucide-react";
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
    <section className="feedback-panel panel" aria-label="Suggest an improvement">
      <div className="panel-heading">
        <button type="button" onClick={onBack} className="panel-back-button" aria-label="Back to menu">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="panel-kicker">LineWatch TO</p>
          <h2>Suggest an Improvement</h2>
        </div>
        <button type="button" onClick={onClose} className="panel-close-button" aria-label="Close feedback">
          <X size={18} />
        </button>
      </div>

      <div className="feedback-content">
        <label className="feedback-field">
          <span>What could LineWatch TO make clearer or easier to use?</span>
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
          <span className={remaining < 0 ? "feedback-count feedback-count-error" : "feedback-count"}>
            {remaining} characters remaining
          </span>
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
        {trimmedSupportUrl ? (
          <div className="feedback-support-card">
            <div>
              <strong>Support LineWatch TO</strong>
              <span>Help keep independent transit tooling maintained.</span>
            </div>
            <a href={trimmedSupportUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}
