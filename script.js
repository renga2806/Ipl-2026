
const SUPABASE_URL = 'https://gpqrpjyknsgrgyyejpcd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcXJwanlrbnNncmd5eWVqcGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc5NTQsImV4cCI6MjA5MDAyMzk1NH0.wlumoNLh5G-SI8YxLLmNzOPLxAN1KBedjp8aJwCW5ZA';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const todayString = () => new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
const isoToday = () => new Date().toISOString().split('T')[0];
const escapeHtml = (value='') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function showMessage(el, text, type='success') {
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove('hidden');
}

function clearMessage(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'message hidden';
}

async function getUsers() {
  const { data, error } = await db.from('users').select('*').order('name');
  if (error) throw error;
  return data || [];
}

async function getMatches(dateFilter = null) {
  let query = db.from('matches').select('*').order('match_date', { ascending: true }).order('created_at', { ascending: true });
  if (dateFilter) query = query.eq('match_date', dateFilter);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getVotes() {
  const { data, error } = await db.from('votes').select('*, users(name), matches(team1, team2, match_date, status, winner)').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getVotesForMatch(matchId) {
  const { data, error } = await db.from('votes').select('*, users(name)').eq('match_id', matchId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function computeLeaderboard() {
  const [users, matches, votes] = await Promise.all([getUsers(), getMatches(), getVotes()]);
  const scoreMap = new Map(users.map(u => [u.id, { id: u.id, name: u.name, points: 0 }]));
  const votesByMatch = new Map();
  for (const vote of votes) {
    if (!votesByMatch.has(vote.match_id)) votesByMatch.set(vote.match_id, []);
    votesByMatch.get(vote.match_id).push(vote);
    if (!scoreMap.has(vote.user_id)) scoreMap.set(vote.user_id, { id: vote.user_id, name: vote.users?.name || 'Unknown', points: 0 });
  }
  for (const match of matches) {
    const matchVotes = votesByMatch.get(match.id) || [];
    if (match.status === 'abandoned' || match.winner === 'abandoned') {
      matchVotes.forEach(v => scoreMap.get(v.user_id).points += 1);
      continue;
    }
    if (match.status === 'completed' && match.winner) {
      matchVotes.forEach(v => {
        if (v.selected_team === match.winner) scoreMap.get(v.user_id).points += 1;
      });
    }
  }
  return [...scoreMap.values()].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

async function renderLeaderboard() {
  const stateEl = document.getElementById('leaderboardState');
  const listEl = document.getElementById('leaderboard');
  if (!listEl) return;
  stateEl.textContent = 'Loading leaderboard...';
  listEl.innerHTML = '';
  try {
    const leaders = await computeLeaderboard();
    stateEl.textContent = leaders.length ? '' : 'No scores yet. Somebody has to click something first.';
    if (!leaders.length) return;
    const max = Math.max(...leaders.map(l => l.points), 1);
    listEl.innerHTML = `<div class="leaderboard-list">${leaders.map((item, idx) => `
      <div class="leader-row">
        <div class="rank-badge">${idx + 1}</div>
        <div>${escapeHtml(item.name)}</div>
        <div class="bar-wrap"><div class="bar-fill" style="width:${(item.points / max) * 100}%"></div></div>
        <div class="score-pill">${item.points} pt${item.points === 1 ? '' : 's'}</div>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    stateEl.textContent = `Could not load leaderboard: ${err.message}`;
  }
}

async function renderVoterPage() {
  const todayLabel = document.getElementById('todayLabel');
  const userSelect = document.getElementById('userSelect');
  const matchesContainer = document.getElementById('matchesContainer');
  const voteForm = document.getElementById('voteForm');
  const voteMessage = document.getElementById('voteMessage');
  if (!voteForm) return;
  todayLabel.textContent = todayString();
  matchesContainer.innerHTML = '<div class="muted">Loading matches...</div>';

  try {
    const [users, matches] = await Promise.all([getUsers(), getMatches(isoToday())]);
    userSelect.innerHTML = '<option value="">Select your name</option>' + users.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');

    if (!matches.length) {
      matchesContainer.innerHTML = '<div class="muted">No matches scheduled for today. Even cricket takes a day off sometimes.</div>';
      voteForm.querySelector('#submitVotesBtn').disabled = true;
      return;
    }

    const voteChecks = await Promise.all(matches.map(m => getVotesForMatch(m.id)));
    const rendered = matches.map((match, idx) => {
      const isLocked = match.status !== 'upcoming';
      const statusLabel = match.status === 'completed'
        ? `${match.winner === 'team1' ? match.team1 : match.team2} won`
        : match.status === 'abandoned'
        ? 'Abandoned'
        : 'Open for voting';
      return `
        <div class="match-card">
          <h3 class="match-title">${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h3>
          <div class="match-meta"><span class="status-${match.status}">${statusLabel}</span> · ${voteChecks[idx].length} vote${voteChecks[idx].length === 1 ? '' : 's'} submitted</div>
          <div class="team-options">
            <label class="option-pill">
              <input type="radio" name="match-${match.id}" value="team1" ${isLocked ? 'disabled' : ''} required />
              <span>${escapeHtml(match.team1)}</span>
            </label>
            <label class="option-pill">
              <input type="radio" name="match-${match.id}" value="team2" ${isLocked ? 'disabled' : ''} required />
              <span>${escapeHtml(match.team2)}</span>
            </label>
          </div>
          ${isLocked ? '<p class="muted small">Voting is locked for this match.</p>' : ''}
        </div>
      `;
    }).join('');

    matchesContainer.innerHTML = rendered;
    voteForm.querySelector('#submitVotesBtn').disabled = matches.every(m => m.status !== 'upcoming');

    voteForm.onsubmit = async (e) => {
      e.preventDefault();
      clearMessage(voteMessage);
      const userId = userSelect.value;
      const pin = document.getElementById('pinInput').value.trim();
      if (!userId || !pin) {
        showMessage(voteMessage, 'Pick your name and enter your PIN. This is not a telepathy platform.', 'error');
        return;
      }
      const selectedUser = users.find(u => u.id === userId);
      if (!selectedUser || selectedUser.pin !== pin) {
        showMessage(voteMessage, 'Wrong PIN. Nice try, ballot bandit.', 'error');
        return;
      }
      const payload = [];
      for (const match of matches.filter(m => m.status === 'upcoming')) {
        const choice = voteForm.querySelector(`input[name="match-${match.id}"]:checked`);
        if (!choice) {
          showMessage(voteMessage, `Select a winner for ${match.team1} vs ${match.team2}.`, 'error');
          return;
        }
        payload.push({ user_id: userId, match_id: match.id, selected_team: choice.value });
      }
      try {
        const { error } = await db.from('votes').upsert(payload, { onConflict: 'user_id,match_id' });
        if (error) throw error;
        showMessage(voteMessage, 'Votes submitted. Your cricket wisdom is now on record.', 'success');
        document.getElementById('pinInput').value = '';
        await Promise.all([renderLeaderboard(), renderRecentResults(), renderVoterPage()]);
      } catch (err) {
        showMessage(voteMessage, `Could not submit votes: ${err.message}`, 'error');
      }
    };
  } catch (err) {
    matchesContainer.innerHTML = `<div class="muted">Could not load today's matches: ${escapeHtml(err.message)}</div>`;
  }
}

async function renderRecentResults() {
  const stateEl = document.getElementById('recentResultsState');
  const container = document.getElementById('recentResults');
  if (!container) return;
  stateEl.textContent = 'Loading recent results...';
  container.innerHTML = '';
  try {
    const matches = await getMatches();
    const recent = matches.filter(m => m.status !== 'upcoming').sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 10);
    stateEl.textContent = recent.length ? '' : 'No results yet.';
    container.innerHTML = `<div class="result-list">${recent.map(match => `
      <div class="result-card">
        <h3 class="match-title">${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h3>
        <div class="match-meta">${escapeHtml(match.match_date)} · ${match.status === 'abandoned' || match.winner === 'abandoned' ? 'Abandoned' : `${match.winner === 'team1' ? escapeHtml(match.team1) : escapeHtml(match.team2)} won`}</div>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    stateEl.textContent = `Could not load results: ${err.message}`;
  }
}

async function renderUsersAdmin() {
  const stateEl = document.getElementById('usersState');
  const container = document.getElementById('usersList');
  if (!container) return;
  stateEl.textContent = 'Loading users...';
  container.innerHTML = '';
  try {
    const users = await getUsers();
    stateEl.textContent = users.length ? '' : 'No users yet. Your league is currently a solo documentary.';
    container.innerHTML = `<div class="users-grid">${users.map(user => `
      <div class="user-card">
        <form data-user-id="${user.id}" class="update-pin-form">
          <label>
            <span>Name</span>
            <input type="text" value="${escapeHtml(user.name)}" disabled />
          </label>
          <label>
            <span>PIN</span>
            <input name="pin" type="text" value="${escapeHtml(user.pin)}" required />
          </label>
          <button type="submit">Update PIN</button>
        </form>
      </div>
    `).join('')}</div>`;

    container.querySelectorAll('.update-pin-form').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = form.dataset.userId;
        const pin = form.querySelector('input[name="pin"]').value.trim();
        try {
          const { error } = await db.from('users').update({ pin }).eq('id', userId);
          if (error) throw error;
          alert('PIN updated. Tiny dictatorship remains intact.');
        } catch (err) {
          alert(`Could not update PIN: ${err.message}`);
        }
      });
    });
  } catch (err) {
    stateEl.textContent = `Could not load users: ${err.message}`;
  }
}

async function renderAdminMatches(dateFilter = null) {
  const stateEl = document.getElementById('matchesState');
  const container = document.getElementById('adminMatches');
  if (!container) return;
  stateEl.textContent = 'Loading matches...';
  container.innerHTML = '';
  try {
    const matches = await getMatches(dateFilter);
    stateEl.textContent = matches.length ? '' : 'No matches found for that view.';
    const html = await Promise.all(matches.map(async (match) => {
      const votes = await getVotesForMatch(match.id);
      const voteItems = votes.length
        ? votes.map(v => `<div class="vote-item"><span>${escapeHtml(v.users?.name || 'Unknown')}</span><strong>${v.selected_team === 'team1' ? escapeHtml(match.team1) : escapeHtml(match.team2)}</strong></div>`).join('')
        : '<div class="muted">No votes yet.</div>';
      return `
        <div class="match-card">
          <h3 class="match-title">${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</h3>
          <div class="match-meta">${escapeHtml(match.match_date)} · <span class="status-${match.status}">${escapeHtml(match.status)}</span>${match.winner ? ` · winner: ${match.winner === 'team1' ? escapeHtml(match.team1) : match.winner === 'team2' ? escapeHtml(match.team2) : 'Abandoned'}` : ''}</div>
          <div class="vote-grid">${voteItems}</div>
          <div class="match-admin-actions">
            <button data-action="team1" data-id="${match.id}" ${match.status !== 'upcoming' ? 'disabled' : ''}>${escapeHtml(match.team1)} won</button>
            <button data-action="team2" data-id="${match.id}" ${match.status !== 'upcoming' ? 'disabled' : ''}>${escapeHtml(match.team2)} won</button>
            <button data-action="abandoned" data-id="${match.id}" ${match.status !== 'upcoming' ? 'disabled' : ''}>Abandoned</button>
            <button data-action="reopen" data-id="${match.id}" class="ghost-btn">Reopen</button>
          </div>
        </div>
      `;
    }));
    container.innerHTML = html.join('');

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        try {
          if (action === 'reopen') {
            const { error } = await db.from('matches').update({ status: 'upcoming', winner: null }).eq('id', id);
            if (error) throw error;
          } else if (action === 'abandoned') {
            const { error } = await db.from('matches').update({ status: 'abandoned', winner: 'abandoned' }).eq('id', id);
            if (error) throw error;
          } else {
            const { error } = await db.from('matches').update({ status: 'completed', winner: action }).eq('id', id);
            if (error) throw error;
          }
          await Promise.all([renderAdminMatches(dateFilter), renderVotesOverview(), renderLeaderboard(), renderRecentResults()]);
        } catch (err) {
          alert(`Could not update result: ${err.message}`);
        }
      });
    });
  } catch (err) {
    stateEl.textContent = `Could not load matches: ${err.message}`;
  }
}

