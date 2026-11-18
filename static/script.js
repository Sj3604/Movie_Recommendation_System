const $ = (selector) => document.querySelector(selector);
const homeGrid = $('#home-grid');
const suggestions = $('#suggestions');
const searchInput = $('#search-input');
const searchButton = $('#search-button');
let suggestionsTimer;
let suggestionRequest;
let searchSerial = 0;
let toastTimer;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function movieYear(date) { return /^\d{4}/.test(date ?? '') ? date.slice(0,4) : 'Movie'; }
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 5500);
}
async function api(path, signal) {
  const response = await fetch(path, {signal});
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const data = await response.json(); message = typeof data.detail === 'string' ? data.detail : message; } catch (_) {}
    throw new Error(message);
  }
  return response.json();
}
function movieCard(movie, similarity = null) {
  const title = movie.title || 'Untitled movie';
  const tmdbId = Number.isInteger(Number(movie.tmdb_id)) ? Number(movie.tmdb_id) : null;
  const poster = movie.poster_url && movie.poster_url.startsWith('https://image.tmdb.org/')
    ? `<img src="${escapeHTML(movie.poster_url)}" alt="Poster for ${escapeHTML(title)}" loading="lazy" onerror="this.remove()" />`
    : `<div class="poster-placeholder">${escapeHTML(title)}</div>`;
  const rating = movie.vote_average > 0 ? `<span class="poster-rating"><b>★</b> ${Number(movie.vote_average).toFixed(1)}</span>` : '';
  const score = similarity != null ? ` · ${Math.round(Math.max(0, similarity) * 100)}% similarity` : '';
  const safeTitle = escapeHTML(title);
  return `<article class="movie-card" role="button" tabindex="0" data-title="${safeTitle}" ${tmdbId !== null ? `data-tmdb-id="${tmdbId}"` : ''} aria-label="Find recommendations for ${safeTitle}">
    <div class="poster-wrap">${poster}${rating}</div>
    <h3 title="${safeTitle}">${safeTitle}</h3><div class="movie-meta">${escapeHTML(movieYear(movie.release_date))}${score}</div>
  </article>`;
}
function bindMovieGrid(grid) {
  const select = (node) => {
    const title = node.dataset.title;
    if (title) chooseMovie(title);
  };
  grid.addEventListener('click', e => {
    const node = e.target.closest('.movie-card');
    if (node) select(node);
  });
  grid.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const node = e.target.closest('.movie-card');
    if (node) { e.preventDefault(); select(node); }
  });
}
['#home-grid','#tfidf-grid','#genre-grid'].forEach(selector => bindMovieGrid($(selector)));

async function loadHome(category = 'trending') {
  $('#home-status').textContent = 'Loading movies...';
  $('#home-status').classList.remove('hidden');
  homeGrid.innerHTML = '';
  try {
    const movies = await api(`/home?category=${encodeURIComponent(category)}&limit=18`);
    homeGrid.innerHTML = movies.map(m => movieCard(m)).join('');
    $('#home-status').classList.toggle('hidden', movies.length > 0);
    if (!movies.length) $('#home-status').textContent = 'No movies available for this category.';
  } catch (err) {
    $('#home-status').textContent = `Could not load movies. ${err.message}`;
  }
}
$('.category-tabs').addEventListener('click', e => {
  const button = e.target.closest('[data-category]');
  if (!button || button.classList.contains('selected')) return;
  document.querySelectorAll('.category-tab').forEach(el => {
    const active = el === button;
    el.classList.toggle('selected',active);
    el.setAttribute('aria-selected', String(active));
  });
  loadHome(button.dataset.category);
});

