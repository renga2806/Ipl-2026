
const SUPABASE_URL = 'https://gpqrpjyknsgrgyyejpcd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcXJwanlrbnNncmd5eWVqcGNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NDc5NTQsImV4cCI6MjA5MDAyMzk1NH0.wlumoNLh5G-SI8YxLLmNzOPLxAN1KBedjp8aJwCW5ZA';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEAM_NAMES = {
  CSK: 'Chennai Super Kings',
  MI: 'Mumbai Indians',
  RCB: 'Royal Challengers Bengaluru',
  KKR: 'Kolkata Knight Riders',
  DC: 'Delhi Capitals',
  SRH: 'Sunrisers Hyderabad',
  PBKS: 'Punjab Kings',
  RR: 'Rajasthan Royals',
  GT: 'Gujarat Titans',
  LSG: 'Lucknow Super Giants',
};

const TEAM_LOGOS = {
  CSK: 'assets/logos/csk.png',
  MI: 'assets/logos/mi.png',
  RCB: 'assets/logos/rcb.png',
  KKR: 'assets/logos/kkr.png',
  DC: 'assets/logos/dc.png',
  SRH: 'assets/logos/srh.png',
  PBKS: 'assets/logos/pbks.png',
  RR: 'assets/logos/rr.png',
  GT: 'assets/logos/gt.png',
  LSG: 'assets/logos/lsg.png',
};

const ADMIN_TEAM_LOGOS = Object.fromEntries(
  Object.entries(TEAM_LOGOS).map(([key, value]) => [key, `../${value}`])
);

const pageType = document.body.dataset.page || 'voter';

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const todayString = () =>
  new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const isoToday = () => new Date().toISOString().split('T')[0];

function normalizeTeamCode(value = '') {
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (TEAM_NAMES[upper]) return upper;

  const aliases = {
    'CHENNAI SUPER KINGS': 'CSK',
    'MUMBAI INDIANS': 'MI',
    'ROYAL CHALLENGERS BANGALORE': 'RCB',
    'ROYAL CHALLENGERS BENGALURU': 'RCB',
    'KOLKATA KNIGHT RIDERS': 'KKR',
    'DELHI CAPITALS': 'DC',
    'SUNRISERS HYDERABAD': 'SRH',
    'PUNJAB KINGS': 'PBKS',
    'RAJASTHAN ROYALS': 'RR',
    'GUJARAT TITANS': 'GT',
    'LUCKNOW SUPER GIANTS': 'LSG',
  };

  return aliases[upper] || raw;
}

function teamDisplayName(code) {
  return TEAM_NAMES[normalizeTeamCode(code)] || String(code || '').trim() || 'Unknown Team';
}

function logoPathForTeam(code) {
  const map = pageType === 'admin' ? ADMIN_TEAM_LOGOS : TEAM_LOGOS;
  const normalized = normalizeTeamCode(code);
  return map[normalized] || (pageType === 'admin' ? '../assets/logos/default.png' : 'assets/logos/default.png');
}

function teamMarkup(code, className = 'team-inline') {
  const normalized = normalizeTeamCode(code);
  return `
    <span class="${className}">
      <img class="team-logo" src="${logoPathForTeam(normalized)}" alt="${escapeHtml(teamDisplayName(normalized))} logo" />
      <span class="team-name">${escapeHtml(teamDisplayName(normalized))}</span>
    </span>
  `;
}

