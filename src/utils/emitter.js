export function safeEmit(io, event, payload) {
  try {
    if (!io) return;
    io.emit(event, payload);
  } catch (err) {
    // Non-fatal: just log
    // Keep minimal to avoid noisy stacktraces in production
    console.warn('safeEmit error:', err && err.message ? err.message : err);
  }
}
