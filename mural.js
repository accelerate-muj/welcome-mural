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

  /**
   * Parses the wall table, deliberately forgiving about pipes.
   *
   * This used to require a row to both start AND end with `|`, and silently
   * dropped anything else. That is the single most common mistake a first-time
   * contributor makes in a markdown table, and it failed invisibly: the PR was
   * reviewed, merged, CI went green, Pages deployed, and their name never
   * appeared with nothing anywhere explaining why. Six people were lost that way.
   *
   * A line with a pipe and at least two cells is a wall entry. Anything that
   * looks like an attempted entry but cannot be read is returned in `skipped`
   * so the page can say so out loud instead of swallowing it.
   */
  function parseWall(markdown) {
    const entries = [];
    const skipped = [];

    String(markdown).split(/\r?\n/).forEach(function (line) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.indexOf('|') === -1) return;
      if (trimmed.charAt(0) === '#' || trimmed.charAt(0) === '>') return;   // heading / blockquote
      if (/^\|?[\s:|-]+\|?$/.test(trimmed)) return;                          // the --- separator
      const lower = trimmed.toLowerCase();
      if (lower.indexOf('name') !== -1 && lower.indexOf('project') !== -1) return; // header

      // Tolerate a missing leading or trailing pipe.
      const cells = trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(function (cell) { return cell.trim(); });

      if (cells.length < 2) { skipped.push(trimmed); return; }

      const name = plain(cells[0]);
      if (!name) { skipped.push(trimmed); return; }

      // A stray empty cell (| Name | |Project| @handle |) shifts every column
      // right, which is what put a project description in Shreyansh Kaushal's
      // name slot. Drop empty cells after the name so positions line up again.
      const rest = cells.slice(1).filter(function (c) { return c !== ''; });

      // Columns are positional: project is the cell after the name, handle is
      // last. Do NOT infer the handle by "which cell looks like a username" —
      // "Calculator", "Timer" and "Robotics" are all valid GitHub handles, so
      // content sniffing silently eats the project description.
      var project = '';
      var handle = null;

      if (rest.length === 0) {
        // Name only; nothing else to read.
      } else if (rest.length === 1) {
        // Two cells total: either "Name | @handle" or "Name | Project".
        handle = handleFrom(rest[0]);
        if (handle === null) project = plain(rest[0]);
      } else {
        project = plain(rest[0]);
        handle = handleFrom(rest[rest.length - 1]);
      }

      entries.push({ name: name, project: project, handle: handle });
    });

    entries.skipped = skipped;
    return entries;
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

  // cache: 'no-store' matters here. GitHub Pages serves WALL.md with
  // Cache-Control: max-age=600, so with default fetch caching a contributor who
  // merges their PR and refreshes can miss their own name for ten minutes -
  // indistinguishable, from their side, from the entry having been dropped.
  fetch('./WALL.md', { cache: 'no-store' })
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

      // Say it out loud when a row could not be read. Somebody wrote their name
      // in that line and deserves to know it did not make it, rather than the
      // page quietly rendering one card fewer.
      if (entries.skipped && entries.skipped.length) {
        const warn = el(
          'li',
          'notice error',
          entries.skipped.length === 1
            ? '1 row in WALL.md could not be read and is not shown below. Check that it has a name and a GitHub username separated by | characters.'
            : entries.skipped.length + ' rows in WALL.md could not be read and are not shown below. Check that each has a name and a GitHub username separated by | characters.'
        );
        grid.appendChild(warn);
        console.warn('Unparseable WALL.md rows:', entries.skipped);
      }
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
