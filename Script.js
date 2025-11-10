// Mobile Prop Analyzer - extended with flexible Odds API caller.
// Works client-side. You can use the provided API key field to call your odds provider.

const searchBtn = document.getElementById('searchBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const clearBtn = document.getElementById('clearBtn');
const fetchOddsBtn = document.getElementById('fetchOddsBtn');

const playerNameInput = document.getElementById('playerName');
const gamesToUseInput = document.getElementById('gamesToUse');
const propTypeInput = document.getElementById('propType');
const bookLineInput = document.getElementById('bookLine');
const decimalOddsInput = document.getElementById('decimalOdds');

const apiKeyInput = document.getElementById('apiKey');
const oddsTemplateInput = document.getElementById('oddsTemplate');

const resultsSection = document.getElementById('results');
const playerInfoDiv = document.getElementById('playerInfo');
const statsSummaryDiv = document.getElementById('statsSummary');
const analysisDiv = document.getElementById('analysis');

const oddsBox = document.getElementById('oddsBox');
const oddsRaw = document.getElementById('oddsRaw');

let currentPlayer = null;
let recentGames = [];

// ---------- PREFILL the API key you gave (you can change/remove it) ----------
apiKeyInput.value = 'b9abfc7c5858af5183a69ce1611aa73b';
// ---------------------------------------------------------------------------

searchBtn.addEventListener('click', async () => {
  const q = playerNameInput.value.trim();
  if (!q) { alert('Type a player name'); return; }
  await findPlayer(q);
});

analyzeBtn.addEventListener('click', async () => {
  if (!currentPlayer) { alert('Search & select a player first'); return; }
  const n = parseInt(gamesToUseInput.value,10);
  const prop = propTypeInput.value;
  const line = parseFloat(bookLineInput.value);
  const odds = parseFloat(decimalOddsInput.value) || null;
  await loadRecentGames(currentPlayer.id, n);
  if (recentGames.length === 0) { alert('No recent games found'); return; }
  const values = recentGames.map(gs => prop === 'pts' ? gs.pts : (prop === 'reb' ? gs.reb : gs.ast));
  const mean = meanOf(values);
  const sd = sampleStd(values);
  showResults(currentPlayer, values, mean, sd, prop, line, odds);
});

clearBtn.addEventListener('click', () => {
  currentPlayer = null;
  recentGames = [];
  resultsSection.classList.add('hidden');
  playerInfoDiv.innerHTML = '';
  statsSummaryDiv.innerHTML = '';
  analysisDiv.innerHTML = '';
  oddsBox.classList.add('hidden');
  oddsRaw.textContent = '';
});

// Odds fetch: user provides template. Template tokens: {apikey}, {player}, {team}
// Example template: https://api.example.com/odds?apikey={apikey}&player={player}
fetchOddsBtn.addEventListener('click', async () => {
  const q = playerNameInput.value.trim();
  if (!q) { alert('Type a player name (used to search odds)'); return; }
  const tpl = oddsTemplateInput.value.trim();
  const key = apiKeyInput.value.trim();
  if (!tpl) { alert('Paste your odds API URL template (see help text)'); return; }
  // Replace tokens
  const url = tpl.replace(/\{apikey\}/g, encodeURIComponent(key))
                 .replace(/\{player\}/g, encodeURIComponent(q))
                 .replace(/\{team\}/g, encodeURIComponent(currentPlayer ? currentPlayer.team.abbreviation : ''));
  // Attempt a fetch
  showLoading('Fetching odds...');
  try {
    const resp = await fetch(url, { method: 'GET' });
    const text = await resp.text();
    // Try parse JSON, otherwise show raw
    try {
      const json = JSON.parse(text);
      oddsRaw.textContent = JSON.stringify(json, null, 2);
    } catch (e) {
      oddsRaw.textContent = text;
    }
    oddsBox.classList.remove('hidden');
    hideLoading();
    alert('Odds API response loaded into the "Odds API Response" box. Inspect raw JSON to map fields to decimal odds.');
  } catch (err) {
    hideLoading();
    alert('Odds request failed. Check template or network.');
    console.error(err);
  }
});

// ---------- balldontlie player search & stats ----------
async function findPlayer(query) {
  showLoading('Searching player...');
  try {
    const resp = await fetch(`https://www.balldontlie.io/api/v1/players?search=${encodeURIComponent(query)}`);
    const data = await resp.json();
    if (!data || !data.data || data.data.length === 0) { hideLoading(); alert('No players found'); return; }
    currentPlayer = data.data[0];
    playerInfoDiv.innerHTML = `
      <strong>${currentPlayer.first_name} ${currentPlayer.last_name}</strong>
      <div class="small muted">Team: ${currentPlayer.team.abbreviation} • Pos: ${currentPlayer.position || 'N/A'}</div>
    `;
    resultsSection.classList.remove('hidden');
    hideLoading();
  } catch (e) {
    hideLoading();
    alert('Player search error');
    console.error(e);
  }
}

async function loadRecentGames(playerId, count) {
  showLoading('Loading recent games...');
  recentGames = [];
  try {
    // Request per_page=100 stats and take the most recent 'count'
    const resp = await fetch(`https://www.balldontlie.io/api/v1/stats?per_page=100&player_ids[]=${playerId}`);
    const data = await resp.json();
    if (!data || !data.data) { hideLoading(); return; }
    const mapped = data.data
      .map(s => ({
        pts: s.pts,
        reb: s.reb,
        ast: s.ast,
        date: s.game?.date ? new Date(s.game.date) : null
      }))
      .filter(x => x.date !== null)
      .sort((a,b)=> b.date - a.date);
    recentGames = mapped.slice(0, count);
    hideLoading();
  } catch (e) {
    hideLoading();
    alert('Error loading games');
    console.error(e);
  }
}

// ---------- math, stats, display ----------
function meanOf(arr){
  if (!arr.length) return 0;
  let sum = 0;
  for (let v of arr) sum += Number(v || 0);
  return sum / arr.length;
}
function sampleStd(arr){
  if (arr.length <= 1) return 0.0;
  const m = meanOf(arr);
  let s = 0;
  for (let v of arr) {
    const d = (Number(v||0) - m);
    s += d*d;
  }
  return Math.sqrt(s / (arr.length - 1));
}
function normalCdf(x, mean=0, sd=1){
  if (sd === 0) return x < mean ? 0 : 1;
  const z = (x - mean) / (sd * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign * y;
}
function showResults(player, values, mean, sd, prop, line, odds){
  playerInfoDiv.innerHTML = `
    <strong>${player.first_name} ${player.last_name}</strong>
    <div class="small muted">Using ${values.length} games • values: [${values.join(', ')}]</div>
  `;
  statsSummaryDiv.innerHTML = `
    <div><strong>Projection (mean):</strong> ${round(mean,2)}</div>
    <div><strong>Sample SD:</strong> ${round(sd,2)}</div>
    <div><strong>Min / Max (used):</strong> ${Math.min(...values)} / ${Math.max(...values)}</div>
  `;
  let html = '';
  if (typeof line === 'number' && !isNaN(line)) {
    const pExceed = 1 - normalCdf(line, mean, sd);
    let marketProb = null;
    if (oddsValid(odds)) {
      marketProb = 1 / odds;
    }
    if (marketProb !== null) {
      const modelProb = pExceed;
      const edge = (modelProb - marketProb) / marketProb;
      html += `<div><strong>Model prob to exceed line:</strong> ${(modelProb*100).toFixed(1)}%</div>`;
      html += `<div><strong>Market implied prob:</strong> ${(marketProb*100).toFixed(1)}%</div>`;
      html += `<div><strong>Edge vs market:</strong> ${(edge*100).toFixed(1)}%</div>`;
      // Kelly
      const b = odds - 1;
      const k = ((modelProb * b) - (1 - modelProb)) / b;
      const kPct = k > 0 ? (k*100).toFixed(1) : '0.0';
      html += `<div><strong>Kelly fraction:</strong> ${kPct}% of bankroll (raw)</div>`;
    } else {
      html += `<div><strong>Model prob to exceed line:</strong> ${(pExceed*100).toFixed(1)}% (enter decimal odds for edge & Kelly)</div>`;
    }
  } else {
    html += `<div><strong>Projection:</strong> ${round(mean,2)} (enter sportsbook line to compute probability & edge)</div>`;
  }
  analysisDiv.innerHTML = html;
  resultsSection.classList.remove('hidden');
}

function round(v, d=2){
  const p = Math.pow(10, d);
  return Math.round(v*p)/p;
}
function showLoading(msg='') {
  searchBtn.disabled = true;
  analyzeBtn.disabled = true;
  fetchOddsBtn.disabled = true;
  searchBtn.textContent = '...';
}
function hideLoading() {
  searchBtn.disabled = false;
  analyzeBtn.disabled = false;
  fetchOddsBtn.disabled = false;
  searchBtn.textContent = 'Search';
}
function oddsValid(o) { return o && !isNaN(o) && o > 1; }
