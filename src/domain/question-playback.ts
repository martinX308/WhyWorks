// A client-observed playback witness. This is not independent provider attestation.
// Transcript availability alone must never produce a completed-speech event.
export class QuestionPlayback {
  private started = false;
  private ended = false;
  private interrupted = false;
  private transcript: string | null = null;
  private emitted: 'completed' | 'interrupted' | null = null;
  constructor(private emit: (outcome: 'completed' | 'interrupted', transcript: string) => void) {}
  message(text: string) {
    this.transcript ||= text;
    this.flush();
  }
  mode(mode: 'speaking' | 'listening') {
    if (mode === 'speaking') this.started = true;
    else if (this.started) this.ended = true;
    this.flush();
  }
  interrupt() {
    this.interrupted = true;
    this.flush();
  }
  private flush() {
    const outcome = this.interrupted ? 'interrupted' : 'completed';
    if (
      this.emitted === outcome ||
      !this.transcript ||
      (!this.interrupted && (!this.started || !this.ended))
    )
      return;
    this.emitted = outcome;
    this.emit(outcome, this.transcript);
  }
}