function showMessage(el, text, type = 'success') {
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
  const { data, error } = await db.from('users').select('*').order('name', { ascending: true });
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
  const { data, error } = await db
    .from('votes')
    .select('*, users(name), matches(team1, team2, match_date, status, winner)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getVotesForMatch(matchId) {
  const { data, error } = await db
    .from('votes')
    .select('*, users(name)')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function computeLeaderboard() {
  const [users, matches, votes] = await Promise.all([getUsers(), getMatches(), getVotes()]);
  const scoreMap = new Map(users.map((user) => [user.id, { id: user.id, name: user.name, points: 0 }]));
  const votesByMatch = new Map();

  for (const vote of votes) {
    if (!votesByMatch.has(vote.match_id)) votesByMatch.set(vote.match_id, []);
    votesByMatch.get(vote.match_id).push(vote);
    if (!scoreMap.has(vote.user_id)) {
      scoreMap.set(vote.user_id, { id: vote.user_id, name: vote.users?.name || 'Unknown', points: 0 });
    }
  }

  for (const match of matches) {
    const matchVotes = votesByMatch.get(match.id) || [];
    if (match.status === 'abandoned' || match.winner === 'abandoned') {
      matchVotes.forEach((vote) => {
        if (scoreMap.has(vote.user_id)) scoreMap.get(vote.user_id).points += 1;
      });
      continue;
    }

    if (match.status === 'completed' && match.winner) {
      matchVotes.forEach((vote) => {
        if (vote.selected_team === match.winner && scoreMap.has(vote.user_id)) {
          scoreMap.get(vote.user_id).points += 1;
        }
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
    stateEl.textContent = leaders.length ? '' : 'No scores yet. Somebody still has to click something.';
    if (!leaders.length) return;

    const max = Math.max(...leaders.map((item) => item.points), 1);

    listEl.innerHTML = leaders
      .map((item, index) => `
        <article class="leader-row">
          <div class="rank-badge rank-${index + 1}">${index + 1}</div>
          <div class="leader-name">${escapeHtml(item.name)}</div>
          <div class="bar-wrap"><div class="bar-fill" style="width: ${(item.points / max) * 100}%"></div></div>
          <div class="score-pill">${item.points}</div>
        </article>
      `)
      .join('');
  } catch (error) {
    stateEl.textContent = `Could not load leaderboard: ${error.message}`;
  }
}

async function renderRecentResults() {
  const stateEl = document.getElementById('resultsState');
  const listEl = document.getElementById('recentResults');
  if (!listEl) return;

  stateEl.textContent = 'Loading recent results...';
  listEl.innerHTML = '';

  try {
    const matches = await getMatches();
    const recent = matches
      .filter((match) => match.status === 'completed' || match.status === 'abandoned')
      .sort((a, b) => new Date(b.match_date) - new Date(a.match_date))
      .slice(0, 10);

    stateEl.textContent = recent.length ? '' : 'No completed matches yet. Suspense everywhere.';
    if (!recent.length) return;

    listEl.innerHTML = recent
      .map((match) => {
        const summary =
          match.status === 'abandoned' || match.winner === 'abandoned'
            ? 'Match abandoned. Anyone who voted gets a point.'
            : `${teamDisplayName(match[match.winner])} won the match.`;
        return `
          <article class="result-card">
            <div class="match-head">
              <p class="mini-label">${escapeHtml(match.match_date)}</p>
              <span class="status-pill status-${escapeHtml(match.status)}">${escapeHtml(match.status)}</span>
            </div>
            <div class="team-vs">
              ${teamMarkup(match.team1, 'team-block')}
              <span class="vs-pill">vs</span>
              ${teamMarkup(match.team2, 'team-block')}
            </div>
            <div class="result-summary">
              <span class="pill">${escapeHtml(summary)}</span>
            </div>
          </article>
        `;
      })
      .join('');
  } catch (error) {
    stateEl.textContent = `Could not load results: ${error.message}`;
  }
}

function updateSelectedCards(scope = document) {
  const cards = scope.querySelectorAll('.option-card');
  cards.forEach((card) => {
    const input = card.querySelector('input[type="radio"]');
    card.classList.toggle('is-selected', Boolean(input?.checked));
  });
}

async function renderVoterPage() {
  //const todayLabel = document.getElementById('todayLabel');
  const userSelect = document.getElementById('userSelect');
  const matchesContainer = document.getElementById('matchesContainer');
  const voteForm = document.getElementById('voteForm');
  const voteMessage = document.getElementById('voteMessage');
  //const userCountEl = document.getElementById('userCount');
  //const todayMatchCountEl = document.getElementById('todayMatchCount');
  if (!voteForm) return;

  //todayLabel.textContent = todayString();
  matchesContainer.innerHTML = '<div class="empty-state">Loading matches...</div>';

  try {
    const [users, matches] = await Promise.all([getUsers(), getMatches(isoToday())]);
    userSelect.innerHTML =
      '<option value="">Select your name</option>' +
      users.map((user) => `<option value="${user.id}">${escapeHtml(user.name)}</option>`).join('');

    //userCountEl.textContent = String(users.length);
    //todayMatchCountEl.textContent = String(matches.length);

    if (!matches.length) {
      matchesContainer.innerHTML = '<div class="empty-state">No matches scheduled for today. Even cricket takes a day off sometimes.</div>';
      document.getElementById('submitVotesBtn').disabled = true;
      return;
    }

    const voteGroups = await Promise.all(matches.map((match) => getVotesForMatch(match.id)));
    matchesContainer.innerHTML = matches
      .map((match, index) => {
        const isLocked = match.status !== 'upcoming';
        const totalVotes = voteGroups[index].length;
        const statusText = isLocked ? "Match in progress" :
          match.status === 'completed'
            ? `${teamDisplayName(match[match.winner])} won`
            : match.status === 'abandoned'
              ? 'Abandoned'
              : 'Open for voting';

        return `
          <article class="match-card">
            <div class="match-head">
              <p class="mini-label">${escapeHtml(match.match_date)}</p>
              <span class="status-pill status-${escapeHtml(match.status)}">${escapeHtml(statusText)}</span>
            </div>
            <h3 class="match-title">
              <div class="team-vs">
                ${teamMarkup(match.team1, 'team-block')}
                <span class="vs-pill">vs</span>
                ${teamMarkup(match.team2, 'team-block')}
              </div>
            </h3>
            <p class="match-meta">${totalVotes} vote${totalVotes === 1 ? '' : 's'} submitted</p>

            <div class="team-options">
              <label class="option-card">
                <input type="radio" name="match-${match.id}" value="team1" ${isLocked ? 'disabled' : ''} />
                <span class="option-help">Back ${escapeHtml(teamDisplayName(match.team1))}!</span>
              </label>

              <label class="option-card">
                <input type="radio" name="match-${match.id}" value="team2" ${isLocked ? 'disabled' : ''} />
                <span class="option-help">Go ${escapeHtml(teamDisplayName(match.team2))}!</span>
              </label>
            </div>

            ${isLocked ? '<p class="muted small">Voting is locked for this match.</p>' : ''}
          </article>
        `;
      })
      .join('');

    updateSelectedCards(matchesContainer);
    matchesContainer.addEventListener('change', () => updateSelectedCards(matchesContainer));
  } catch (error) {
    console.log(error);
    matchesContainer.innerHTML = `<div class="empty-state">Could not load matches: ${escapeHtml(error.message)}</div>`;
  }

  voteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage(voteMessage);

    const userId = userSelect.value;
    const pin = document.getElementById('pinInput').value.trim();

    if (!userId || !pin) {
      showMessage(voteMessage, 'Pick your name and enter the PIN. Revolutionary stuff.', 'error');
      return;
    }

    try {
      const users = await getUsers();
      const selectedUser = users.find((user) => user.id === userId);
      if (!selectedUser || String(selectedUser.pin) !== pin) {
        showMessage(voteMessage, 'Wrong PIN. The app remains unconvinced.', 'error');
        return;
      }

      const todayMatches = await getMatches(isoToday());
      const openMatches = todayMatches.filter((match) => match.status === 'upcoming');
      const voteRows = [];

      for (const match of openMatches) {
        const selected = voteForm.querySelector(`input[name="match-${match.id}"]:checked`);
        if (!selected) continue;
        voteRows.push({
          user_id: userId,
          match_id: match.id,
          selected_team: selected.value,
        });
      }

      if (!voteRows.length) {
        showMessage(voteMessage, 'Pick at least one open match before submitting. Wild concept, I know.', 'error');
        return;
      }

      const { error } = await db.from('votes').upsert(voteRows, { onConflict: 'user_id,match_id' });
      if (error) throw error;

      showMessage(voteMessage, 'Votes submitted. Your cricket wisdom is now on record.');
      voteForm.reset();
      updateSelectedCards(matchesContainer);
      await Promise.all([renderLeaderboard(), renderRecentResults(), renderVoterPage()]);
    } catch (error) {
      showMessage(voteMessage, `Could not submit votes: ${error.message}`, 'error');
    }
  });
}

async function renderAdminUsers() {
  const usersList = document.getElementById('usersList');
  const countEl = document.getElementById('adminUserCount');
  if (!usersList) return;

  try {
    const users = await getUsers();
    countEl.textContent = String(users.length);
    if (!users.length) {
      usersList.innerHTML = '<div class="empty-state">No users yet. Start with the people who yell the loudest in the group.</div>';
      return;
    }

    usersList.innerHTML = users
      .map((user) => `
        <article class="user-card">
          <h3>${escapeHtml(user.name)}</h3>
          <form data-user-update-form="${user.id}">
            <label>
              <span>Name</span>
              <input name="name" value="${escapeHtml(user.name)}" />
            </label>
            <label>
              <span>PIN</span>
              <input name="pin" value="${escapeHtml(user.pin)}" />
            </label>
            <button type="submit">Update</button>
          </form>
          <div class="message hidden" data-user-message="${user.id}"></div>
        </article>
      `)
      .join('');

    usersList.querySelectorAll('form[data-user-update-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const userId = form.getAttribute('data-user-update-form');
        const name = form.querySelector('[name="name"]').value.trim();
        const pin = form.querySelector('[name="pin"]').value.trim();
        const msgEl = usersList.querySelector(`[data-user-message="${userId}"]`);
        clearMessage(msgEl);

        if (!name || !pin) {
          showMessage(msgEl, 'Name and PIN are required.', 'error');
          return;
        }

        try {
          const { error } = await db.from('users').update({ name, pin }).eq('id', userId);
          if (error) throw error;
          showMessage(msgEl, 'Updated. Tiny admin empire maintained.');
          await Promise.all([renderAdminUsers(), renderLeaderboard(), renderVoterPage()]);
        } catch (error) {
          showMessage(msgEl, `Could not update user: ${error.message}`, 'error');
        }
      });
    });
  } catch (error) {
    usersList.innerHTML = `<div class="empty-state">Could not load users: ${escapeHtml(error.message)}</div>`;
  }
}

