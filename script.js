const STORAGE_KEY = 'ipl_predictor_v1';

const initialState = {
  participants: [],
  currentMatch: null,
  matches: []
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(initialState);
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

const leaderboardEl = document.getElementById('leaderboard');
const leaderMetaEl = document.getElementById('leaderMeta');
const todayMatchEl = document.getElementById('todayMatch');
const matchStatusPillEl = document.getElementById('matchStatusPill');
const teamOptionsEl = document.getElementById('teamOptions');
const participantSelectEl = document.getElementById('participantSelect');
const voteMessageEl = document.getElementById('voteMessage');
const historyEl = document.getElementById('history');
const pinsListEl = document.getElementById('pinsList');
const leaderRowTemplate = document.getElementById('leaderRowTemplate');

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function getScores() {
  const scores = Object.fromEntries(state.participants.map(p => [p.id, 0]));

  state.matches.forEach(match => {
    if (match.status === 'completed' && (match.result === 'teamA' || match.result === 'teamB')) {
      match.predictions.forEach(pred => {
        if (pred.pick === match.result) scores[pred.participantId] += 1;
      });
    }
    if (match.status === 'abandoned') {
      match.predictions.forEach(pred => {
        scores[pred.participantId] += 1;
      });
    }
  });

  return state.participants
    .map(p => ({ ...p, score: scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function renderLeaderboard() {
  const rows = getScores();
  leaderboardEl.innerHTML = '';
  leaderMetaEl.textContent = `${rows.length} participants`;

  if (!rows.length) {
    leaderboardEl.innerHTML = '<div class="empty-state">Add participants first. The app is not telepathic yet.</div>';
    return;
  }

  const maxScore = Math.max(...rows.map(r => r.score), 1);

  rows.forEach(row => {
    const node = leaderRowTemplate.content.cloneNode(true);
    node.querySelector('.leader-name').textContent = row.name;
    node.querySelector('.leader-score').textContent = row.score;
    node.querySelector('.bar').style.width = `${(row.score / maxScore) * 100}%`;
    leaderboardEl.appendChild(node);
  });
}

function renderCurrentMatch() {
  participantSelectEl.innerHTML = '<option value="">Select your name</option>';
  state.participants.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    participantSelectEl.appendChild(opt);
  });

  teamOptionsEl.innerHTML = '';

  if (!state.currentMatch) {
    todayMatchEl.textContent = 'No active match yet. Use the admin panel below and stop glaring at the screen.';
    todayMatchEl.className = 'match-banner empty-state';
    matchStatusPillEl.textContent = 'No match loaded';
    return;
  }

  todayMatchEl.className = 'match-banner';
  todayMatchEl.textContent = `${state.currentMatch.teamA} vs ${state.currentMatch.teamB} · ${state.currentMatch.date}`;
  matchStatusPillEl.textContent = state.currentMatch.isOpen ? 'Voting open' : 'Voting closed';

  [['teamA', state.currentMatch.teamA], ['teamB', state.currentMatch.teamB]].forEach(([value, label]) => {
    const wrap = document.createElement('label');
    wrap.className = 'team-option';
    wrap.innerHTML = `<input type="radio" name="winnerPick" value="${value}" required /> <span>${label}</span>`;
    teamOptionsEl.appendChild(wrap);
  });
}

function renderPins() {
  pinsListEl.innerHTML = '';
  if (!state.participants.length) {
    pinsListEl.innerHTML = '<p class="hint">No participants yet.</p>';
    return;
  }

  state.participants.forEach(participant => {
    const row = document.createElement('div');
    row.className = 'pin-row';
    row.innerHTML = `
      <strong>${participant.name}</strong>
      <input type="text" value="${participant.pin}" maxlength="6" data-pin-id="${participant.id}" />
      <button type="button" class="secondary" data-save-pin="${participant.id}">Save PIN</button>
    `;
    pinsListEl.appendChild(row);
  });
}

function renderHistory() {
  historyEl.innerHTML = '';
  const matches = [...state.matches].reverse();
  if (!matches.length) {
    historyEl.className = 'history empty-state';
    historyEl.textContent = 'No matches yet.';
    return;
  }
  historyEl.className = 'history';

  matches.forEach(match => {
    const card = document.createElement('div');
    card.className = 'history-card';
    const resultText = match.status === 'upcoming'
      ? 'Voting open'
      : match.status === 'abandoned'
      ? 'Abandoned / no result'
      : match.result === 'teamA'
      ? `${match.teamA} won`
      : `${match.teamB} won`;

    const badges = `
      <span class="badge">${match.date}</span>
      <span class="badge">${match.teamA} vs ${match.teamB}</span>
      <span class="badge ${match.status === 'upcoming' ? 'warn' : 'success'}">${resultText}</span>
    `;

    const picks = match.predictions.length
      ? match.predictions.map(pred => {
          const participant = state.participants.find(p => p.id === pred.participantId);
          const pickedTeam = pred.pick === 'teamA' ? match.teamA : match.teamB;
          const gotPoint = match.status === 'upcoming' ? '' : (match.status === 'abandoned' || pred.pick === match.result ? ' +1' : ' +0');
          return `<div class="pick-row"><span>${participant?.name || 'Unknown'}</span><span>${pickedTeam}</span><strong>${gotPoint}</strong></div>`;
        }).join('')
      : '<p class="hint">No votes submitted.</p>';

    card.innerHTML = `
      <div class="history-meta">${badges}</div>
      <div>${picks}</div>
    `;
    historyEl.appendChild(card);
  });
}

function renderAll() {
  renderLeaderboard();
  renderCurrentMatch();
  renderPins();
  renderHistory();
}

function setMessage(text, type = '') {
  voteMessageEl.textContent = text;
  voteMessageEl.className = `message ${type}`.trim();
}

function seedSampleData() {
  state = {
    participants: [
      { id: uid(), name: 'Navas', pin: '1234' },
      { id: uid(), name: 'Ashwa', pin: '1234' },
      { id: uid(), name: 'Kowshi', pin: '1234' },
      { id: uid(), name: 'Kather', pin: '1234' },
      { id: uid(), name: 'Noufal', pin: '1234' },
      { id: uid(), name: 'Renga', pin: '1234' }
    ],
    currentMatch: null,
    matches: []
  };

  const [navas, ashwa, kowshi, kather, noufal, renga] = state.participants;

  state.matches = [
    {
      id: uid(),
      date: '2026-03-20',
      teamA: 'MI',
      teamB: 'DC',
      status: 'completed',
      result: 'teamA',
      predictions: [
        { participantId: navas.id, pick: 'teamA' },
        { participantId: ashwa.id, pick: 'teamA' },
        { participantId: kowshi.id, pick: 'teamB' },
        { participantId: kather.id, pick: 'teamA' },
        { participantId: noufal.id, pick: 'teamB' },
        { participantId: renga.id, pick: 'teamA' }
      ]
    },
    {
      id: uid(),
      date: '2026-03-21',
      teamA: 'GT',
      teamB: 'RR',
      status: 'abandoned',
      result: 'abandoned',
      predictions: [
        { participantId: navas.id, pick: 'teamA' },
        { participantId: ashwa.id, pick: 'teamB' },
        { participantId: noufal.id, pick: 'teamA' }
      ]
    }
  ];

  state.currentMatch = {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    teamA: 'CSK',
    teamB: 'RCB',
    isOpen: true,
    predictions: []
  };

  saveState();
  renderAll();
  setMessage('Sample data loaded. Now you can poke around like a proper admin.', 'success');
}

document.getElementById('seedBtn').addEventListener('click', seedSampleData);
document.getElementById('resetBtn').addEventListener('click', () => {
  if (!confirm('Reset all data? This will wipe matches, votes, and scores.')) return;
  state = structuredClone(initialState);
  saveState();
  renderAll();
  setMessage('Everything reset. A beautiful little disaster.', 'success');
});

document.getElementById('participantForm').addEventListener('submit', event => {
  event.preventDefault();
  const raw = document.getElementById('participantsInput').value.trim();
  if (!raw) return;
  const names = [...new Set(raw.split(',').map(name => name.trim()).filter(Boolean))];
  state.participants = names.map(name => ({ id: uid(), name, pin: '1234' }));
  saveState();
  renderAll();
  setMessage('Participants saved. Default PIN for all is 1234. Yes, extremely secure, like a screen door on a submarine.', 'success');
});

document.getElementById('matchForm').addEventListener('submit', event => {
  event.preventDefault();
  const teamA = document.getElementById('teamAInput').value.trim();
  const teamB = document.getElementById('teamBInput').value.trim();
  const date = document.getElementById('matchDateInput').value;

  if (!teamA || !teamB || !date) return;
  if (!state.participants.length) {
    setMessage('Add participants first.', 'error');
    return;
  }

  state.currentMatch = {
    id: uid(),
    date,
    teamA,
    teamB,
    isOpen: true,
    predictions: []
  };
  saveState();
  renderAll();
  setMessage(`Today's match saved: ${teamA} vs ${teamB}.`, 'success');
});

document.getElementById('voteForm').addEventListener('submit', event => {
  event.preventDefault();
  if (!state.currentMatch || !state.currentMatch.isOpen) {
    setMessage('Voting is closed right now.', 'error');
    return;
  }

  const participantId = participantSelectEl.value;
  const pin = document.getElementById('pinInput').value.trim();
  const pick = document.querySelector('input[name="winnerPick"]:checked')?.value;

  if (!participantId || !pin || !pick) {
    setMessage('Fill all fields before submitting.', 'error');
    return;
  }

  const participant = state.participants.find(p => p.id === participantId);
  if (!participant || participant.pin !== pin) {
    setMessage('Wrong PIN. Nice try, secret agent.', 'error');
    return;
  }

  const existing = state.currentMatch.predictions.find(p => p.participantId === participantId);
  if (existing) {
    existing.pick = pick;
  } else {
    state.currentMatch.predictions.push({ participantId, pick });
  }

  saveState();
  renderAll();
  document.getElementById('voteForm').reset();
  setMessage(`${participant.name}'s vote saved. Democracy survives another day.`, 'success');
});

document.querySelectorAll('[data-result]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.currentMatch) {
      setMessage('No current match to close.', 'error');
      return;
    }

    const result = btn.dataset.result;
    const status = result === 'abandoned' ? 'abandoned' : 'completed';
    const finishedMatch = {
      ...state.currentMatch,
      status,
      result,
      isOpen: false
    };

    state.matches.push(finishedMatch);
    state.currentMatch = null;
    saveState();
    renderAll();
    setMessage('Match closed and points updated.', 'success');
  });
});

pinsListEl.addEventListener('click', event => {
  const participantId = event.target.dataset.savePin;
  if (!participantId) return;
  const input = document.querySelector(`[data-pin-id="${participantId}"]`);
  const participant = state.participants.find(p => p.id === participantId);
  if (!input || !participant) return;
  participant.pin = input.value.trim() || '1234';
  saveState();
  setMessage(`${participant.name}'s PIN updated. Yes, now they feel important.`, 'success');
});

renderAll();
