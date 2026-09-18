/* SPDX-License-Identifier: GPL-3.0-or-later
 * DOM adapters are deliberately separate from policy and inference.
 * X and Reddit are primary targets; the other site selectors are experimental.
 */
(() => {
  'use strict';
  if (globalThis.FeedGateAdapters) return;
  const C=globalThis.FeedGateCore;
  const SPECS = {
    x: {posts:'article[data-testid="tweet"]',body:'[data-testid="tweetText"]',author:'[data-testid="User-Name"]',link:'a[href*="/status/"]'},
    reddit: {posts:'shreddit-post, [data-testid="post-container"], .thing[data-fullname^="t3_"]',body:'[slot="title"], [slot="text-body"], [data-testid="post-title"], [data-testid="post-content"], .title, .usertext-body',author:'[slot="credit-bar"] a[href*="/user/"], a[data-testid="post_author_link"], a.author',link:'a[href*="/comments/"]'},
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
  function isSponsored(el,spec) {
    if ((el.hasAttribute('is-promoted')&&el.getAttribute('is-promoted')!=='false') || el.getAttribute('data-promoted')==='true') return true;
    const notOwnMarker=node=>!!node.closest(spec.body)||!!node.closest(spec.author)||!!node.closest('header,[data-testid="quoteTweet"],[role="link"][tabindex="0"]');
    for(const marker of el.querySelectorAll('[data-testid="promotedIndicator"], [data-testid="placementTracking"], [data-ad-rendering-role="sponsored_label"]'))if(!notOwnMarker(marker))return true;
    const labels=/^(sponsored|promoted|advertisement|sponsorowane|promowane|reklama|patrocinado|sponsorisé|gesponsert)$/i;
    for (const node of [...el.querySelectorAll('span, [aria-label]')].slice(0,250)) {
      if (notOwnMarker(node)) continue;
      const a=C.text(node.getAttribute('aria-label'),40);
      const t=node.childElementCount<3?C.text(node.textContent,40):'';
      if (labels.test(a)||labels.test(t)) return true;
      if (t==='Ad' && node.tagName==='SPAN' && !node.closest('[data-post-text]')) return true;
    }
    return false;
  }
  function extract(el,site) {
    const spec=SPECS[site];
    if (!spec || !el.isConnected || privateElement(el)) return null;
    const bodies=[...el.querySelectorAll(spec.body)].filter(n=>!privateElement(n));
    // Separate visible quotation from the author's own words. Never click Show more.
    const isQuote=n=>site==='x' && !!n.closest('[data-testid="quoteTweet"], [data-testid="quoteTweetText"], [role="link"][tabindex="0"]');
    const mainBodies=bodies.filter(n=>!isQuote(n));
    let text=mainBodies.map(n=>safeText(n)).filter(Boolean).join('\n');
    const quotedText=bodies.filter(isQuote).map(n=>safeText(n,2500)).join('\n');
    const truncated=!!el.querySelector('[data-testid="tweet-text-show-more-link"], [data-testid="showMoreText"]');
    // Generic fallbacks are intentionally limited to known post roots, never document.body.
    if (!text && ['linkedin','instagram'].includes(site)) text=safeText(el);
    if (site==='reddit') text=[el.getAttribute('post-title')||'',text].filter(Boolean).join('\n');
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
    const sponsored=isSponsored(el,spec);
    // A text-derived local ID handles roots with no stable permalink. It is not sent to TypeSafe.
    if (!id) id=`text:${C.text(author,80)}:${text.slice(0,160)}:${mediaAlt.slice(0,40)}`;
    return C.sanitizeRecord({id,author,text,mediaAlt,quotedText,truncated,context:C.pageContext(location.href),sponsored,linkDomains},site);
  }
  globalThis.FeedGateAdapters=Object.freeze({SPECS,collect,extract,safeText,privateElement});
})();
