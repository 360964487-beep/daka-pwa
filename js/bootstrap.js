document.getElementById('doubaoInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDoubaoMessage(); } });
const doubaoVoiceButton = document.getElementById('doubaoVoice');
doubaoVoiceButton.addEventListener('pointerdown', e => {
  if (e.button !== undefined && e.button !== 0) return;
  e.preventDefault(); try { doubaoVoiceButton.setPointerCapture(e.pointerId); } catch (_) {}
  voicePointerHeld = true; voiceRestartCount = 0; voiceHasRecognizedText = false;
  startDoubaoVoice();
});
doubaoVoiceButton.addEventListener('pointerup', e => { e.preventDefault(); stopDoubaoVoice(false, 'released'); });
doubaoVoiceButton.addEventListener('pointercancel', () => stopDoubaoVoice(true, 'cancelled'));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopDoubaoVoice(true, 'page-hidden'); });
initTimePicker();
initAppTheme();
goPage('checkin');
