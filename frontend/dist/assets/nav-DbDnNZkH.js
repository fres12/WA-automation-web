(function(){const a=document.createElement("link").relList;if(a&&a.supports&&a.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))s(e);new MutationObserver(e=>{for(const t of e)if(t.type==="childList")for(const n of t.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function i(e){const t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?t.credentials="include":e.crossOrigin==="anonymous"?t.credentials="omit":t.credentials="same-origin",t}function s(e){if(e.ep)return;e.ep=!0;const t=i(e);fetch(e.href,t)}})();async function u(){try{const r=await fetch("/api/auth/me"),a=await r.json();return!r.ok||!a.success?(window.location.assign("/login"),null):a}catch{return window.location.assign("/login"),null}}const o=document.querySelector("[data-app-nav]");var c;if(o){const r=window.location.pathname,a=r==="/form"?"/":r;o.innerHTML=`
    <nav class="app-nav" aria-label="Navigasi utama">
      <a class="brand" href="/home">WA <span>Automation</span></a>
      <div class="nav-links">
        <a data-nav-path="/dashboard" href="/dashboard">Home</a>
        <a data-nav-path="/" href="/">Form</a>
        <a data-nav-path="/wa-status" href="/wa-status">WA Status</a>
        <a data-nav-path="/account" href="/account">Akun</a>
      </div>
    </nav>
  `,(c=o.querySelector(`[data-nav-path="${a}"]`))==null||c.classList.add("active")}export{u as c};
