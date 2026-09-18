/* SPDX-License-Identifier: GPL-3.0-or-later */
(() => {
  const samples=[
    {author:'@garden_notes',text:'Basil roots need oxygen as well as water. Let the top centimetre of soil dry between waterings, and use a pot with a drainage hole.'},
    {author:'@orbit_shoes',text:'Our new walking shoes are here. Save 25% this weekend with code WALK25. Shop the collection today.',sponsored:true},
    {author:'@curious_builder',text:'I made a tiny open-source tool that explains SQLite query plans. It runs locally, includes tests, and has no account or paid tier. Feedback on the docs would be useful.'},
    {author:'@reaction_factory',text:'Only the smartest 1% will understand this. Like, repost and comment YES and I will send you the secret. Following everyone who replies!'},
    {author:'@chart_notes',text:'The median can be more informative than the mean when a distribution has extreme outliers. Here is a concrete example: 1, 2, 3, 4 and 100.'},
    {author:'@instant_money',text:'Guaranteed 50x returns with no risk. Send your wallet recovery phrase to claim the private bonus. Limited slots, act now!'},
    {author:'@weekend_cook',text:'I finally learned to fold dumplings without turning the kitchen into a flour-based weather event.'},
    {author:'@relnotes',text:'Released v1.4 today. Added Windows support, reduced memory usage 31% and fixed three parser bugs. Release notes and checksums are in the repository.'},
    {author:'@growth_notes',text:'We changed onboarding from 7 screens to 3. Activation increased from 41% to 58% across 12,400 users. The breakdown and methodology are in the thread.'},
    {author:'@hustle_quotes',text:'Work hard. Stay focused. Never quit. Winners win.'},
    {author:'@data_questions',text:'Has anyone benchmarked SQLite WAL against Postgres for this workload? I am seeing about 18k writes per second locally.'}
  ];
  let serial=1;
  function create(sample){const article=document.createElement('article');article.className='demo-post';article.setAttribute('data-feedgate-demo-post','');article.setAttribute('data-post-id','demo-'+serial++);article.setAttribute('data-promoted',sample.sponsored?'true':'false');const h=document.createElement('header'),a=document.createElement('span');a.setAttribute('data-author','');a.textContent=sample.author;h.append(a);if(sample.sponsored){const label=document.createElement('span');label.className='demo-label';label.textContent='Sponsored';h.append(label);}const body=document.createElement('p');body.setAttribute('data-post-text','');body.textContent=sample.text;article.append(h,body);return article;}
  const list=document.getElementById('demo-posts');for(const s of samples)list.append(create(s));
  document.getElementById('add-post').addEventListener('click',()=>list.append(create(samples[(serial-1)%samples.length])));
  document.getElementById('recycle-post').addEventListener('click',()=>{const first=list.querySelector('article');const fresh=create(samples[serial%samples.length]);for(const a of ['data-post-id','data-promoted'])first.setAttribute(a,fresh.getAttribute(a));first.replaceChildren(...fresh.childNodes);});
  document.getElementById('demo-settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
})();