function resultButtonMarkup(match) {
  return `
    <div class="match-actions">
      <button type="button" data-result="${match.id}:team1">${escapeHtml(teamDisplayName(match.team1))} won</button>
      <button type="button" data-result="${match.id}:team2">${escapeHtml(teamDisplayName(match.team2))} won</button>
      <button type="button" class="ghost-btn" data-result="${match.id}:abandoned">Mark abandoned</button>
      <button type="button" class="ghost-btn" data-result="${match.id}:upcoming">Reopen match</button>
      <button type="button" class="ghost-btn" data-result="${match.id}:locked">Close voting</button>
    </div>
  `;
}

async function renderAdminMatches() {
  const stateEl = document.getElementById('matchesAdminState');
  const listEl = document.getElementById('adminMatchesList');
  const openCountEl = document.getElementById('openMatchCount');
  const voteCountEl = document.getElementById('adminVoteCount');
  if (!listEl) return;

  stateEl.textContent = 'Loading matches...';
  listEl.innerHTML = '';

  try {
    const [matches, votes] = await Promise.all([getMatches(), getVotes()]);
    openCountEl.textContent = String(matches.filter((match) => match.status === 'upcoming').length);
    voteCountEl.textContent = String(votes.length);

    if (!matches.length) {
      stateEl.textContent = 'No matches yet.';
      return;
    }

    const votesByMatch = new Map();
    votes.forEach((vote) => {
      if (!votesByMatch.has(vote.match_id)) votesByMatch.set(vote.match_id, []);
      votesByMatch.get(vote.match_id).push(vote);
    });

    stateEl.textContent = '';

    listEl.innerHTML = matches
      .map((match) => {
        const matchVotes = votesByMatch.get(match.id) || [];
        return `
          <article class="match-card">
            <div class="match-head">
              <p class="mini-label">${escapeHtml(match.match_date)}</p>
              <span class="status-pill status-${escapeHtml(match.status)}">${escapeHtml(match.status)}</span>
            </div>
            <h3 class="match-title">
              <div class="team-vs">
                ${teamMarkup(match.team1, 'team-block')}
                <span class="vs-pill">vs</span>
                ${teamMarkup(match.team2, 'team-block')}
              </div>
            </h3>

            <div class="vote-breakdown">
              <span class="pill">${matchVotes.length} vote${matchVotes.length === 1 ? '' : 's'}</span>
              ${
                match.status === 'completed'
                  ? `<span class="pill">${escapeHtml(teamDisplayName(match[match.winner]))} won</span>`
                  : ''
              }
              ${
                match.status === 'abandoned'
                  ? '<span class="pill">Abandoned</span>'
                  : ''
              }
            </div>

            ${resultButtonMarkup(match)}

            <div class="vote-feed" style="margin-top: 12px;">
              ${
                matchVotes.length
                  ? matchVotes
                      .map((vote) => `
                        <div class="vote-item">
                          <div>
                            <strong>${escapeHtml(vote.users?.name || 'Unknown')}</strong>
                            <span class="muted small">Picked ${escapeHtml(teamDisplayName(match[vote.selected_team]))}</span>
                          </div>
                        </div>
                      `)
                      .join('')
                  : '<div class="empty-state">No votes yet for this match.</div>'
              }
            </div>
          </article>
        `;
      })
      .join('');

    listEl.querySelectorAll('[data-result]').forEach((button) => {
      button.addEventListener('click', async () => {
        const [matchId, statusValue] = button.getAttribute('data-result').split(':');

        let updatePayload;
        if (statusValue === 'abandoned') {
          updatePayload = { status: 'abandoned', winner: 'abandoned' };
        } else if (statusValue === 'upcoming') {
          updatePayload = { status: 'upcoming', winner: null };
        } else if (statusValue === 'locked') {
          updatePayload = { status: 'locked', winner: null };
        } else {
          updatePayload = { status: 'completed', winner: statusValue };
        }

        try {
          const { error } = await db.from('matches').update(updatePayload).eq('id', matchId);
          if (error) throw error;
          await Promise.all([
            renderAdminMatches(),
            renderRecentResults(),
            renderLeaderboard(),
            renderVoterPage(),
            renderVotesFeed(),
          ]);
        } catch (error) {
          alert(`Could not update result: ${error.message}`);
        }
      });
    });
  } catch (error) {
    stateEl.textContent = `Could not load matches: ${error.message}`;
  }
}

