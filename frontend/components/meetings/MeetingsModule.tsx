"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Card, EmptyState, RelativeTime } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useProjects } from "@/lib/projects-store";
import type { DeviceInfo, Meeting, MeetingSummary, Project } from "@/lib/types";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s < 10 ? "0" : ""}${s}s`;
}

export function MeetingsModule({ project }: { project: Project }) {
  const { reload } = useProjects();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [unassignedMeetings, setUnassignedMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [activeTitle, setActiveTitle] = useState("");
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [meetingTitleInput, setMeetingTitleInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Transcript viewer modal
  const [viewingMeeting, setViewingMeeting] = useState<Meeting | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    api.aiStatus().then((s) => setAiEnabled(s.enabled)).catch(() => setAiEnabled(false));
  }, []);

  const summarize = async (meeting: Meeting) => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const summary: MeetingSummary = await api.summarizeMeeting(meeting.id);
      const updated = { ...meeting, summary };
      setViewingMeeting(updated);
      setMeetings((list) => list.map((m) => (m.id === meeting.id ? updated : m)));
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Could not summarize this meeting.");
    } finally {
      setSummarizing(false);
    }
  };

  // Attaching modal
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projMeetings, unassigned, devList] = await Promise.all([
        api.listProjectMeetings(project.id),
        api.listUnassignedMeetings().catch(() => [] as Meeting[]),
        api.listDevices().catch(() => ({ inputs: [], defaultInput: 0 })),
      ]);
      setMeetings(projMeetings);
      setUnassignedMeetings(unassigned);
      setDevices(devList.inputs);
      if (devList.inputs.length > 0 && !selectedMic) {
        setSelectedMic(String(devList.defaultInput ?? devList.inputs[0].index));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load meetings.");
    } finally {
      setLoading(false);
    }
  }, [project.id, selectedMic]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Poll recording status every 2 seconds
  useEffect(() => {
    let timer: NodeJS.Timeout;
    const checkStatus = async () => {
      try {
        const status = await api.getMeetingStatus();
        setIsRecording(status.recording);
        if (status.recording && status.title) {
          setActiveTitle(status.title);
        }
      } catch {
        // ignore polling errors
      }
    };

    void checkStatus();
    timer = setInterval(() => {
      void checkStatus();
    }, 2000);

    return () => clearInterval(timer);
  }, []);

  // Timer while recording
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStartRecording = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const title = meetingTitleInput.trim() || `Meeting with ${project.client.name}`;
      await api.startMeeting({
        projectId: project.id,
        title,
        micDevice: selectedMic ? Number(selectedMic) : undefined,
      });
      setIsRecording(true);
      setActiveTitle(title);
      setMeetingTitleInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopRecording = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.stopMeeting();
      setIsRecording(false);
      setRecordingSeconds(0);
      await loadData();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop recording.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachMeeting = async (meetingId: string) => {
    setAttachingId(meetingId);
    setError(null);
    try {
      await api.attachMeetingToProject(meetingId, project.id);
      await loadData();
      await reload();
      setShowAttachModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach meeting.");
    } finally {
      setAttachingId(null);
    }
  };

  return (
    <div className="stack">
      {error && (
        <div className="field-error" style={{ marginBottom: "12px", padding: "8px 12px", background: "var(--danger-soft)", borderRadius: "var(--radius)" }}>
          {error}
        </div>
      )}

      {/* Recording Control Card */}
      <Card
        title="Record Meeting"
        action={
          unassignedMeetings.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowAttachModal(true)}
            >
              <Icon name="link" size={14} /> Attach unassigned recording ({unassignedMeetings.length})
            </button>
          )
        }
      >
        <div className={`recording-bar ${isRecording ? "active" : ""}`}>
          <div className="recording-meta">
            {isRecording ? (
              <>
                <div className="pulse-dot" />
                <div>
                  <strong style={{ display: "block", color: "var(--danger)" }}>
                    Recording in progress ({formatDuration(recordingSeconds)})
                  </strong>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    {activeTitle || "Client meeting session"}
                  </span>
                </div>
              </>
            ) : (
              <div>
                <strong>Local Meeting Recorder</strong>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)" }}>
                  Records audio locally and automatically transcribes with Whisper when stopped.
                </p>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {!isRecording && (
              <>
                <input
                  type="text"
                  placeholder="Meeting title (optional)"
                  value={meetingTitleInput}
                  onChange={(e) => setMeetingTitleInput(e.target.value)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "13px",
                    minWidth: "220px",
                  }}
                  disabled={submitting}
                />
                {devices.length > 0 && (
                  <select
                    value={selectedMic}
                    onChange={(e) => setSelectedMic(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "13px",
                      maxWidth: "200px",
                    }}
                    disabled={submitting}
                  >
                    {devices.map((d) => (
                      <option key={d.index} value={d.index}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}

            {isRecording ? (
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: "var(--danger)", borderColor: "var(--danger)" }}
                onClick={() => void handleStopRecording()}
                disabled={submitting}
              >
                <Icon name="stop" size={15} /> {submitting ? "Processing transcript..." : "Stop recording"}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleStartRecording()}
                disabled={submitting}
              >
                <Icon name="mic" size={15} /> {submitting ? "Starting..." : "Start recording"}
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Meetings List Card */}
      <Card title={`Recorded Meetings (${meetings.length})`} flush>
        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>Loading meetings...</div>
        ) : meetings.length === 0 ? (
          <EmptyState
            icon="mic"
            title="No meetings recorded yet"
            description="Start a recording above or attach an unassigned recording from storage."
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Meeting Title</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col" style={{ textAlign: "right" }}>Transcript</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Icon name="mic" size={16} />
                        <div>
                          <strong className="cell-title">{m.title}</strong>
                          {m.audioPaths && m.audioPaths.length > 0 && (
                            <span className="cell-sub">{m.audioPaths.length} audio stream(s)</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{formatDuration(m.durationSec)}</td>
                    <td className="cell-muted nowrap">
                      <RelativeTime iso={m.startedAt} />
                    </td>
                    <td>
                      <Badge tone={m.status === "completed" ? "success" : "info"}>
                        {m.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewingMeeting(m)}
                      >
                        <Icon name="file-text" size={14} /> View transcript
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* View Transcript Modal */}
      {viewingMeeting && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setViewingMeeting(null)}>
          <div className="modal preview-modal" role="dialog" aria-modal="true" aria-labelledby="transcript-title">
            <div className="modal-head">
              <div>
                <h2 id="transcript-title">{viewingMeeting.title}</h2>
                <p>
                  Started {formatDate(viewingMeeting.startedAt)} · Duration: {formatDuration(viewingMeeting.durationSec)}
                </p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setViewingMeeting(null)}>
                <Icon name="x" />
              </button>
            </div>
            {viewingMeeting.summary ? (
              <div className="meeting-summary">
                {(
                  [
                    ["Decisions", viewingMeeting.summary.decisions],
                    ["Action items", viewingMeeting.summary.action_items],
                    ["Open questions", viewingMeeting.summary.open_questions],
                  ] as const
                ).map(([label, items]) => (
                  <div key={label}>
                    <strong>{label}</strong>
                    {items && items.length ? (
                      <ul>
                        {items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="cell-muted">None found.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
            {summaryError ? (
              <p className="field-error" role="alert">
                {summaryError}
              </p>
            ) : null}
            <div className="preview-content">
              {viewingMeeting.transcript || "(No transcript generated for this session yet)"}
            </div>
            <div className="form-actions" style={{ marginTop: "16px", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  void navigator.clipboard.writeText(viewingMeeting.transcript);
                }}
              >
                <Icon name="copy" size={14} /> Copy transcript
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!aiEnabled || summarizing || !viewingMeeting.transcript}
                title={
                  !aiEnabled
                    ? "Configure LLM_PROVIDER and LLM_API_KEY in backend/.env to enable AI"
                    : !viewingMeeting.transcript
                    ? "This meeting has no transcript"
                    : "Find decisions, action items and open questions"
                }
                onClick={() => void summarize(viewingMeeting)}
              >
                <Icon name="sparkle" size={14} /> {summarizing ? "Summarizing…" : viewingMeeting.summary ? "Summarize again" : "Summarize with AI"}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setViewingMeeting(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Unassigned Meetings Modal */}
      {showAttachModal && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowAttachModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="attach-title" style={{ maxWidth: "650px" }}>
            <div className="modal-head">
              <div>
                <h2 id="attach-title">Attach Unassigned Recordings</h2>
                <p>These past recordings in storage are not yet linked to any project. Attaching will automatically generate a transcript source document for this project.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setShowAttachModal(false)}>
                <Icon name="x" />
              </button>
            </div>

            <div style={{ maxHeight: "360px", overflowY: "auto", margin: "16px 0" }}>
              {unassignedMeetings.length === 0 ? (
                <EmptyState compact icon="check" title="No unassigned recordings found" />
              ) : (
                <ul className="simple-list">
                  {unassignedMeetings.map((um) => (
                    <li key={um.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                      <div>
                        <strong style={{ display: "block" }}>{um.title}</strong>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {um.startedAt} · Duration: {formatDuration(um.durationSec)}
                          {um.transcript ? " · Has transcript" : " · No transcript"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={attachingId === um.id}
                        onClick={() => void handleAttachMeeting(um.id)}
                      >
                        {attachingId === um.id ? "Attaching..." : "Attach"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowAttachModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
