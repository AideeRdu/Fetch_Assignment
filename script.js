const API = "https://api.tvmaze.com";
const DEFAULT_QUERY = "star trek";
const MAX_RESULTS = 10;
const MAX_CAST = 5;
const NA = "Not available";

const form = document.getElementById("search-form");
const input = document.getElementById("query");
const button = document.getElementById("search-btn");
const gallery = document.getElementById("gallery");
const statusEl = document.getElementById("status");

let searchCounter = 0; // ignore responses from outdated searches

// helpers for formatting and DOM manipulation

function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", isError);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (response.status === 429) {
        throw new Error("TVmaze is rate limiting requests. Please wait a moment and try again.");
    }
    if (!response.ok) {
        throw new Error(`Request failed (HTTP ${response.status}).`);
    }
    return response.json();
}

// Strip HTML safely without innerHTML on the page: DOMParser doesn't run scripts.
function stripHtml(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function truncate(text, max = 220) {
    if (text.length <= max) return text;
    return text.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function formatDate(value) {
    if (!value) return NA;
    // Premiere dates are "YYYY-MM-DD"; parse as local to avoid timezone shift.
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date) ? NA : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatUpdated(seconds) {
    if (typeof seconds !== "number") return NA;
    return new Date(seconds * 1000).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function el(tag, options = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(options)) {
        if (key === "className") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value);
    }
    children.forEach((child) => node.appendChild(child));
    return node;
}

function addRow(list, label, value) {
    list.appendChild(el("dt", { text: label }));
    list.appendChild(el("dd", { text: value }));
}

// returns { card, castValue } so the caller can update the cast asynchronously

function buildCard(show) {
    const card = el("article", { className: "card" });

    const posterUrl = show.image && (show.image.medium || show.image.original);
    if (posterUrl) {
        const img = el("img", {
            className: "poster",
            src: posterUrl,
            alt: `Poster for ${show.name}`,
            loading: "lazy",
        });
        img.addEventListener("error", () => {
            img.replaceWith(el("div", { className: "no-poster", text: "Poster not available" }));
        });
        card.appendChild(img);
    } else {
        card.appendChild(el("div", { className: "no-poster", text: "Poster not available" }));
    }

    const body = el("div", { className: "body" });
    body.appendChild(el("h2", { text: show.name || "Untitled show" }));

    const summary = stripHtml(show.summary);
    body.appendChild(el("p", { className: "summary", text: summary ? truncate(summary) : `Summary: ${NA}` }));

    const details = el("dl");
    addRow(details, "Premiered", formatDate(show.premiered));
    addRow(details, "Last updated", formatUpdated(show.updated));
    addRow(details, "Genres", show.genres && show.genres.length ? show.genres.join(", ") : NA);
    const rating = show.rating && typeof show.rating.average === "number" ? `${show.rating.average} / 10` : NA;
    addRow(details, "Rating", rating);

    const castValue = el("dd", { text: "Loading…" });
    details.appendChild(el("dt", { text: "Main cast" }));
    details.appendChild(castValue);
    body.appendChild(details);

    if (show.url) {
        body.appendChild(
            el("a", { href: show.url, target: "_blank", rel: "noopener", text: `View ${show.name} on TVmaze` })
        );
    }

    card.appendChild(body);
    return { card, castValue };
}

async function loadCast(showId, castNode, searchId) {
    try {
        const cast = await fetchJson(`${API}/shows/${showId}/cast`);
        if (searchId !== searchCounter) return;
        const names = [];
        for (const entry of cast) {
            const name = entry.person && entry.person.name;
            if (name && !names.includes(name)) names.push(name);
            if (names.length === MAX_CAST) break;
        }
        castNode.textContent = names.length ? names.join(", ") : NA;
    } catch (error) {
        if (searchId !== searchCounter) return;
        castNode.textContent = error.message.includes("rate limiting")
            ? "Cast unavailable (rate limited)"
            : "Cast could not be loaded";
    }
}

// search for shows matching the query, update the gallery, and load cast asynchronously

async function search(query) {
    const trimmed = query.trim();
    const searchId = ++searchCounter;

    if (!trimmed) {
        gallery.replaceChildren();
        setStatus("Enter a show title or keyword to search.", true);
        return;
    }

    button.disabled = true;
    gallery.replaceChildren();
    setStatus(`Searching for "${trimmed}"…`);

    try {
        const results = await fetchJson(`${API}/search/shows?q=${encodeURIComponent(trimmed)}`);
        if (searchId !== searchCounter) return;

        if (!Array.isArray(results) || results.length === 0) {
            setStatus(`No shows found for "${trimmed}". Try a different title or keyword.`, true);
            return;
        }

        const shows = results.slice(0, MAX_RESULTS).map((r) => r.show).filter(Boolean);
        setStatus(`Showing ${shows.length} result${shows.length === 1 ? "" : "s"} for "${trimmed}".`);

        const pending = shows.map((show) => {
            const { card, castValue } = buildCard(show);
            gallery.appendChild(card);
            return loadCast(show.id, castValue, searchId);
        });
        await Promise.all(pending);
    } catch (error) {
        if (searchId !== searchCounter) return;
        gallery.replaceChildren();
        const offline = error instanceof TypeError;
        setStatus(
            offline ? "Could not reach TVmaze. Check your connection and try again." : error.message,
            true
        );
    } finally {
        if (searchId === searchCounter) button.disabled = false;
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    search(input.value);
});

input.value = DEFAULT_QUERY;
search(DEFAULT_QUERY);