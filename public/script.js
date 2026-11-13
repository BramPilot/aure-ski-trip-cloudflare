(() => {
  "use strict";

  const config = window.SKI_TRIP_CONFIG || {};
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const linkMap = [
    ["[data-booking-link]", config.bookingUrl],
    ["[data-idea-link]", config.ideaBoxUrl],
    ["[data-spotify-link]", config.spotifyUrl],
    ["[data-instagram-link]", config.instagramUrl],
    ["[data-terms-link]", config.termsUrl],
    ["[data-accommodation-link]", config.accommodationUrl],
    ["[data-totally-link]", config.totallySnowUrl]
  ];
  linkMap.forEach(([selector, url]) => {
    if (url) $$(selector).forEach((link) => { link.href = url; });
  });

  const toast = $("#soundToast");
  function notify(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  async function setupLiveData() {
    const bookingLinks = $$('[data-booking-link]');
    bookingLinks.forEach((link) => {
      link.dataset.openMarkup = link.innerHTML;
      link.addEventListener("click", (event) => {
        if (link.dataset.registrationOpen !== "false") return;
        event.preventDefault();
        notify("Registration is currently closed");
      });
    });

    try {
      const response = await fetch("/api/public", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error("Live trip data unavailable");
      const data = await response.json();
      const current = Math.max(0, Number(data.participantCount) || 0);
      const target = Math.max(1, Number(data.targetCount) || 20);
      const percentage = Math.min(100, Math.round((current / target) * 100));
      const ratio = `${current}/${target}`;

      $$('[data-participant-ratio]').forEach((element) => {
        element.textContent = element.closest(".header-meta") ? `${ratio} FILLED` : ratio;
      });
      $$('[data-current-count]').forEach((element) => { element.textContent = String(current); });
      $$('[data-target-count]').forEach((element) => { element.textContent = String(target); });
      $$('[data-participant-percentage]').forEach((element) => { element.textContent = `${percentage}%`; });
      $$('[data-registration-status]').forEach((element) => { element.textContent = data.registrationOpen ? "REGISTRATION IS LIVE" : "REGISTRATION IS CLOSED"; });
      $$('[data-registration-deadline]').forEach((element) => { element.textContent = data.registrationDeadline || "21 November 2026"; });

      const meter = $('[data-booking-meter]');
      if (meter) {
        meter.style.setProperty("--booking-progress", `${percentage}%`);
        meter.setAttribute("aria-valuenow", String(current));
        meter.setAttribute("aria-valuemax", String(target));
        meter.setAttribute("aria-label", `${current} of ${target} spots filled`);
      }

      bookingLinks.forEach((link) => {
        link.dataset.registrationOpen = String(Boolean(data.registrationOpen));
        if (data.bookingUrl) link.href = data.bookingUrl;
        link.classList.toggle("registration-closed", !data.registrationOpen);
        link.setAttribute("aria-disabled", String(!data.registrationOpen));
        if (data.registrationOpen) {
          link.innerHTML = link.dataset.openMarkup;
        } else {
          link.removeAttribute("href");
          link.innerHTML = 'REGISTRATION CLOSED <span aria-hidden="true">×</span>';
        }
      });

      const announcement = data.announcement;
      const announcementPanel = $("#siteAnnouncement");
      if (announcement && announcementPanel) {
        const dismissedKey = `aureSkiAnnouncement-${announcement.id}`;
        let dismissed = false;
        try { dismissed = localStorage.getItem(dismissedKey) === "dismissed"; } catch (_) { /* show it */ }
        if (!dismissed) {
          $("#announcementTitle").textContent = announcement.title;
          $("#announcementBody").textContent = announcement.body;
          announcementPanel.hidden = false;
          $("#dismissAnnouncement").onclick = () => {
            announcementPanel.hidden = true;
            try { localStorage.setItem(dismissedKey, "dismissed"); } catch (_) { /* dismissal remains temporary */ }
          };
        }
      }
    } catch (_) {
      /* The website keeps its 11/20 fallback when the live API is temporarily unavailable. */
    }
  }

  function setupJourney() {
    const journey = $("#journey");
    const background = $("#mountainBackground");
    const skier = $("#skier");
    const intro = $("#journeyIntro");
    const arrival = $("#arrivalMessage");
    const progressBar = $("#journeyProgress");
    const percent = $("#descentPercent");
    const status = $("#descentStatus");
    const notes = $$('[data-slope-note]');
    const path = [[56,17,-13],[43,28,16],[58,40,-18],[42,53,17],[59,65,-15],[45,74,12],[54,80,-6]];
    let progress = 0;
    let ticking = false;

    function pointOnPath(value) {
      const scaled = value * (path.length - 1);
      const index = Math.min(Math.floor(scaled), path.length - 2);
      const local = scaled - index;
      return path[index].map((item, i) => item + (path[index + 1][i] - item) * local);
    }

    function update() {
      const rect = journey.getBoundingClientRect();
      const distance = Math.max(journey.offsetHeight - window.innerHeight, 1);
      progress = clamp(-rect.top / distance, 0, 1);
      const [x, y, rotation] = pointOnPath(progress);
      background.style.transform = reducedMotion ? "translate3d(0,-38%,0)" : `translate3d(0,${-56 * progress}%,0) scale(${1 + progress * .035})`;
      skier.style.left = `${x}%`;
      skier.style.top = `${y}%`;
      skier.style.transform = `translate(-50%,-50%) rotate(${rotation}deg) scale(${1 + progress * .12})`;
      intro.style.opacity = clamp(1 - progress * 5.8, 0, 1);
      intro.style.transform = `translateY(${-38 * progress}px)`;
      const arrivalProgress = clamp((progress - .85) / .1, 0, 1);
      arrival.style.opacity = arrivalProgress;
      arrival.style.transform = `translate(-50%,${25 * (1 - arrivalProgress)}px)`;
      arrival.style.pointerEvents = arrivalProgress > .78 ? "auto" : "none";
      progressBar.style.transform = `translateY(${(progress - 1) * 100}%)`;
      percent.textContent = String(Math.round(progress * 100)).padStart(2, "0");
      status.textContent = progress < .18 ? "SUMMIT" : progress < .48 ? "FULL SEND" : progress < .84 ? "BASECAMP" : "ARRIVED";
      [0.16, 0.42, 0.66].forEach((threshold, i) => notes[i].classList.toggle("is-visible", progress > threshold && progress < threshold + .22));
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      $("#siteProgress").style.transform = `scaleX(${clamp(window.scrollY / maxScroll, 0, 1)})`;
    }

    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { update(); ticking = false; });
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    update();
    return () => progress;
  }

  function setupSnow(getJourneyProgress) {
    if (reducedMotion) return;
    const canvas = $("#snowCanvas");
    const context = canvas.getContext("2d");
    const flakes = Array.from({ length: Math.min(110, Math.floor(window.innerWidth / 8)) }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      radius: .5 + Math.random() * 2.1, speed: .35 + Math.random() * 1.1,
      drift: -.25 + Math.random() * .5, alpha: .25 + Math.random() * .68, colour: Math.floor(Math.random() * 3)
    }));
    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * ratio);
      canvas.height = Math.floor(window.innerHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    function frame() {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const party = document.body.classList.contains("sound-on");
      const colours = ["#fff0a0", "#fe2d02", "#ffffff"];
      flakes.forEach((flake) => {
        flake.y += flake.speed + getJourneyProgress() * 1.25 + (party ? .6 : 0);
        flake.x += flake.drift;
        if (flake.y > window.innerHeight + 5) { flake.y = -5; flake.x = Math.random() * window.innerWidth; }
        if (flake.x > window.innerWidth + 5) flake.x = -5;
        if (flake.x < -5) flake.x = window.innerWidth + 5;
        context.globalAlpha = flake.alpha;
        context.fillStyle = party ? colours[flake.colour] : "#ffffff";
        context.beginPath(); context.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2); context.fill();
      });
      context.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    resize(); window.addEventListener("resize", resize); requestAnimationFrame(frame);
  }

  function setupReveals() {
    const items = $$(".reveal");
    if (reducedMotion || !("IntersectionObserver" in window)) { items.forEach((item) => item.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible"); observer.unobserve(entry.target);
    }), { threshold: .12 });
    items.forEach((item) => observer.observe(item));
  }

  function setupTilt() {
    if (reducedMotion || !window.matchMedia("(pointer: fine)").matches) return;
    $$(".tilt-card").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.setProperty("--tilt-x", `${(-y * 3.4).toFixed(2)}deg`);
        card.style.setProperty("--tilt-y", `${(x * 4.2).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => { card.style.setProperty("--tilt-x", "0deg"); card.style.setProperty("--tilt-y", "0deg"); });
    });
  }

  function setupSound() {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    const toggle = $("#soundToggle");
    const label = toggle.querySelector("[data-sound-label]");
    let context, master, scheduler, nextStep = 0, step = 0, enabled = false;
    const stepDuration = 60 / 126 / 2;

    function tone(frequency, time, duration, type, volume) {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + .012); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      oscillator.connect(gain).connect(master); oscillator.start(time); oscillator.stop(time + duration + .02);
    }
    function kick(time) {
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.frequency.setValueAtTime(122, time); oscillator.frequency.exponentialRampToValueAtTime(42, time + .13);
      gain.gain.setValueAtTime(.18, time); gain.gain.exponentialRampToValueAtTime(.0001, time + .15);
      oscillator.connect(gain).connect(master); oscillator.start(time); oscillator.stop(time + .16);
    }
    function scheduleStep(index, time) {
      const bass = [110,110,146.83,164.81]; const melody = [659.25,0,783.99,0,880,783.99,659.25,587.33];
      const chords = [[220,277.18,329.63],[293.66,369.99,440],[329.63,415.3,493.88],[293.66,369.99,440]];
      if (index % 2 === 0) { kick(time); tone(bass[Math.floor(index/2)%bass.length], time, .19, "square", .032); }
      if (index % 2 === 1) chords[Math.floor(index/2)%chords.length].forEach((f) => tone(f,time,.16,"triangle",.009));
      if (melody[index % melody.length]) tone(melody[index % melody.length],time,.1,"triangle",.023);
      tone(index % 2 ? 2400 : 1800,time,.025,"square",.006);
    }
    function schedule() { while (nextStep < context.currentTime + .12) { scheduleStep(step,nextStep); step=(step+1)%8; nextStep += stepDuration; } }
    function updateUI(on) { document.body.classList.toggle("sound-on",on); toggle.setAttribute("aria-pressed",String(on)); label.textContent = on ? "Après on" : "Après mode"; }
    toggle.addEventListener("click", async () => {
      if (!AudioEngine) { notify("Sound mode is not supported by this browser"); return; }
      if (!context) { context = new AudioEngine(); master = context.createGain(); master.gain.value = .32; master.connect(context.destination); }
      if (!enabled) {
        await context.resume(); enabled=true; nextStep=context.currentTime+.04; scheduler=setInterval(schedule,50); updateUI(true);
        if (navigator.vibrate) navigator.vibrate([35,45,35]); notify("Après mode on — disco ball included");
      } else {
        enabled=false; clearInterval(scheduler); await context.suspend(); updateUI(false);
        if (navigator.vibrate) navigator.vibrate(20); notify("Après mode muted");
      }
    });
  }

  function setupUtilities() {
    $("#calendarButton").addEventListener("click", () => {
      const calendar = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//I.F.S. Aurelius//Aure Ski 2027//EN","BEGIN:VEVENT","UID:aure-ski-2027@ifsaurelius.nl","DTSTAMP:20260916T120000Z","DTSTART;VALUE=DATE:20270204","DTEND;VALUE=DATE:20270209","SUMMARY:Aure Ski 2027 - Val Thorens","LOCATION:Val Thorens\\, France","DESCRIPTION:I.F.S. Aurelius Ski Trip - 4 to 8 February 2027","END:VEVENT","END:VCALENDAR"].join("\r\n");
      const url = URL.createObjectURL(new Blob([calendar], { type:"text/calendar;charset=utf-8" }));
      const link = document.createElement("a"); link.href=url; link.download="Aure-Ski-2027.ics"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      notify("Calendar file downloaded");
    });
    $("#shareButton").addEventListener("click", async () => {
      try {
        if (navigator.share) { await navigator.share({ title:"Auré Ski 2027", text:"Five days. Three ski days. Val Thorens with I.F.S. Aurelius.", url:window.location.href }); return; }
        await navigator.clipboard.writeText(window.location.href); notify("Trip link copied");
      } catch (error) { if (error && error.name !== "AbortError") notify("Copy the page address to share the trip"); }
    });
  }

  function setupPackingList() {
    const items = $$('[data-pack-item]');
    if (!items.length) return;
    const storageKey = "aureSkiPackingListV1";
    const progress = $("#packingProgress");
    const percent = $("#packingPercent");
    const count = $("#packingCount");
    const reset = $("#packingReset");
    let previousChecked = 0;

    function load() {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
        if (Array.isArray(saved)) items.forEach((item) => { item.checked = saved.includes(item.value); });
      } catch (_) { /* keep an empty list if storage is unavailable */ }
    }

    function save() {
      try {
        localStorage.setItem(storageKey, JSON.stringify(items.filter((item) => item.checked).map((item) => item.value)));
      } catch (_) { /* checklist still works for the current visit */ }
    }

    function update(announce = false) {
      const checked = items.filter((item) => item.checked).length;
      const percentage = Math.round((checked / items.length) * 100);
      progress.style.setProperty("--packing-progress", percentage);
      progress.setAttribute("aria-valuenow", String(percentage));
      percent.textContent = `${percentage}%`;
      count.textContent = `${checked} of ${items.length} items ready`;
      $$(".packing-category").forEach((category) => {
        const categoryItems = [...category.querySelectorAll("[data-pack-item]")];
        category.querySelector("[data-pack-category-count]").textContent = `${categoryItems.filter((item) => item.checked).length} / ${categoryItems.length}`;
      });
      progress.closest(".packing-progress-card").classList.toggle("is-complete", checked === items.length);
      if (announce && checked === items.length && previousChecked !== items.length) notify("Packed and ready for Val Thorens");
      previousChecked = checked;
    }

    items.forEach((item) => item.addEventListener("change", () => { save(); update(true); }));
    reset.addEventListener("click", () => {
      if (!items.some((item) => item.checked)) return;
      if (!window.confirm("Clear your entire packing list?")) return;
      items.forEach((item) => { item.checked = false; });
      try { localStorage.removeItem(storageKey); } catch (_) { /* list is still cleared on screen */ }
      update();
      notify("Packing list reset");
    });
    load();
    update();
  }

  function setupVibePicker() {
    const buttons = $$("[data-vibe]"); const result = $("#vibeResult"); const title = $("#vibeResultTitle"); const text = $("#vibeResultText");
    const profiles = {
      easy:{title:"Good turns. Better company.",text:"Find your rhythm, enjoy the views and let the mountain do the rest."},
      cruise:{title:"Big views. Long laps. Zero rush.",text:"Explore the mountain, take the scenic route and leave room for a proper terrace stop."},
      send:{title:"First lift. Last run. No wasted turns.",text:"Chase the best snow, stack the kilometres and meet the crew back at basecamp."}
    };
    function select(key) {
      const profile=profiles[key]||profiles.easy; buttons.forEach((button)=>button.setAttribute("aria-pressed",String(button.dataset.vibe===key)));
      result.dataset.vibe=key; title.textContent=profile.title; text.textContent=profile.text;
      try { localStorage.setItem("aureSkiVibe",key); } catch (_) { /* preference remains temporary */ }
    }
    buttons.forEach((button)=>button.addEventListener("click",()=>select(button.dataset.vibe)));
    try { select(localStorage.getItem("aureSkiVibe")||"easy"); } catch (_) { select("easy"); }
  }

  function setupSectionRail() {
    if (!("IntersectionObserver" in window)) return;
    const links=$$("[data-section-link]"); const sections=links.map((link)=>document.getElementById(link.dataset.sectionLink)).filter(Boolean);
    const observer=new IntersectionObserver((entries)=>{
      const visible=entries.filter((entry)=>entry.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0]; if(!visible)return;
      links.forEach((link)=>link.dataset.sectionLink===visible.target.id?link.setAttribute("aria-current","true"):link.removeAttribute("aria-current"));
    },{rootMargin:"-20% 0px -60%",threshold:[0,.2,.5]}); sections.forEach((section)=>observer.observe(section));
  }

  function updateCountdown() {
    const departure=new Date(config.tripStart||"2027-02-04T00:00:00+01:00").getTime(); const difference=Math.max(departure-Date.now(),0);
    $("#days").textContent=String(Math.floor(difference/86400000)); $("#hours").textContent=String(Math.floor((difference/3600000)%24)).padStart(2,"0");
    $("#minutes").textContent=String(Math.floor((difference/60000)%60)).padStart(2,"0"); $("#seconds").textContent=String(Math.floor((difference/1000)%60)).padStart(2,"0");
  }

  function setupWeather() {
    const location=config.weather||{latitude:45.297,longitude:6.58,label:"Val Thorens"};
    const codeMap={0:["Clear","☀"],1:["Mainly clear","🌤"],2:["Partly cloudy","⛅"],3:["Overcast","☁"],45:["Fog","🌫"],48:["Rime fog","🌫"],51:["Light drizzle","🌦"],53:["Drizzle","🌦"],55:["Heavy drizzle","🌧"],61:["Light rain","🌦"],63:["Rain","🌧"],65:["Heavy rain","🌧"],71:["Light snow","🌨"],73:["Snowfall","❄"],75:["Heavy snow","❄"],77:["Snow grains","❄"],80:["Rain showers","🌦"],81:["Rain showers","🌧"],82:["Heavy showers","🌧"],85:["Snow showers","🌨"],86:["Heavy snow showers","❄"],95:["Thunderstorm","⛈"],96:["Storm with hail","⛈"],99:["Storm with hail","⛈"]};
    const labelFor=(code)=>codeMap[code]||["Mountain weather","◌"];
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,snowfall&daily=weather_code,temperature_2m_max,temperature_2m_min,snowfall_sum&timezone=Europe%2FParis&forecast_days=3`;
    fetch(url).then((response)=>{if(!response.ok)throw new Error("Weather unavailable");return response.json();}).then((data)=>{
      const [description,icon]=labelFor(data.current.weather_code); $("#weatherStatus").textContent=`${location.label} · updated ${data.current.time.slice(11,16)}`;
      $("#weatherTemperature").textContent=`${Math.round(data.current.temperature_2m)}°`; $("#weatherDescription").textContent=`${icon} ${description}${data.current.snowfall>0?" · snowing now":""}`;
      $("#weatherFeels").textContent=`${Math.round(data.current.apparent_temperature)}°`; $("#weatherWind").textContent=`${Math.round(data.current.wind_speed_10m)} km/h`;
      const names=["TODAY","TOMORROW",new Intl.DateTimeFormat("en",{weekday:"short"}).format(new Date(`${data.daily.time[2]}T12:00:00`)).toUpperCase()];
      $$("#weatherForecast > div").forEach((card,index)=>{const [desc,dayIcon]=labelFor(data.daily.weather_code[index]);card.innerHTML=`<span>${names[index]}</span><strong aria-label="${desc}">${dayIcon}</strong><small>${Math.round(data.daily.temperature_2m_min[index])}° / ${Math.round(data.daily.temperature_2m_max[index])}°${data.daily.snowfall_sum[index]>0?` · ${data.daily.snowfall_sum[index]} cm snow`:""}</small>`;});
    }).catch(()=>{
      $("#weatherStatus").textContent="Live weather temporarily unavailable"; $("#weatherDescription").textContent="The mountain is keeping its secrets";
      $("#weatherPanel").classList.add("weather-unavailable");
    });
  }

  setupLiveData();
  const getJourneyProgress=setupJourney(); setupSnow(getJourneyProgress); setupReveals(); setupTilt(); setupSound(); setupUtilities(); setupPackingList(); setupVibePicker(); setupSectionRail(); setupWeather();
  updateCountdown(); setInterval(updateCountdown,1000);
})();
