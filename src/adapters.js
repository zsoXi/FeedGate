/* SPDX-License-Identifier: GPL-3.0-or-later
 * DOM adapters are deliberately separate from policy and inference.
 * X and Reddit are primary targets; Wykop is a beta target reviewed against
 * the served public markup; the remaining selectors are experimental.
 */
(() => {
  'use strict';
  if (globalThis.FeedGateAdapters) return;
  const C=globalThis.FeedGateCore;
  const SPECS = {
    x: {posts:'article[data-testid="tweet"]',body:'[data-testid="tweetText"]',author:'[data-testid="User-Name"]',link:'a[href*="/status/"]'},
    reddit: {posts:'shreddit-post, [data-testid="post-container"], .thing[data-fullname^="t3_"]',body:'[slot="title"], [slot="text-body"], [data-testid="post-title"], [data-testid="post-content"], .title, .usertext-body',author:'[slot="credit-bar"] a[href*="/user/"], a[data-testid="post_author_link"], a.author',link:'a[href*="/comments/"]'},
    wykop: {posts:'section.link-block[id^="link-"], section.entry[id^="comment-"]:not(.reply)',body:'article header h2.heading a, article .content section.info p, section.entry-content div.wrapper',author:'a.username[href^="/ludzie/"]',link:'a[href^="/link/"], a[href^="/wpis/"]'},
    linkedin: {posts:'.feed-shared-update-v2[data-urn], .occludable-update, [data-id^="urn:li:activity:"]',body:'.update-components-text, .feed-shared-update-v2__description, .feed-shared-text',author:'.update-components-actor__title, .feed-shared-actor__name',link:'a[href*="/feed/update/"], a[href*="/posts/"]'},
    facebook: {posts:'[role="feed"] [role="article"], [role="feed"] [aria-posinset]',body:'[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-testid="post_message"]',author:'h2, h3',link:'a[href*="/posts/"], a[href*="/permalink/"]'},
    instagram: {posts:'main article',body:'h1, [data-testid="post-caption"]',author:'header a',link:'a[href*="/p/"], a[href*="/reel/"]'},
    demo: {posts:'[data-feedgate-demo-post]',body:'[data-post-text]',author:'[data-author]',link:'a[data-permalink]'}
  };
  const EXCLUDE='script,style,noscript,template,input,textarea,select,button,[role="button"],[contenteditable],[role="dialog"],[hidden],[aria-hidden="true"],feedgate-card,[data-fg-ui]';
  function safeText(el,max=6000) {
    if (!el) return '';
    const copy=el.cloneNode(true);
    for (const n of copy.querySelectorAll(EXCLUDE)) n.remove();
    for (const n of copy.querySelectorAll('[style]')) if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute('style')||'')) n.remove();
    return C.text(copy.textContent,max);
  }
  function privateElement(el) {
    return !!el.closest('[contenteditable],[role="dialog"],[data-testid="DMDrawer"],[data-testid="DmActivityViewport"],.msg-overlay-conversation-bubble,[aria-label="Chat"],[aria-label="Messenger"]');
  }
  function collect(root,site) {
    const spec=SPECS[site];
    if (!spec || !root?.querySelectorAll) return [];
    const found=[];
    if (root instanceof Element) {
      const closest=root.closest(spec.posts);
      if (closest) found.push(closest);
    }
    found.push(...root.querySelectorAll(spec.posts));
    return [...new Set(found)].filter(el=>!privateElement(el) && !el.parentElement?.closest(spec.posts));
  }
  // Rendered ad labels in the languages this adapter reviewed. The list is an
  // exact-match allowlist; class names and generic words are never evidence.
  const AD_LABELS=/^(sponsored|promoted|advertisement|advertising|sponsorowane|promowane|reklama|patrocinado|sponsorisé|gesponsert|gesponsorde|pubblicità|anuncio|sponsorizzato)$/i;
  function visible(node) {
    try { return !!node && node.isConnected === true && typeof node.getClientRects === 'function' && node.getClientRects().length > 0; }
    catch (error) { return false; }
  }
  // Evaluates platform ad evidence for one outer post root. It returns the
  // ad-evidence contract; core sanitization downgrades any claim that lacks
  // outer ownership, a rendered label or a reviewed marker kind. Placement
  // tracking and generic labels can never reach "verified".
  function detectAdEvidence(el, site) {
    const spec = SPECS[site];
    const claim = (extra) => C.sanitizeAdEvidence(Object.assign({
      adapter: site,
      status: 'none',
      markerKind: null,
      selectorId: null,
      ownerMatched: false,
      renderedLabel: null,
      evidenceKind: 'none',
      scope: 'outer_post',
    }, extra || {}), site);
    if (!spec || !el || !el.querySelectorAll) return claim({});
    const quoteSel = site === 'x'
      ? '[data-testid="quoteTweet"], [data-testid="quoteTweetText"], [role="link"][tabindex="0"]'
      : 'blockquote, [data-testid="quoted-post"], article article';
    const own = (node) => {
      if (!node || node.isConnected !== true) return false;
      if (node.closest('feedgate-card,[data-fg-ui]')) return false;
      if (node.closest(quoteSel)) return false;
      if (node.closest(spec.body) || node.closest(spec.author)) return false;
      const post = node.closest(spec.posts);
      return !post || post === el;
    };
    const scopeOf = (node) => {
      if (node.closest(quoteSel)) return 'quote';
      return 'unrelated';
    };
    if (site === 'demo') {
      if (el.getAttribute('data-promoted') === 'true') return claim({ status: 'verified', markerKind: 'demo_data_promoted', selectorId: 'demo-promoted-attribute', ownerMatched: true, renderedLabel: false, evidenceKind: 'platform_metadata' });
      return claim({});
    }
    if (site === 'x') {
      if (el.getAttribute('is-promoted') === 'true') return claim({ status: 'verified', markerKind: 'x_is_promoted_attribute', selectorId: 'x-attr-is-promoted', ownerMatched: true, renderedLabel: false, evidenceKind: 'platform_metadata' });
      if (el.getAttribute('data-promoted') === 'true') return claim({ status: 'verified', markerKind: 'x_data_promoted_attribute', selectorId: 'x-attr-data-promoted', ownerMatched: true, renderedLabel: false, evidenceKind: 'platform_metadata' });
      let foreign = null;
      let tracking = false;
      for (const node of el.querySelectorAll('[data-testid="promotedIndicator"], [data-ad-rendering-role="sponsored_label"], [data-testid="placementTracking"]')) {
        const isTracking = node.getAttribute('data-testid') === 'placementTracking';
        if (!own(node)) { if (!foreign) foreign = node; continue; }
        if (isTracking) { tracking = true; continue; }
        if (!visible(node)) continue;
        if (node.getAttribute('data-ad-rendering-role') === 'sponsored_label') {
          return claim({ status: 'verified', markerKind: 'x_sponsored_label_role', selectorId: 'x-role-sponsored-label', ownerMatched: true, renderedLabel: true, evidenceKind: 'rendered_label' });
        }
        return claim({ status: 'verified', markerKind: 'x_promoted_indicator', selectorId: 'x-promoted-indicator', ownerMatched: true, renderedLabel: true, evidenceKind: 'rendered_label' });
      }
      if (tracking) return claim({ status: 'ambiguous', markerKind: 'x_placement_tracking', selectorId: 'x-placement-tracking', ownerMatched: true, renderedLabel: false, evidenceKind: 'platform_metadata' });
      if (foreign) return claim({ status: 'ambiguous', markerKind: null, ownerMatched: false, scope: scopeOf(foreign) });
      return claim({});
    }
    if (site === 'reddit') {
      if (typeof el.matches === 'function' && el.matches('shreddit-ad-post')) {
        return claim({ status: 'verified', markerKind: 'reddit_ad_post', selectorId: 'reddit-ad-post-element', ownerMatched: true, renderedLabel: false, evidenceKind: 'platform_metadata' });
      }
      const credit = el.querySelector('[slot="credit-bar"]');
      if (credit) {
        for (const node of credit.querySelectorAll('span, [aria-label]')) {
          if (!visible(node)) continue;
          const label = C.text(node.getAttribute('aria-label'), 40);
          const body = node.childElementCount < 3 ? C.text(node.textContent, 40) : '';
          if (AD_LABELS.test(label) || AD_LABELS.test(body)) {
            return claim({ status: 'verified', markerKind: 'reddit_rendered_label', selectorId: 'reddit-credit-label', ownerMatched: true, renderedLabel: true, evidenceKind: 'rendered_label' });
          }
        }
      }
      return claim({});
    }
    if (site === 'wykop') {
      // Reviewed against the served public markup: the only promotion-related
      // markers observable were a historical "Wykop Poleca" note that states
      // the promotion is over, and empty page-level ad slots. Neither is
      // current paid-placement evidence, so Wykop can only report ambiguous.
      if (el.querySelector('.expired-pub')) {
        return claim({ status: 'ambiguous', markerKind: 'wykop_expired_promotion_note', selectorId: 'wykop-expired-promotion', ownerMatched: false, renderedLabel: false });
      }
      if (el.querySelector('[data-label^="ad:"]')) {
        return claim({ status: 'ambiguous', markerKind: 'wykop_ad_slot', selectorId: 'wykop-ad-slot', ownerMatched: false, renderedLabel: false });
      }
      return claim({});
    }
    // Unreviewed adapters: a rendered label can only raise an ambiguous
    // observation. It can never cause a local collapse.
    for (const node of [...el.querySelectorAll('span, [aria-label]')].slice(0, 250)) {
      if (!visible(node) || !own(node)) continue;
      const label = C.text(node.getAttribute('aria-label'), 40);
      const body = node.childElementCount < 3 ? C.text(node.textContent, 40) : '';
      if (AD_LABELS.test(label) || AD_LABELS.test(body)) {
        return claim({ status: 'ambiguous', markerKind: 'generic_rendered_label', selectorId: 'generic-rendered-label', ownerMatched: true, renderedLabel: true, evidenceKind: 'rendered_label' });
      }
    }
    return claim({});
  }
  // Wykop extraction works from the reviewed public markup: link cards
  // (section.link-block) and Mikroblog/tag/home entries (section.entry, but
  // never section.entry.reply). The 18+ gate is treated as concealed content:
  // nothing behind it is read or invented, and the item is flagged incomplete.
  function extractWykop(el) {
    const isLink = typeof el.matches === 'function' && el.matches('section.link-block');
    const kind = isLink ? 'link' : 'entry';
    const key = C.text(el.id, 60).replace(/^(?:link|comment)-/, '');
    let title = '';
    let body = '';
    let concealed = false;
    if (isLink) {
      const titleNode = el.querySelector('article header h2.heading a');
      title = C.text(titleNode ? titleNode.textContent : '', 300);
      const bodyNode = el.querySelector('article .content section.info p span') || el.querySelector('article .content section.info p');
      body = bodyNode ? safeText(bodyNode, 2500) : '';
    } else {
      const content = el.querySelector('section.entry-content');
      concealed = !!(content && content.querySelector('.adult-filter'));
      const wrapper = concealed ? null : (content ? content.querySelector('div.wrapper') : null);
      body = wrapper ? safeText(wrapper, 3000) : '';
    }
    const text = [title, body].filter(Boolean).join('\n');
    const truncated = concealed || !body;
    const authorNode = el.querySelector('a.username[href^="/ludzie/"]');
    const author = C.text(authorNode ? authorNode.textContent : '', 120);
    const mediaAlt = [...el.querySelectorAll('figure img[alt]')].slice(0, 8).map((node) => C.text(node.alt, 250)).filter((value) => value && !/^(image|avatar|profile photo|profile picture)$/i.test(value)).join('; ');
    const linkDomains = [];
    for (const anchor of [...el.querySelectorAll('article a[href], .external')].slice(0, 30)) {
      if (privateElement(anchor)) continue;
      try {
        const parsed = new URL(anchor.getAttribute('href'), location.href);
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') linkDomains.push(parsed.hostname);
      } catch (error) { /* ignore malformed hrefs */ }
    }
    let id = key ? kind + ':' + key : '';
    if (!id) {
      try {
        const permalink = new URL((el.querySelector('article header h2.heading a') || el.querySelector('a.comment-counter') || {}).getAttribute('href') || '', location.href).pathname;
        if (permalink) id = kind + ':' + permalink;
      } catch (error) { /* keep the text-derived fallback */ }
    }
    if (!id) id = 'text:' + C.text(author, 80) + ':' + text.slice(0, 160) + ':' + mediaAlt.slice(0, 40);
    return C.sanitizeRecord({
      id,
      author,
      text,
      mediaAlt,
      quotedText: '',
      truncated,
      kind,
      context: C.pageContext(location.href),
      adEvidence: detectAdEvidence(el, 'wykop'),
      linkDomains,
    }, 'wykop');
  }
  function extract(el,site) {
    const spec=SPECS[site];
    if (!spec || !el.isConnected || privateElement(el)) return null;
    if (site === 'wykop') {
      if (typeof el.matches === 'function' && el.matches('.entry.reply')) return null;
      return extractWykop(el);
    }
    const bodies=[...el.querySelectorAll(spec.body)].filter(n=>!privateElement(n));
    // Separate visible quotation from the author's own words. Never click Show more.
    const isQuote=n=>site==='x' && !!n.closest('[data-testid="quoteTweet"], [data-testid="quoteTweetText"], [role="link"][tabindex="0"]');
    const mainBodies=bodies.filter(n=>!isQuote(n));
    let text=mainBodies.map(n=>safeText(n)).filter(Boolean).join('\n');
    const quotedText=bodies.filter(isQuote).map(n=>safeText(n,2500)).join('\n');
    const truncated=!!el.querySelector('[data-testid="tweet-text-show-more-link"], [data-testid="showMoreText"]');
    // Generic fallbacks are intentionally limited to known post roots, never document.body.
    if (!text && ['linkedin','instagram'].includes(site)) text=safeText(el);
    if (site==='reddit') {
      const title=C.text(el.getAttribute('post-title'),300);
      if (title && !text.includes(title)) text=[title,text].filter(Boolean).join('\n');
    }
    const authorElement=el.querySelector(spec.author);
    let author=el.getAttribute('author')||el.getAttribute('data-author-name')||safeText(authorElement,120);
    let id=el.getAttribute('data-post-id')||el.getAttribute('id')||el.getAttribute('data-fullname')||el.getAttribute('data-urn')||el.getAttribute('data-id')||'';
    const links=[...el.querySelectorAll(spec.link)].filter(n=>!n.closest('[data-testid="quoteTweet"], [role="link"][tabindex="0"]'));
    const link=links.find(n=>n.querySelector("time"))||links[0];
    if (link) try {id=new URL(link.getAttribute('href'),location.href).pathname;} catch {}
    if (site==='x' && link) {
      try {const part=new URL(link.getAttribute('href'),location.href).pathname.split('/');if(part[2]==='status')author='@'+part[1];} catch {}
    }
    if (site==='reddit' && authorElement) {
      try {const p=new URL(authorElement.getAttribute('href'),location.href).pathname.match(/\/user\/([^/]+)/);if(p)author='u/'+p[1];} catch {}
    }
    const mediaAlt=[...el.querySelectorAll('img[alt]')].filter(n=>!n.closest('[data-testid="Tweet-User-Avatar"], header, [role="dialog"]')).slice(0,8).map(n=>C.text(n.alt,250)).filter(t=>t&&!/^(image|avatar|profile photo|profile picture)$/i.test(t)).join('; ');
    const linkDomains=[];
    for (const a of [...el.querySelectorAll('a[href]')].slice(0,30)) {
      if (privateElement(a)) continue;
      try {const u=new URL(a.getAttribute('href'),location.href);if(u.protocol==='https:'||u.protocol==='http:')linkDomains.push(u.hostname);}catch{}
    }
    text=C.text(text,6000);
    const adEvidence=detectAdEvidence(el,site);
    // A text-derived local ID handles roots with no stable permalink. It is not sent to TypeSafe.
    if (!id) id=`text:${C.text(author,80)}:${text.slice(0,160)}:${mediaAlt.slice(0,40)}`;
    return C.sanitizeRecord({id,author,text,mediaAlt,quotedText,truncated,context:C.pageContext(location.href),adEvidence,linkDomains},site);
  }
  globalThis.FeedGateAdapters=Object.freeze({SPECS,collect,extract,safeText,privateElement,detectAdEvidence});
})();