async function loadSuggestions(query) {
  suggestionRequest?.abort();
  suggestions.classList.add('hidden');
  if (query.trim().length < 2) return;
  suggestionRequest = new AbortController();
  try {
    const payload = await api(`/tmdb/search?query=${encodeURIComponent(query)}&page=1`, suggestionRequest.signal);
    if (searchInput.value.trim() !== query.trim()) return;
    const movies = (payload.results || []).slice(0, 7);
    if (!movies.length) return;
    suggestions.innerHTML = movies.map(m => `<button type="button" class="suggestion" role="option" data-title="${escapeHTML(m.title)}">${escapeHTML(m.title)} <small>${escapeHTML(movieYear(m.release_date))}</small></button>`).join('');
    suggestions.classList.remove('hidden');
  } catch (e) { if (e.name !== 'AbortError') suggestions.classList.add('hidden'); }
}
searchInput.addEventListener('input', () => {
  clearTimeout(suggestionsTimer);
  const query = searchInput.value.trim();
  suggestionsTimer = setTimeout(() => loadSuggestions(query), 300);
});
suggestions.addEventListener('click', e => {
  const button = e.target.closest('[data-title]');
  if (button) chooseMovie(button.dataset.title);
});
document.addEventListener('click', e => {
  if (!e.target.closest('.search-shell')) suggestions.classList.add('hidden');
});
$('#search-form').addEventListener('submit', e => {
  e.preventDefault();
  if (searchInput.value.trim()) chooseMovie(searchInput.value.trim());
});
document.querySelectorAll('[data-search]').forEach(button => button.addEventListener('click', () => chooseMovie(button.dataset.search)));

function renderSelectedMovie(movie) {
  const genres = (movie.genres || []).map(g => `<span>${escapeHTML(g.name)}</span>`).join('');
  const image = movie.poster_url?.startsWith('https://image.tmdb.org/')
    ? `<img src="${escapeHTML(movie.poster_url)}" alt="${escapeHTML(movie.title)} poster" />`
    : '<div class="detail-placeholder">NO POSTER</div>';
  $('#selected-movie').innerHTML = `<div class="selected-film">${image}<div><div class="selected-label">NOW DISCOVERING</div><h2>${escapeHTML(movie.title)}</h2><div class="film-tags"><span>${escapeHTML(movieYear(movie.release_date))}</span>${genres}</div><p>${escapeHTML(movie.overview || 'Explore similar movies with our recommendation engine.')}</p></div></div>`;
}
function renderRecommendations(data) {
  renderSelectedMovie(data.movie_details);
  $('#based-on-title').textContent = data.movie_details.title;
  const tfidfItems = data.tfidf_recommendations || [];
  $('#tfidf-grid').innerHTML = tfidfItems.length ? tfidfItems.map(item => movieCard(item.tmdb || {title:item.title}, item.score)).join('') : '<p class="empty-state">This title is not in the local TF-IDF dataset, so content-based recommendations aren’t available for it. Try Toy Story, Inception, or another movie from the dataset.</p>';
  $('#genre-grid').innerHTML = (data.genre_recommendations || []).length ? data.genre_recommendations.map(m => movieCard(m)).join('') : '<p class="empty-state">No genre-based suggestions found for this title.</p>';
  $('#tfidf-section').classList.remove('hidden');
  $('#genre-section').classList.remove('hidden');
}
async function chooseMovie(title) {
  const serial = ++searchSerial;
  searchInput.value = title;
  suggestions.classList.add('hidden');
  suggestionRequest?.abort();
  searchButton.disabled = true;
  searchButton.textContent = 'Finding...';
  $('#recommendations').classList.remove('hidden');
  $('#selected-movie').innerHTML = '<div class="loading-message">Finding movies you might love...</div>';
  $('#tfidf-section').classList.add('hidden');
  $('#genre-section').classList.add('hidden');
  $('#recommendations').scrollIntoView({behavior:'smooth', block:'start'});
  try {
    const payload = await api(`/movie/search?query=${encodeURIComponent(title)}&tfidf_top_n=12&genre_limit=12`);
    if (serial !== searchSerial) return;
    renderRecommendations(payload);
  } catch (err) {
    if (serial !== searchSerial) return;
    $('#selected-movie').innerHTML = `<div class="empty-state">Could not load recommendations: ${escapeHTML(err.message)}. Please try a different movie.</div>`;
    toast('Unable to load movie recommendations.');
  } finally {
    if (serial === searchSerial) {
      searchButton.disabled = false;
      searchButton.innerHTML = 'Find movies <span aria-hidden="true">↗</span>';
    }
  }
}
loadHome();
