
const $ = (selector) => document.querySelector(selector);

const homeGrid = $("#home-grid");
const suggestions = $("#suggestions");
const searchInput = $("#search-input");
const searchButton = $("#search-button");

let suggestionsTimer;
let suggestionRequest;
let searchSerial = 0;
let toastTimer;
let homeSerial = 0;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[ch]));
}

function movieYear(date) {
    return /^\d{4}/.test(date ?? "")
        ? String(date).slice(0, 4)
        : "Movie";
}

function posterURL(url) {
    if (typeof url !== "string") return null;

    try {
        const parsed = new URL(url);

        if (
            parsed.protocol === "https:" &&
            parsed.hostname === "image.tmdb.org" &&
            parsed.pathname.startsWith("/t/p/")
        ) {
            return parsed.href;
        }
    } catch {
        return null;
    }

    return null;
}

function toast(message) {
    const element = $("#toast");
    if (!element) return;

    element.textContent = message;
    element.classList.remove("hidden");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        element.classList.add("hidden");
    }, 5500);
}

async function api(path, signal) {
    const response = await fetch(path, {
        signal,
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        let message = `Request failed (${response.status})`;

        try {
            const data = await response.json();
            if (typeof data.detail === "string") {
                message = data.detail;
            }
        } catch {
            // Use the original HTTP error message.
        }

        throw new Error(message);
    }

    return response.json();
}

function movieCard(movie, similarity = null) {
    const title = movie.title || "Untitled movie";
    const safeTitle = escapeHTML(title);
    const imageURL = posterURL(movie.poster_url);

    const poster = imageURL
        ? `
            <img
                src="${escapeHTML(imageURL)}"
                alt="${safeTitle} poster"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"
            >
            <div class="poster-placeholder hidden">
                ${safeTitle}
            </div>
        `
        : `
            <div class="poster-placeholder">
                ${safeTitle}
            </div>
        `;

    const rating = Number(movie.vote_average) > 0
        ? `
            <span class="poster-rating">
                <b>★</b>
                ${Number(movie.vote_average).toFixed(1)}
            </span>
        `
        : "";

    const score = similarity !== null &&
                  Number.isFinite(Number(similarity))
        ? ` · ${Math.round(
            Math.max(0, Math.min(1, Number(similarity))) * 100
        )}% similarity`
        : "";

    return `
        <article
            class="movie-card"
            tabindex="0"
            role="button"
            data-title="${safeTitle}"
            aria-label="Find movies similar to ${safeTitle}"
        >
            <div class="poster-wrap">
                ${poster}
                ${rating}
            </div>

            <h3 title="${safeTitle}">
                ${safeTitle}
            </h3>

            <div class="movie-meta">
                ${escapeHTML(movieYear(movie.release_date))}
                ${score}
            </div>
        </article>
    `;
}

function bindMovieGrid(grid) {
    if (!grid) return;

    const selectMovie = (node) => {
        const title = node.dataset.title;

        if (title) {
            chooseMovie(title);
        }
    };

    grid.addEventListener("click", (event) => {
        const node = event.target.closest(".movie-card");

        if (node) {
            selectMovie(node);
        }
    });

    grid.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }

        const node = event.target.closest(".movie-card");

        if (node) {
            event.preventDefault();
            selectMovie(node);
        }
    });
}

[
    "#home-grid",
    "#tfidf-grid",
    "#genre-grid"
].forEach((selector) => {
    bindMovieGrid($(selector));
});

async function loadHome(category = "trending") {
    const serial = ++homeSerial;
    const status = $("#home-status");

    if (!homeGrid || !status) return;

    status.textContent = "Loading movies...";
    status.classList.remove("hidden");
    homeGrid.innerHTML = "";

    try {
        const movies = await api(
            `/home?category=${encodeURIComponent(category)}&limit=18`
        );

        if (serial !== homeSerial) return;

        homeGrid.innerHTML = movies
            .map((movie) => movieCard(movie))
            .join("");

        if (movies.length > 0) {
            status.classList.add("hidden");
        } else {
            status.textContent =
                "No movies available for this category.";
        }

    } catch (error) {
        if (serial !== homeSerial) return;

        console.error("Home loading error:", error);

        status.textContent =
            `Could not load movies. ${error.message}`;

        toast("Unable to load movies.");
    }
}

const categoryTabs = $(".category-tabs");

if (categoryTabs) {
    categoryTabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");

        if (
            !button ||
            button.classList.contains("selected")
        ) {
            return;
        }

        document.querySelectorAll(".category-tab")
            .forEach((element) => {
                const active = element === button;

                element.classList.toggle("selected", active);
                element.setAttribute(
                    "aria-selected",
                    String(active)
                );
            });

        loadHome(button.dataset.category);
    });
}

async function loadSuggestions(query) {
    suggestionRequest?.abort();

    if (!suggestions) return;

    suggestions.classList.add("hidden");

    if (query.trim().length < 2) {
        suggestions.innerHTML = "";
        return;
    }

    const controller = new AbortController();
    suggestionRequest = controller;

    try {
        const payload = await api(
            `/tmdb/search?query=${encodeURIComponent(query)}&page=1`,
            controller.signal
        );

        if (
            controller.signal.aborted ||
            searchInput.value.trim() !== query.trim()
        ) {
            return;
        }

        const movies = (payload.results || []).slice(0, 7);

        if (!movies.length) {
            suggestions.innerHTML = "";
            return;
        }

        suggestions.innerHTML = movies.map((movie) => {
            const title = movie.title || "Untitled movie";
            const safeTitle = escapeHTML(title);

            return `
                <button
                    type="button"
                    class="suggestion"
                    data-title="${safeTitle}"
                >
                    ${safeTitle}
                    <small>
                        ${escapeHTML(movieYear(movie.release_date))}
                    </small>
                </button>
            `;
        }).join("");

        suggestions.classList.remove("hidden");

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Suggestions error:", error);
            suggestions.classList.add("hidden");
        }
    }
}