async function renderVotesOverview() {
  const stateEl = document.getElementById('votesState');
  const container = document.getElementById('votesOverview');
  if (!container) return;
  stateEl.textContent = 'Loading votes...';
  container.innerHTML = '';
  try {
    const votes = await getVotes();
    stateEl.textContent = votes.length ? '' : 'No votes submitted yet.';
    container.innerHTML = `<div class="result-list">${votes.slice(0, 100).map(v => `
      <div class="result-card">
        <h3 class="match-title">${escapeHtml(v.users?.name || 'Unknown')}</h3>
        <div class="match-meta">${escapeHtml(v.matches?.match_date || '')} · ${(v.selected_team === 'team1' ? escapeHtml(v.matches?.team1 || 'Team 1') : escapeHtml(v.matches?.team2 || 'Team 2'))}</div>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    stateEl.textContent = `Could not load votes: ${err.message}`;
  }
}

function bindAdminForms() {
  const addUserForm = document.getElementById('addUserForm');
  const addMatchForm = document.getElementById('addMatchForm');
  const bulkUploadBtn = document.getElementById('bulkUploadBtn');
  const bulkMatchesInput = document.getElementById('bulkMatchesInput');
  const adminDateFilter = document.getElementById('adminDateFilter');
  const filterMatchesBtn = document.getElementById('filterMatchesBtn');
  const showAllMatchesBtn = document.getElementById('showAllMatchesBtn');
  if (!addUserForm) return;

  document.getElementById('matchDateInput').value = isoToday();
  adminDateFilter.value = isoToday();

  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('addUserMessage');
    clearMessage(msg);
    const name = document.getElementById('adminUserName').value.trim();
    const pin = document.getElementById('adminUserPin').value.trim();
    try {
      const { error } = await db.from('users').insert({ name, pin });
      if (error) throw error;
      addUserForm.reset();
      showMessage(msg, 'User added. Another brave soul joins the prophecy league.', 'success');
      await Promise.all([renderUsersAdmin(), renderVoterPage(), renderLeaderboard()]);
    } catch (err) {
      showMessage(msg, `Could not add user: ${err.message}`, 'error');
    }
  });

  addMatchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('addMatchMessage');
    clearMessage(msg);
    const team1 = document.getElementById('team1Input').value.trim();
    const team2 = document.getElementById('team2Input').value.trim();
    const match_date = document.getElementById('matchDateInput').value;
    try {
      const { error } = await db.from('matches').insert({ team1, team2, match_date, status: 'upcoming', winner: null });
      if (error) throw error;
      addMatchForm.reset();
      document.getElementById('matchDateInput').value = isoToday();
      showMessage(msg, 'Match added. Fresh arena, fresh bad decisions.', 'success');
      await Promise.all([renderAdminMatches(), renderVoterPage(), renderRecentResults()]);
    } catch (err) {
      showMessage(msg, `Could not add match: ${err.message}`, 'error');
    }
  });

  bulkUploadBtn.addEventListener('click', async () => {
    const msg = document.getElementById('bulkUploadMessage');
    clearMessage(msg);
    try {
      const raw = bulkMatchesInput.value.trim();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error('JSON must be a non-empty array.');
      const rows = parsed.map(item => ({
        team1: item.team1,
        team2: item.team2,
        match_date: item.date || item.match_date,
        status: 'upcoming',
        winner: null,
      }));
      const { error } = await db.from('matches').insert(rows);
      if (error) throw error;
      bulkMatchesInput.value = '';
      showMessage(msg, `Uploaded ${rows.length} match${rows.length === 1 ? '' : 'es'}.`, 'success');
      await Promise.all([renderAdminMatches(), renderVoterPage(), renderRecentResults()]);
    } catch (err) {
      showMessage(msg, `Could not upload JSON: ${err.message}`, 'error');
    }
  });

  filterMatchesBtn.addEventListener('click', async () => {
    await renderAdminMatches(adminDateFilter.value || null);
  });
  showAllMatchesBtn.addEventListener('click', async () => {
    adminDateFilter.value = '';
    await renderAdminMatches();
  });

  document.getElementById('refreshUsersBtn')?.addEventListener('click', renderUsersAdmin);
  document.getElementById('refreshVotesBtn')?.addEventListener('click', renderVotesOverview);
}

function bindSharedRefreshButtons() {
  document.getElementById('refreshLeaderboardBtn')?.addEventListener('click', renderLeaderboard);
  document.getElementById('refreshRecentBtn')?.addEventListener('click', renderRecentResults);
}

async function init() {
  bindSharedRefreshButtons();
  if (document.getElementById('voteForm')) {
    await Promise.all([renderLeaderboard(), renderRecentResults(), renderVoterPage()]);
  }
  if (document.getElementById('addUserForm')) {
    bindAdminForms();
    await Promise.all([renderUsersAdmin(), renderAdminMatches(), renderVotesOverview(), renderLeaderboard(), renderRecentResults()]);
  }
}

init();
