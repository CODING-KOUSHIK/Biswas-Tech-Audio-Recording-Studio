/**
 * Biswas Tech – Audio Recording Studio
 * Streamlined Mobile-First Application Controller
 */

(function () {
  'use strict';

  // Application State
  const state = {
    whatsappNumber: '',
    currentSession: null,
    scripts: [],
    currentScriptIndex: 0,
    recordingsMap: new Map(), // scriptId -> recording
    recorder: null,
    activeAudioBlobUrl: null,
    isPlaying: false,
    animFrameId: null
  };

  // DOM Elements
  const el = {
    // Top Bar
    btnHeaderHome: document.getElementById('btn-header-home'),
    headerProgressPill: document.getElementById('header-progress-pill'),
    headerProgressText: document.getElementById('header-progress-text'),
    autosaveDot: document.getElementById('autosave-dot'),
    autosaveText: document.getElementById('autosave-text'),
    btnHeaderNew: document.getElementById('btn-header-new'),

    // Step Cards
    stepPhone: document.getElementById('step-phone'),
    stepScripts: document.getElementById('step-scripts'),
    stepRecord: document.getElementById('step-record'),
    stepComplete: document.getElementById('step-complete'),

    // Step 1: Phone
    formPhoneEntry: document.getElementById('form-phone-entry'),
    inputPhone: document.getElementById('input-phone'),
    btnSubmitPhone: document.getElementById('btn-submit-phone'),
    resumeCard: document.getElementById('resume-card'),
    resumeDesc: document.getElementById('resume-desc'),
    btnResumeSession: document.getElementById('btn-resume-session'),
    btnIgnoreResume: document.getElementById('btn-ignore-resume'),

    // Step 2: Scripts
    inputScriptsText: document.getElementById('input-scripts-text'),
    parsedCountPill: document.getElementById('parsed-count-pill'),
    parsedWarning: document.getElementById('parsed-warning'),
    btnStartStudio: document.getElementById('btn-start-studio'),

    // Step 3: Record
    currentScriptNum: document.getElementById('current-script-num'),
    currentScriptId: document.getElementById('current-script-id'),
    currentProgressFill: document.getElementById('current-progress-fill'),
    currentScriptText: document.getElementById('current-script-text'),
    btnCopyScript: document.getElementById('btn-copy-script'),
    copyIcon: document.getElementById('copy-icon'),
    copyText: document.getElementById('copy-text'),
    recDot: document.getElementById('rec-dot'),
    recStatusText: document.getElementById('rec-status-text'),
    recTimer: document.getElementById('rec-timer'),
    vuMeterBar: document.getElementById('vu-meter-bar'),

    // Controls
    controlsReady: document.getElementById('controls-ready'),
    controlsRecording: document.getElementById('controls-recording'),
    controlsRecorded: document.getElementById('controls-recorded'),
    btnStartRecord: document.getElementById('btn-start-record'),
    btnStopRecord: document.getElementById('btn-stop-record'),
    btnMiniPlay: document.getElementById('btn-mini-play'),
    miniPlayIcon: document.getElementById('mini-play-icon'),
    miniAudioScrubber: document.getElementById('mini-audio-scrubber'),
    miniCurrentTime: document.getElementById('mini-current-time'),
    miniDurationTime: document.getElementById('mini-duration-time'),
    btnRerecord: document.getElementById('btn-rerecord'),
    btnSaveNext: document.getElementById('btn-save-next'),
    saveNextText: document.getElementById('save-next-text'),
    saveNextIcon: document.getElementById('save-next-icon'),
    btnPrevScript: document.getElementById('btn-prev-script'),

    // Step 4: Complete
    summaryTotalScripts: document.getElementById('summary-total-scripts'),
    summaryTotalDuration: document.getElementById('summary-total-duration'),
    summaryTotalSize: document.getElementById('summary-total-size'),
    btnDownloadZipFinal: document.getElementById('btn-download-zip-final'),
    btnReviewRecordings: document.getElementById('btn-review-recordings'),
    btnNewBatch: document.getElementById('btn-new-batch'),

    // Modals & Tools
    zipOverlay: document.getElementById('zip-overlay'),
    zipStatusText: document.getElementById('zip-status-text'),
    zipFillBar: document.getElementById('zip-fill-bar'),
    zipPercentText: document.getElementById('zip-percent-text'),
    dialogOverlay: document.getElementById('dialog-overlay'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogMessage: document.getElementById('dialog-message'),
    dialogBtnCancel: document.getElementById('dialog-btn-cancel'),
    dialogBtnConfirm: document.getElementById('dialog-btn-confirm'),
    toastMobile: document.getElementById('toast-mobile'),
    mobileAudio: document.getElementById('mobile-audio')
  };

  // Toast Helper
  let toastTimer = null;
  function showToast(msg, duration = 3000) {
    clearTimeout(toastTimer);
    el.toastMobile.textContent = msg;
    el.toastMobile.classList.add('show');
    toastTimer = setTimeout(() => {
      el.toastMobile.classList.remove('show');
    }, duration);
  }

  // Dialog Modal
  let dialogCallback = null;
  function showDialog({ title, message, confirmText = 'Confirm', onConfirm }) {
    el.dialogTitle.textContent = title;
    el.dialogMessage.innerHTML = message;
    el.dialogBtnConfirm.textContent = confirmText;
    dialogCallback = onConfirm;
    el.dialogOverlay.classList.add('active');
  }

  function closeDialog() {
    el.dialogOverlay.classList.remove('active');
    dialogCallback = null;
  }

  el.dialogBtnCancel.addEventListener('click', closeDialog);
  el.dialogBtnConfirm.addEventListener('click', () => {
    if (typeof dialogCallback === 'function') dialogCallback();
    closeDialog();
  });

  // Autosave status indicator
  function setAutosave(status) {
    el.autosaveDot.classList.remove('saving', 'error');
    if (status === 'saving') {
      el.autosaveDot.classList.add('saving');
      el.autosaveText.textContent = 'Saving...';
    } else if (status === 'saved') {
      el.autosaveText.textContent = 'Saved';
    } else if (status === 'error') {
      el.autosaveDot.classList.add('error');
      el.autosaveText.textContent = 'Error!';
    }
  }

  // Navigation between steps
  function showStep(stepName) {
    stopAudio();

    el.stepPhone.classList.remove('active');
    el.stepScripts.classList.remove('active');
    el.stepRecord.classList.remove('active');
    el.stepComplete.classList.remove('active');

    if (stepName === 'phone') {
      el.stepPhone.classList.add('active');
      el.headerProgressPill.style.display = 'none';
      el.btnHeaderNew.style.display = 'none';
    } else if (stepName === 'scripts') {
      el.stepScripts.classList.add('active');
      el.headerProgressPill.style.display = 'none';
      el.btnHeaderNew.style.display = 'none';
    } else if (stepName === 'record') {
      el.stepRecord.classList.add('active');
      el.headerProgressPill.style.display = 'inline-flex';
      el.btnHeaderNew.style.display = 'flex';
      renderCurrentScript();
    } else if (stepName === 'complete') {
      el.stepComplete.classList.add('active');
      el.headerProgressPill.style.display = 'inline-flex';
      el.btnHeaderNew.style.display = 'flex';
      renderCompleteScreen();
    }
  }

  // Header Actions
  el.btnHeaderHome.addEventListener('click', () => {
    if (state.currentSession) showStep('record');
    else showStep('phone');
  });

  el.btnHeaderNew.addEventListener('click', () => {
    showDialog({
      title: 'Start New Batch?',
      message: 'This will let you paste a fresh batch of scripts. Your existing recordings remain saved in your browser history.',
      confirmText: 'New Batch',
      onConfirm: () => {
        el.inputScriptsText.value = '';
        updateScriptParsing();
        showStep('scripts');
      }
    });
  });

  // =========================================================================
  // STEP 1: PHONE NUMBER
  // =========================================================================
  function sanitizePhone(raw) {
    return raw ? raw.trim().replace(/[^0-9+]/g, '') : '';
  }

  function validatePhone(phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    return digits.length >= 7 && digits.length <= 16;
  }

  async function checkUnfinishedSession(phone) {
    const clean = sanitizePhone(phone);
    if (!validatePhone(clean)) {
      el.resumeCard.style.display = 'none';
      return;
    }

    try {
      const unfinished = await window.AudioStudioDB.getUnfinishedSessionForNumber(clean);
      if (unfinished) {
        el.resumeDesc.textContent = `You have completed ${unfinished.completedScripts} of ${unfinished.totalScripts} recordings in this session.`;
        el.resumeCard.style.display = 'block';

        el.btnResumeSession.onclick = () => resumeSession(unfinished.sessionId);
        el.btnIgnoreResume.onclick = () => {
          el.resumeCard.style.display = 'none';
          proceedToScripts(clean);
        };
      } else {
        el.resumeCard.style.display = 'none';
      }
    } catch (e) {
      console.warn('Check session error:', e);
    }
  }

  el.inputPhone.addEventListener('input', (e) => {
    checkUnfinishedSession(e.target.value);
  });

  el.formPhoneEntry.addEventListener('submit', async (e) => {
    e.preventDefault();
    const clean = sanitizePhone(el.inputPhone.value);
    if (!validatePhone(clean)) {
      showToast('Please enter a valid WhatsApp number (7-16 digits).');
      return;
    }

    const unfinished = await window.AudioStudioDB.getUnfinishedSessionForNumber(clean);
    if (unfinished) {
      showDialog({
        title: 'Resume Previous Session?',
        message: `Found an unfinished session with ${unfinished.completedScripts} of ${unfinished.totalScripts} recordings completed. Resume where you left off?`,
        confirmText: 'Resume',
        onConfirm: () => resumeSession(unfinished.sessionId)
      });
      return;
    }

    proceedToScripts(clean);
  });

  function proceedToScripts(phone) {
    state.whatsappNumber = phone;
    localStorage.setItem('biswas_phone', phone);
    showStep('scripts');
  }

  // =========================================================================
  // STEP 2: SCRIPT PARSER
  // =========================================================================
  function parseScripts(rawText) {
    if (!rawText || !rawText.trim()) return { scripts: [], duplicates: [] };

    const lines = rawText.split(/\r?\n/);
    const scripts = [];
    const idRegex = /^\s*\*([^*]+)\*\s*$/;

    let currentId = null;
    let currentLines = [];
    let foundAsterisk = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(idRegex);

      if (match) {
        foundAsterisk = true;
        if (currentId !== null) {
          const text = currentLines.join('\n').trim();
          if (text.length > 0) scripts.push({ scriptId: currentId, scriptText: text });
        }
        currentId = match[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentId !== null) {
      const text = currentLines.join('\n').trim();
      if (text.length > 0) scripts.push({ scriptId: currentId, scriptText: text });
    } else if (!foundAsterisk) {
      // Split by double newline or treat as single script
      const paragraphs = rawText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      paragraphs.forEach((p, idx) => {
        scripts.push({
          scriptId: `SCRIPT_${String(idx + 1).padStart(3, '0')}`,
          scriptText: p.trim()
        });
      });
    }

    const seen = new Set();
    const duplicates = new Set();
    scripts.forEach(s => {
      if (seen.has(s.scriptId)) duplicates.add(s.scriptId);
      seen.add(s.scriptId);
    });

    return { scripts, duplicates: Array.from(duplicates) };
  }

  function updateScriptParsing() {
    const raw = el.inputScriptsText.value;
    const { scripts, duplicates } = parseScripts(raw);

    el.parsedCountPill.textContent = `${scripts.length} Script${scripts.length === 1 ? '' : 's'} Detected`;

    if (duplicates.length > 0) {
      el.parsedWarning.textContent = `Duplicate IDs: ${duplicates.join(', ')}`;
      el.parsedWarning.style.display = 'inline';
      el.btnStartStudio.disabled = true;
    } else {
      el.parsedWarning.style.display = 'none';
      el.btnStartStudio.disabled = scripts.length === 0;
    }
  }

  el.inputScriptsText.addEventListener('input', updateScriptParsing);

  el.btnStartStudio.addEventListener('click', async () => {
    const raw = el.inputScriptsText.value;
    const { scripts, duplicates } = parseScripts(raw);

    if (duplicates.length > 0) {
      showToast('Please fix duplicate IDs before starting.');
      return;
    }

    if (scripts.length === 0) {
      showToast('Please paste at least one script.');
      return;
    }

    setAutosave('saving');
    try {
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();

      const session = {
        sessionId,
        whatsappNumber: state.whatsappNumber,
        createdAt: now,
        updatedAt: now,
        currentScriptIndex: 0,
        totalScripts: scripts.length,
        completedScripts: 0,
        sessionStatus: 'active',
        scriptIds: scripts.map(s => s.scriptId),
        downloadStatus: false
      };

      const scriptRecords = scripts.map((s, idx) => ({
        scriptId: s.scriptId,
        sessionId,
        scriptText: s.scriptText,
        scriptIndex: idx,
        recordingStatus: 'pending',
        recordingTimestamp: null
      }));

      await window.AudioStudioDB.saveSession(session);
      await window.AudioStudioDB.saveScripts(sessionId, scriptRecords);

      state.currentSession = session;
      state.scripts = scriptRecords;
      state.currentScriptIndex = 0;
      state.recordingsMap.clear();

      setAutosave('saved');
      showToast(`Ready! Script 1 of ${scripts.length}`);
      showStep('record');
    } catch (e) {
      setAutosave('error');
      showToast(`Failed to start: ${e.message}`);
    }
  });

  // =========================================================================
  // STEP 3: STREAMLINED RECORDING SCREEN
  // =========================================================================
  function renderCurrentScript() {
    if (!state.currentSession || state.scripts.length === 0) {
      showStep('scripts');
      return;
    }

    const idx = state.currentScriptIndex;
    const total = state.scripts.length;
    const script = state.scripts[idx];

    // Header counter and badge
    el.currentScriptNum.textContent = `Script ${idx + 1} of ${total}`;
    el.currentScriptId.textContent = `ID: ${script.scriptId}`;
    el.headerProgressText.textContent = `${idx + 1} / ${total}`;

    // Progress bar width
    const pct = Math.round(((idx + 1) / total) * 100);
    el.currentProgressFill.style.width = `${pct}%`;

    // Script text
    el.currentScriptText.textContent = script.scriptText;

    // Reset indicator & timer
    el.recStatusText.textContent = 'Ready to record';
    el.recTimer.textContent = '00:00';
    el.recDot.parentElement.classList.remove('active');
    el.vuMeterBar.style.width = '0%';

    // Previous button visibility
    el.btnPrevScript.style.visibility = idx > 0 ? 'visible' : 'hidden';

    // Check if this script was already recorded
    const rec = state.recordingsMap.get(script.scriptId);
    if (rec && rec.wavBlob) {
      // Show recorded state
      setupRecordedView(rec.wavBlob, rec.duration);
    } else {
      // Show ready to record state
      setupReadyView();
    }
  }

  function setupReadyView() {
    stopAudio();
    el.controlsReady.style.display = 'block';
    el.controlsRecording.style.display = 'none';
    el.controlsRecorded.style.display = 'none';
  }

  function setupRecordingView() {
    stopAudio();
    el.controlsReady.style.display = 'none';
    el.controlsRecording.style.display = 'block';
    el.controlsRecorded.style.display = 'none';

    el.recStatusText.textContent = 'Recording...';
    el.recDot.parentElement.classList.add('active');
  }

  function setupRecordedView(wavBlob, duration) {
    el.controlsReady.style.display = 'none';
    el.controlsRecording.style.display = 'none';
    el.controlsRecorded.style.display = 'block';

    el.recStatusText.textContent = 'Recording Saved ✓';
    el.recDot.parentElement.classList.remove('active');

    // Update Save & Next button text
    const isLastScript = state.currentScriptIndex === state.scripts.length - 1;
    if (isLastScript) {
      el.saveNextText.textContent = 'Save & Download ZIP';
      el.saveNextIcon.textContent = '📦';
    } else {
      el.saveNextText.textContent = 'Save & Next';
      el.saveNextIcon.textContent = '→';
    }

    // Load Audio into player
    loadAudio(wavBlob, duration);
  }

  // Copy button
  el.btnCopyScript.addEventListener('click', async () => {
    const script = state.scripts[state.currentScriptIndex];
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.scriptText);
      el.copyIcon.textContent = '✓';
      el.copyText.textContent = 'Copied';
      setTimeout(() => {
        el.copyIcon.textContent = '📋';
        el.copyText.textContent = 'Copy';
      }, 2000);
    } catch (e) {
      showToast('Could not copy.');
    }
  });

  // Previous script navigation
  el.btnPrevScript.addEventListener('click', () => {
    if (state.currentScriptIndex > 0) {
      state.currentScriptIndex--;
      state.currentSession.currentScriptIndex = state.currentScriptIndex;
      window.AudioStudioDB.saveSession(state.currentSession);
      renderCurrentScript();
    }
  });

  // =========================================================================
  // AUDIO RECORDING ENGINE & CONTROLS
  // =========================================================================
  function formatSecs(sec) {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }

  function getRecorder() {
    if (state.recorder) return state.recorder;

    state.recorder = new window.AudioRecorderEngine();
    state.recorder.onTimeUpdate = (elapsedMs) => {
      el.recTimer.textContent = formatSecs(elapsedMs / 1000);
    };

    return state.recorder;
  }

  function startVULoop() {
    function vu() {
      state.animFrameId = requestAnimationFrame(vu);
      if (state.recorder && state.recorder.state === 'recording') {
        const rms = state.recorder.getRMSLevel();
        el.vuMeterBar.style.width = `${Math.min(100, Math.round(rms * 100))}%`;
      } else {
        el.vuMeterBar.style.width = '0%';
      }
    }
    vu();
  }

  // Start Recording Click
  el.btnStartRecord.addEventListener('click', async () => {
    try {
      const rec = getRecorder();
      await rec.start();
      setupRecordingView();
      startVULoop();
      showToast('Recording... Speak clearly.');
    } catch (err) {
      showToast(err.name === 'NotAllowedError' ? 'Please grant microphone access.' : `Mic error: ${err.message}`);
    }
  });

  // Stop Recording Click
  el.btnStopRecord.addEventListener('click', async () => {
    if (!state.recorder) return;

    setAutosave('saving');
    try {
      const result = await state.recorder.stop();
      const currentScript = state.scripts[state.currentScriptIndex];

      const recordData = {
        sessionId: state.currentSession.sessionId,
        scriptId: currentScript.scriptId,
        wavBlob: result.blob,
        duration: result.duration,
        sampleRate: result.sampleRate,
        channels: result.channels,
        bitDepth: result.bitDepth,
        createdAt: new Date().toISOString(),
        fileSize: result.fileSize
      };

      // Save to IndexedDB
      await window.AudioStudioDB.saveRecording(recordData);
      await window.AudioStudioDB.updateScriptStatus(
        state.currentSession.sessionId,
        currentScript.scriptId,
        'completed',
        recordData.createdAt
      );

      currentScript.recordingStatus = 'completed';
      state.recordingsMap.set(currentScript.scriptId, recordData);

      // Recalculate completed count
      let completed = 0;
      for (const s of state.scripts) {
        if (s.recordingStatus === 'completed') completed++;
      }
      state.currentSession.completedScripts = completed;
      await window.AudioStudioDB.saveSession(state.currentSession);

      setAutosave('saved');
      showToast(`Recorded (${result.duration}s WAV)`);

      setupRecordedView(result.blob, result.duration);
    } catch (err) {
      setAutosave('error');
      showToast(`Save error: ${err.message}`);
      setupReadyView();
    }
  });

  // Re-record / Redo Click
  el.btnRerecord.addEventListener('click', () => {
    showDialog({
      title: 'Redo Recording?',
      message: 'Do you want to re-record this script? The previous take will only be replaced after your new recording finishes.',
      confirmText: 'Re-record',
      onConfirm: () => {
        setupReadyView();
        showToast('Ready. Click Start Recording.');
      }
    });
  });

  // Save & Next (or Save & Download ZIP) Click
  el.btnSaveNext.addEventListener('click', async () => {
    const isLastScript = state.currentScriptIndex === state.scripts.length - 1;

    if (isLastScript) {
      // Last script finished! Trigger ZIP download and celebration screen
      await executeDownloadZip();
      showStep('complete');
    } else {
      // Advance to next script
      state.currentScriptIndex++;
      state.currentSession.currentScriptIndex = state.currentScriptIndex;
      await window.AudioStudioDB.saveSession(state.currentSession);

      showToast(`Next: Script ${state.currentScriptIndex + 1}`);
      renderCurrentScript();
    }
  });

  // =========================================================================
  // AUDIO PLAYBACK
  // =========================================================================
  function loadAudio(blob, duration) {
    stopAudio();
    state.activeAudioBlobUrl = URL.createObjectURL(blob);
    el.mobileAudio.src = state.activeAudioBlobUrl;
    el.miniAudioScrubber.value = 0;
    el.miniCurrentTime.textContent = '00:00';
    el.miniDurationTime.textContent = formatSecs(duration || 0);
    el.miniPlayIcon.textContent = '▶';
  }

  function stopAudio() {
    if (el.mobileAudio) {
      el.mobileAudio.pause();
      el.mobileAudio.currentTime = 0;
    }
    if (state.activeAudioBlobUrl) {
      URL.revokeObjectURL(state.activeAudioBlobUrl);
      state.activeAudioBlobUrl = null;
    }
    state.isPlaying = false;
    el.miniPlayIcon.textContent = '▶';
  }

  el.btnMiniPlay.addEventListener('click', () => {
    if (el.mobileAudio.paused) {
      el.mobileAudio.play().catch(e => console.warn(e));
      el.miniPlayIcon.textContent = '⏸';
      state.isPlaying = true;
    } else {
      el.mobileAudio.pause();
      el.miniPlayIcon.textContent = '▶';
      state.isPlaying = false;
    }
  });

  el.mobileAudio.addEventListener('timeupdate', () => {
    const a = el.mobileAudio;
    if (a.duration && a.duration > 0) {
      el.miniAudioScrubber.value = (a.currentTime / a.duration) * 100;
      el.miniCurrentTime.textContent = formatSecs(a.currentTime);
      el.miniDurationTime.textContent = formatSecs(a.duration);
    }
  });

  el.mobileAudio.addEventListener('ended', () => {
    el.miniPlayIcon.textContent = '▶';
    el.miniAudioScrubber.value = 0;
    el.miniCurrentTime.textContent = '00:00';
    state.isPlaying = false;
  });

  el.miniAudioScrubber.addEventListener('input', (e) => {
    if (el.mobileAudio.duration) {
      el.mobileAudio.currentTime = (e.target.value / 100) * el.mobileAudio.duration;
    }
  });

  // =========================================================================
  // STEP 4: ZIP GENERATION & COMPLETION
  // =========================================================================
  async function executeDownloadZip() {
    el.zipFillBar.style.width = '0%';
    el.zipPercentText.textContent = '0%';
    el.zipStatusText.textContent = 'Verifying recordings...';
    el.zipOverlay.classList.add('active');

    try {
      const allRecordings = await window.AudioStudioDB.getAllRecordingsForSession(state.currentSession.sessionId);

      const { zipBlob, filename } = await window.ZipManager.generateSessionZip(
        state.currentSession,
        state.scripts,
        allRecordings,
        (percent, status) => {
          el.zipFillBar.style.width = `${percent}%`;
          el.zipPercentText.textContent = `${percent}%`;
          if (status) el.zipStatusText.textContent = status;
        }
      );

      window.ZipManager.constructor.downloadBlob(zipBlob, filename);
      state.currentSession.downloadStatus = true;
      await window.AudioStudioDB.saveSession(state.currentSession);

      setTimeout(() => {
        el.zipOverlay.classList.remove('active');
        showToast(`Downloaded: ${filename}`);
      }, 400);

    } catch (err) {
      el.zipOverlay.classList.remove('active');
      showToast(`ZIP error: ${err.message}`);
    }
  }

  function renderCompleteScreen() {
    let totalSecs = 0;
    let totalBytes = 0;

    for (const rec of state.recordingsMap.values()) {
      totalSecs += rec.duration || 0;
      totalBytes += rec.fileSize || 0;
    }

    el.summaryTotalScripts.textContent = state.scripts.length;
    el.summaryTotalDuration.textContent = formatSecs(totalSecs);
    el.summaryTotalSize.textContent = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  el.btnDownloadZipFinal.addEventListener('click', executeDownloadZip);

  el.btnReviewRecordings.addEventListener('click', () => {
    state.currentScriptIndex = 0;
    showStep('record');
  });

  el.btnNewBatch.addEventListener('click', () => {
    el.inputScriptsText.value = '';
    updateScriptParsing();
    showStep('scripts');
  });

  // =========================================================================
  // RESUME SESSION HELPER
  // =========================================================================
  async function resumeSession(sessionId) {
    setAutosave('saving');
    try {
      const session = await window.AudioStudioDB.getSession(sessionId);
      const scripts = await window.AudioStudioDB.getScriptsForSession(sessionId);
      const recs = await window.AudioStudioDB.getAllRecordingsForSession(sessionId);

      state.currentSession = session;
      state.whatsappNumber = session.whatsappNumber;
      state.scripts = scripts;
      state.currentScriptIndex = session.currentScriptIndex || 0;

      state.recordingsMap.clear();
      recs.forEach(r => state.recordingsMap.set(r.scriptId, r));

      setAutosave('saved');
      showToast(`Resumed: ${session.completedScripts}/${session.totalScripts} completed`);
      showStep('record');
    } catch (e) {
      setAutosave('error');
      showToast(`Error resuming: ${e.message}`);
    }
  }

  // =========================================================================
  // BOOTSTRAP
  // =========================================================================
  async function init() {
    try {
      await window.AudioStudioDB.init();
    } catch (e) {
      console.warn('DB Init error:', e);
    }

    const savedPhone = localStorage.getItem('biswas_phone');
    if (savedPhone) {
      state.whatsappNumber = savedPhone;
      el.inputPhone.value = savedPhone;
      checkUnfinishedSession(savedPhone);
    }

    showStep('phone');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
