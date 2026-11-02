const sessionData = [
  { title: 'Product sync', date: 'Today • 12:48', tag: 'Live' },
  { title: 'Client review', date: 'Yesterday • 45 min', tag: 'Complete' },
  { title: 'Design standup', date: 'Mon • 22 min', tag: 'Saved' },
  { title: 'Sprint retro', date: 'Sun • 31 min', tag: 'Summary' }
];

const transcriptList = document.getElementById('transcriptList');
const sessionList = document.getElementById('sessionList');
const recordToggle = document.getElementById('recordToggle');
const recordBadge = document.getElementById('recordBadge');
const micSelect = document.getElementById('micSelect');
const systemSelect = document.getElementById('systemSelect');

function setStatus(label, live = false) {
  recordBadge.textContent = label;
  recordBadge.className = `badge ${live ? 'live' : 'neutral'}`;
}

function showMessage(text) {
  transcriptList.innerHTML = `<div class="bubble">${text}</div>`;
}

async function loadDevices() {
  try {
    const response = await fetch('/api/devices');
    const data = await response.json();
    const options = data.inputs
      .map((d) => `<option value="${d.index}">${d.name}</option>`)
      .join('');

    micSelect.innerHTML = options;
    micSelect.value = String(data.defaultInput);
    systemSelect.innerHTML = `<option value="">None (mic only)</option>${options}`;

    // Pick BlackHole (or another loopback device) for system audio if present.
    const loopback = data.inputs.find((d) => /blackhole|loopback|monitor/i.test(d.name));
    if (loopback) systemSelect.value = String(loopback.index);
  } catch (error) {
    console.error('Error loading devices:', error);
    micSelect.innerHTML = '<option value="">System default</option>';
  }
}

function renderTranscript(items = []) {
  if (!items.length) {
    transcriptList.innerHTML = '<div class="bubble">No transcript yet. Start the meeting recorder to generate one.</div>';
    return;
  }

  transcriptList.innerHTML = items.map((item) => {
    const isYou = item.speaker === 'You';
    return `
      <div class="chat-row ${isYou ? 'you' : ''}">
        <div class="avatar">${item.speaker.slice(0, 1)}</div>
        <div class="bubble">
          <div class="meta">
            <span>${item.speaker}</span>
            <span>${item.time}</span>
          </div>
          <div>${item.text}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSessions() {
  sessionList.innerHTML = sessionData.map((session) => `
    <div class="session-item">
      <div>
        <div class="session-title">
          <span class="session-dot"></span>
          <span>${session.title}</span>
        </div>
        <div class="session-meta">${session.date}</div>
      </div>
      <span class="session-tag">${session.tag}</span>
    </div>
  `).join('');
}

function parseTranscriptText(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('Meeting transcript'))
    .filter((line) => !line.startsWith('###'))
    .filter((line) => !line.startsWith('AI summary'))
    .filter((line) => !line.startsWith('Session insights'))
    .filter((line) => !line.startsWith('- '));

  if (!lines.length) return [];

  return lines.map((line) => {
    const match = line.match(/^\[(.*?)\]\s+(\w+):\s*(.*)$/);
    if (match) {
      return {
        speaker: match[2],
        time: match[1],
        text: match[3]
      };
    }

    const fallback = line.match(/^(You|Others)\s*(\d{2}:\d{2})\s*(.*)$/i);
    if (fallback) {
      return {
        speaker: fallback[1],
        time: fallback[2],
        text: fallback[3]
      };
    }

    return {
      speaker: 'Others',
      time: '00:00',
      text: line
    };
  });
}

async function startRecording() {
  try {
    const response = await fetch('/api/meeting/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: document.getElementById('modelSelect').value,
        micDevice: micSelect.value || null,
        systemDevice: systemSelect.value || null,
        language: document.getElementById('languageSelect').value || null,
        prompt: document.getElementById('promptInput').value.trim() || null
      })
    });

    const data = await response.json();
    console.log('start response:', data);
    if (!response.ok) throw new Error(data.status || response.statusText);
    setStatus('Recording', true);
    showMessage('Recording… switch the toggle off to stop and transcribe.');
  } catch (error) {
    console.error('Error starting recording:', error);
    recordToggle.checked = false;
    setStatus('Idle');
    showMessage(`Could not start recording: ${error.message}`);
  }
}

async function loadLatestTranscript() {
  try {
    const response = await fetch('/api/meeting/latest');
    const data = await response.json();
    const transcript = parseTranscriptText(data.transcript || '');
    renderTranscript(transcript);
    return transcript;
  } catch (error) {
    console.error('Error loading latest transcript:', error);
    renderTranscript([]);
    return [];
  }
}

async function stopRecording() {
  recordToggle.disabled = true;
  setStatus('Transcribing');
  showMessage('Transcribing… this can take a minute (longer on the first run while the model downloads).');
  try {
    const response = await fetch('/api/meeting/stop', { method: 'POST' });
    const data = await response.json();
    const transcript = parseTranscriptText(data.transcript || '');
    if (transcript.length) {
      renderTranscript(transcript);
    } else {
      await loadLatestTranscript();
    }
    console.log('stop response:', data);
  } catch (error) {
    console.error('Error stopping recording:', error);
    showMessage(`Could not stop recording: ${error.message}`);
  } finally {
    recordToggle.disabled = false;
    setStatus('Idle');
  }
}

async function syncStatus() {
  try {
    const response = await fetch('/api/meeting/status');
    const data = await response.json();
    recordToggle.checked = data.recording;
    if (data.recording) setStatus('Recording', true);
  } catch (error) {
    console.error('Error loading status:', error);
  }
}

recordToggle.addEventListener('change', async () => {
  if (recordToggle.checked) {
    await startRecording();
  } else {
    await stopRecording();
  }
});

renderTranscript();
renderSessions();
loadDevices();
loadLatestTranscript();
syncStatus();