async function renderVotesFeed() {
  const stateEl = document.getElementById('votesAdminState');
  const listEl = document.getElementById('votesList');
  if (!listEl) return;

  stateEl.textContent = 'Loading votes...';
  listEl.innerHTML = '';

  try {
    const votes = await getVotes();
    stateEl.textContent = votes.length ? '' : 'No votes yet. The confidence is still buffering.';
    if (!votes.length) return;

    listEl.innerHTML = votes.slice(0, 50).map((vote) => {
      const match = vote.matches || {};
      const pickedTeam = match[vote.selected_team];
      return `
        <article class="vote-item">
          <div>
            <strong>${escapeHtml(vote.users?.name || 'Unknown')}</strong>
            <div class="muted small">
              ${escapeHtml(match.match_date || '')} · ${escapeHtml(teamDisplayName(match.team1))} vs ${escapeHtml(teamDisplayName(match.team2))}
            </div>
          </div>
          <div class="pill">Picked ${escapeHtml(teamDisplayName(pickedTeam))}</div>
        </article>
      `;
    }).join('');
  } catch (error) {
    stateEl.textContent = `Could not load votes: ${error.message}`;
  }
}

async function setupAdminForms() {
  const addUserForm = document.getElementById('addUserForm');
  const addMatchForm = document.getElementById('addMatchForm');
  const jsonUploadForm = document.getElementById('jsonUploadForm');

  if (addUserForm) {
    const messageEl = document.getElementById('addUserMessage');
    addUserForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessage(messageEl);

      const name = document.getElementById('newUserName').value.trim();
      const pin = document.getElementById('newUserPin').value.trim();

      if (!name || !pin) {
        showMessage(messageEl, 'Name and PIN are required.', 'error');
        return;
      }

      try {
        const { error } = await db.from('users').insert({ name, pin });
        if (error) throw error;
        addUserForm.reset();
        showMessage(messageEl, 'User added.');
        await Promise.all([renderAdminUsers(), renderLeaderboard(), renderVoterPage()]);
      } catch (error) {
        showMessage(messageEl, `Could not add user: ${error.message}`, 'error');
      }
    });
  }

  if (addMatchForm) {
    const messageEl = document.getElementById('addMatchMessage');
    addMatchForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessage(messageEl);

      const team1 = normalizeTeamCode(document.getElementById('team1Input').value.trim());
      const team2 = normalizeTeamCode(document.getElementById('team2Input').value.trim());
      const date = document.getElementById('matchDateInput').value;

      if (!team1 || !team2 || !date) {
        showMessage(messageEl, 'Both teams and date are required.', 'error');
        return;
      }

      try {
        const { error } = await db.from('matches').insert({
          team1,
          team2,
          match_date: date,
          status: 'upcoming',
        });
        if (error) throw error;
        addMatchForm.reset();
        showMessage(messageEl, 'Match added.');
        await Promise.all([renderAdminMatches(), renderRecentResults(), renderVoterPage()]);
      } catch (error) {
        showMessage(messageEl, `Could not add match: ${error.message}`, 'error');
      }
    });
  }

  if (jsonUploadForm) {
    const messageEl = document.getElementById('jsonUploadMessage');
    jsonUploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearMessage(messageEl);

      const raw = document.getElementById('matchesJsonInput').value.trim();
      if (!raw) {
        showMessage(messageEl, 'Paste a JSON array first.', 'error');
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || !parsed.length) {
          throw new Error('JSON must be a non-empty array.');
        }

        const rows = parsed.map((item) => {
          const team1 = normalizeTeamCode(item.team1 || item.teamA);
          const team2 = normalizeTeamCode(item.team2 || item.teamB);
          const date = item.date || item.match_date;
          if (!team1 || !team2 || !date) throw new Error('Every row needs team1, team2, and date.');
          return { team1, team2, match_date: date, status: 'upcoming' };
        });

        const { error } = await db.from('matches').insert(rows);
        if (error) throw error;
        jsonUploadForm.reset();
        showMessage(messageEl, `Uploaded ${rows.length} match${rows.length === 1 ? '' : 'es'}.`);
        await Promise.all([renderAdminMatches(), renderRecentResults(), renderVoterPage()]);
      } catch (error) {
        showMessage(messageEl, `Could not upload JSON: ${error.message}`, 'error');
      }
    });
  }
}

async function initVoterPage() {
  await Promise.all([renderLeaderboard(), renderRecentResults(), renderVoterPage()]);

  document.getElementById('refreshAllBtn')?.addEventListener('click', async () => {
    await Promise.all([renderLeaderboard(), renderRecentResults(), renderVoterPage()]);
  });

  document.getElementById('refreshResultsBtn')?.addEventListener('click', renderRecentResults);
}

async function initAdminPage() {
  await Promise.all([renderAdminUsers(), renderAdminMatches(), renderVotesFeed()]);
  setupAdminForms();

  document.getElementById('refreshAdminBtn')?.addEventListener('click', async () => {
    await Promise.all([renderAdminUsers(), renderAdminMatches(), renderVotesFeed()]);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (pageType === 'admin') {
    await initAdminPage();
  } else {
    await initVoterPage();
  }
});