if (searchInput) {
    searchInput.addEventListener("input", () => {
        clearTimeout(suggestionsTimer);
        suggestionRequest?.abort();

        suggestions?.classList.add("hidden");

        const query = searchInput.value.trim();

        if (query.length < 2) {
            if (suggestions) suggestions.innerHTML = "";
            return;
        }

        suggestionsTimer = setTimeout(() => {
            loadSuggestions(query);
        }, 300);
    });
}

if (suggestions) {
    suggestions.addEventListener("click", (event) => {
        const button = event.target.closest("[data-title]");

        if (button) {
            chooseMovie(button.dataset.title);
        }
    });
}

document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-shell")) {
        suggestions?.classList.add("hidden");
    }
});

const searchForm = $("#search-form");

if (searchForm) {
    searchForm.addEventListener("submit", (event) => {
        event.preventDefault();

        const title = searchInput.value.trim();

        if (title) {
            chooseMovie(title);
        }
    });
}

document.querySelectorAll("[data-search]")
    .forEach((button) => {
        button.addEventListener("click", () => {
            chooseMovie(button.dataset.search);
        });
    });

function renderSelectedMovie(movie) {
    const safeTitle = escapeHTML(movie.title);
    const imageURL = posterURL(movie.poster_url);

    const genres = (movie.genres || []).map((genre) => `
        <span>${escapeHTML(genre.name)}</span>
    `).join("");

    const image = imageURL
        ? `
            <img
                src="${escapeHTML(imageURL)}"
                alt="${safeTitle} poster"
                loading="lazy"
                onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')"
            >
            <div class="detail-placeholder hidden">
                NO POSTER
            </div>
        `
        : `
            <div class="detail-placeholder">
                NO POSTER
            </div>
        `;

    $("#selected-movie").innerHTML = `
        <div class="selected-film">
            ${image}

            <div class="selected-film-content">
                <div class="selected-label">
                    NOW DISCOVERING
                </div>

                <h2>${safeTitle}</h2>

                <div class="film-tags">
                    <span>
                        ${escapeHTML(movieYear(movie.release_date))}
                    </span>
                    ${genres}
                </div>

                <p>
                    ${escapeHTML(
                        movie.overview ||
                        "Explore similar movies with our recommendation engine."
                    )}
                </p>
            </div>
        </div>
    `;
}

function renderRecommendations(data) {
    renderSelectedMovie(data.movie_details);

    $("#based-on-title").textContent =
        data.movie_details.title;

    const tfidfItems = data.tfidf_recommendations || [];

    $("#tfidf-grid").innerHTML = tfidfItems.length
        ? tfidfItems.map((item) => {
            const movie = item.tmdb || {
                title: item.title
            };

            return movieCard(movie, item.score);
        }).join("")
        : `
            <div class="empty-state">
                This title is not in the local TF-IDF dataset,
                so content-based recommendations are not
                available for it.

                Try Toy Story, Inception, or another movie
                from the dataset.
            </div>
        `;

    const genreItems = data.genre_recommendations || [];

    $("#genre-grid").innerHTML = genreItems.length
        ? genreItems.map((movie) => movieCard(movie)).join("")
        : `
            <div class="empty-state">
                No genre-based suggestions found for this title.
            </div>
        `;

    $("#tfidf-section").classList.remove("hidden");
    $("#genre-section").classList.remove("hidden");
}

async function chooseMovie(title) {
    if (!title || !title.trim()) return;

    const serial = ++searchSerial;

    searchInput.value = title;
    suggestions?.classList.add("hidden");

    clearTimeout(suggestionsTimer);
    suggestionRequest?.abort();

    searchButton.disabled = true;
    searchButton.textContent = "Finding...";

    const recommendations = $("#recommendations");

    recommendations.classList.remove("hidden");

    $("#selected-movie").innerHTML = `
        <div class="loading-message">
            Finding movies you might love...
        </div>
    `;

    $("#tfidf-section").classList.add("hidden");
    $("#genre-section").classList.add("hidden");

    recommendations.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    try {
        const payload = await api(
            `/movie/search?query=${encodeURIComponent(title)}&tfidf_top_n=12&genre_limit=12`
        );

        if (serial !== searchSerial) return;

        renderRecommendations(payload);

    } catch (error) {
        if (serial !== searchSerial) return;

        console.error("Recommendation error:", error);

        $("#selected-movie").innerHTML = `
            <div class="empty-state">
                Could not load recommendations:
                ${escapeHTML(error.message)}.

                Please try a different movie.
            </div>
        `;

        toast("Unable to load movie recommendations.");

    } finally {
        if (serial === searchSerial) {
            searchButton.disabled = false;
            searchButton.innerHTML =
                'Find movies <span aria-hidden="true">→</span>';
        }
    }
}

loadHome();
