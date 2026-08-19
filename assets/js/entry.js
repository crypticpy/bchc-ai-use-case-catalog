// Entry page enhancements: share and copy-link buttons, table-of-contents
// scroll-spy. All optional — the page is complete and navigable without them.
(function () {
  setupShare();
  setupCopyLink();
  setupScrollSpy();

  /**
   * Wire the "Share" button, which hands the entry to the OS share sheet —
   * Messages, Mail, the reader's notes app — instead of asking them to copy a
   * URL and find somewhere to paste it. That is how a colleague actually passes
   * an entry on from a phone.
   *
   * Hidden unless the browser can share this exact payload: `navigator.share`
   * exists on desktop Firefox but rejects, and `canShare` is the only honest
   * test. Where it is missing the button never appears and "Copy link" — which
   * stays visible either way — is the whole affordance, as it is today.
   */
  function setupShare() {
    const button = document.querySelector('[data-share-link]');
    if (!button) return;
    const url = button.dataset.shareLink || window.location.href;
    const title = document.title;
    const payload = { title, url };
    if (!navigator.share || !navigator.canShare || !navigator.canShare(payload)) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      // A dismissed share sheet rejects with AbortError. That is the reader
      // saying "no", not a failure, and it must not reach the console or the
      // status line.
      navigator.share(payload).catch((err) => {
        if (err && err.name !== 'AbortError') button.hidden = true;
      });
    });
  }

  /**
   * Wire the "Copy link" button. The button is hidden when the browser has no
   * clipboard API (or the page is not in a secure context), so it never offers
   * an action it cannot perform.
   */
  function setupCopyLink() {
    const button = document.querySelector('[data-copy-link]');
    if (!button) return;
    const status = document.querySelector('[data-copy-status]');
    const canCopy = Boolean(navigator.clipboard && navigator.clipboard.writeText);
    if (!canCopy) {
      button.hidden = true;
      return;
    }
    button.hidden = false;
    let timer = null;
    button.addEventListener('click', () => {
      const url = button.dataset.copyLink || window.location.href;
      navigator.clipboard.writeText(url).then(
        () => announce('Link copied to your clipboard.'),
        () => announce('Copying failed — press Ctrl or Cmd + C to copy the address bar.')
      );
    });

    /**
     * Put a message in the button's status region and clear it after a while.
     * @param {string} message
     */
    function announce(message) {
      if (!status) return;
      status.textContent = message;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        status.textContent = '';
      }, 4000);
    }
  }

  /**
   * Mark the table-of-contents link whose section is currently on screen with
   * `aria-current="true"`. Uses IntersectionObserver where available.
   */
  function setupScrollSpy() {
    const toc = document.querySelector('[data-toc]');
    if (!toc || typeof IntersectionObserver !== 'function') return;
    const links = Array.from(toc.querySelectorAll('[data-toc-link]'));
    const targets = links
      .map((link) => ({ link, target: document.getElementById(decodeURIComponent(link.hash.slice(1))) }))
      .filter((pair) => pair.target);
    if (targets.length === 0) return;

    let current = null;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const pair = targets.find((p) => p.target === entry.target);
          if (!pair || pair === current) return;
          if (current) current.link.removeAttribute('aria-current');
          pair.link.setAttribute('aria-current', 'true');
          current = pair;
        });
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );
    targets.forEach((pair) => observer.observe(pair.target));
  }
})();
