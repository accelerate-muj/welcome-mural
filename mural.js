'use strict';

/**
 * Renders the wall from WALL.md.
 *
 * WALL.md is edited by anyone joining the club, through a pull request. That
 * makes every cell in it untrusted input rendered into a public page, so this
 * file builds nodes with createElement and textContent and never with
 * innerHTML — the previous version interpolated names, projects and handles
 * straight into an innerHTML template, which meant a row like
 *
 *     | <img src=x onerror=alert(1)> | ... | ... |
 *
 * executed for every visitor. Links are rebuilt from a validated handle rather
 * than trusting a URL out of the table, so `[@me](javascript:...)` cannot get
 * through either.
 */

(function () {
  const GITHUB_HANDLE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

  const grid = document.getElementById('grid');
  const count = document.getElementById('count');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /** Strips the bold/italic markers people put around their own names. */
  function plain(value) {
    return String(value || '')
      .replace(/\*\*|__|[*_`]/g, '')
      .trim();
  }

  /**
   * Pulls a GitHub handle out of a cell, which may be `@name`, `name`, or a
   * markdown link. Anything that is not a valid handle returns null and the
   * card simply renders without a link.
   */
  function handleFrom(cell) {
    const raw = String(cell || '').trim();
    if (!raw) return null;

    const link = raw.match(/\[([^\]]*)\]\(([^)]*)\)/);
    let candidate = link ? link[1] : raw;

    // A URL in either half of the link, or pasted bare.
    const url = (link ? link[2] : raw).match(/github\.com\/([A-Za-z0-9-]+)/i);
    if (url) candidate = url[1];

    candidate = plain(candidate).replace(/^@+/, '').replace(/\/+$/, '');
    return GITHUB_HANDLE.test(candidate) ? candidate : null;
  }

  function parseWall(markdown) {
    return String(markdown)
      .split(/\r?\n/)
      .filter(function (line) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
        if (/^\|[\s:|-]+\|$/.test(trimmed)) return false; // the --- separator
        const lower = trimmed.toLowerCase();
        return !(lower.includes('name') && lower.includes('project')); // the header
      })
      .map(function (line) {
        const cells = line.split('|').slice(1, -1).map(function (cell) {
          return cell.trim();
        });
        if (cells.length < 2) return null;
        return { name: plain(cells[0]), project: plain(cells[1]), handle: handleFrom(cells[2]) };
      })
      .filter(function (entry) {
        return entry && entry.name;
      });
  }

  function githubIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute(
      'd',
      'M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22'
    );
    svg.appendChild(path);
    return svg;
  }

  function card(entry) {
    const item = el('li', 'card');
    item.appendChild(el('p', 'card-name', entry.name));
    if (entry.project) item.appendChild(el('p', 'card-project', entry.project));

    if (entry.handle) {
      const link = el('a', 'card-github');
      // Built from the validated handle, not from anything in the table.
      link.href = 'https://github.com/' + entry.handle;
      link.rel = 'noopener';
      link.target = '_blank';
      link.setAttribute('aria-label', entry.name + ' on GitHub, opens in a new tab');
      link.appendChild(githubIcon());
      link.appendChild(document.createTextNode('@' + entry.handle));
      item.appendChild(link);
    }

    return item;
  }

  function notice(message, isError) {
    grid.textContent = '';
    const item = el('li', 'notice' + (isError ? ' error' : ''), message);
    grid.appendChild(item);
  }

  fetch('./WALL.md')
    .then(function (response) {
      if (!response.ok) throw new Error('WALL.md returned ' + response.status);
      return response.text();
    })
    .then(function (markdown) {
      const entries = parseWall(markdown);

      if (entries.length === 0) {
        count.textContent = 'Nobody yet';
        notice('No entries on the wall yet. Be the first — press "Add yourself" above.', false);
        return;
      }

      count.textContent = entries.length === 1 ? '1 person on the wall' : entries.length + ' people on the wall';
      grid.textContent = '';
      entries.forEach(function (entry) {
        grid.appendChild(card(entry));
      });
    })
    .catch(function (error) {
      console.error(error);
      count.textContent = 'Could not load the wall';
      // fetch() on a local file is blocked by CORS, and opening index.html by
      // double-click is the first thing a contributor tries. Say so rather than
      // leaving them staring at a generic failure.
      const local = window.location.protocol === 'file:';
      notice(
        local
          ? 'Reading WALL.md is blocked when the page is opened straight from disk. Serve the folder over HTTP — for example "python3 -m http.server" — or view the deployed site.'
          : 'Could not load WALL.md. Read it on GitHub instead.',
        true
      );
    });
})();
