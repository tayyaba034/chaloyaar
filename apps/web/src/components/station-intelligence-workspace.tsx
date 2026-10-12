"use client";

import { useState } from "react";
import { Bell, Cube, MapPin, Microphone, Pulse, Robot, SlidersHorizontal, Sparkle, Target, TrendUp, WifiHigh } from "@phosphor-icons/react";
import "./station-intelligence.css";

type Panel = "overview" | "map" | "reports" | "assistant" | "alerts" | "provider";

const stations = [
  { name: "D-Ground Fuel Point", latitude: 31.4181, longitude: 73.0792, warning: "Petrol queue reported" },
  { name: "Susan Road PSO", latitude: 31.4255, longitude: 73.0911 },
  { name: "Canal View Station", latitude: 31.4074, longitude: 73.0668, warning: "Diesel unavailable" },
  { name: "Kohinoor Energy", latitude: 31.4312, longitude: 73.0654 },
];

const prompts = [
  "Find petrol with no queue near D-Ground",
  "Which station has the freshest diesel report?",
  "Show stations reachable in 10 minutes",
];

export function StationIntelligenceWorkspace() {
  const [panel, setPanel] = useState<Panel>("overview");
  const [radius, setRadius] = useState(12);
  const [pitch, setPitch] = useState(48);
  const [terrain, setTerrain] = useState(true);
  const [alerts, setAlerts] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [saved, setSaved] = useState(false);
  const [voice, setVoice] = useState(false);

  function askAssistant(message = assistantMessage) {
    if (!message.trim()) return;
    setAssistantMessage(message);
    setAssistantAnswer(`I found 3 grounded options near D-Ground. Susan Road PSO is 2.4 km away with a fresh availability report. I can compare detour time or open directions.`);
  }

  async function enableAlerts() {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setAlerts(permission === "granted");
    } else {
      setAlerts(true);
    }
  }

  return (
    <main className="station-intelligence">
      <section className="si-hero">
        <div>
          <p className="si-kicker"><Pulse weight="fill" /> STATION INTELLIGENCE / PILOT CONSOLE</p>
          <h1>See the city before you move.</h1>
          <p className="si-hero-copy">A live operations view for station coverage, fuel confidence, provider reach and driver alerts.</p>
        </div>
        <div className="si-hero-status"><span className="si-live-dot" /> Data refreshed 42 sec ago</div>
      </section>

      <nav className="si-tabs" aria-label="Station intelligence sections">
        {([
          ["overview", "Overview", TrendUp],
          ["map", "3D map", Cube],
          ["reports", "Report heat map", Target],
          ["assistant", "Assistant v2", Robot],
          ["alerts", "Alerts & push", Bell],
          ["provider", "Provider radius", SlidersHorizontal],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} className={panel === key ? "is-active" : ""} onClick={() => setPanel(key)} type="button">
            <Icon weight={panel === key ? "fill" : "regular"} /> {label}
          </button>
        ))}
      </nav>

      {panel === "overview" && (
        <>
          <section className="si-stat-grid">
            <article><span>Stations monitored</span><strong>24</strong><small className="positive">+4 this week</small></article>
            <article><span>Reports in last 24h</span><strong>186</strong><small className="positive">92% verified</small></article>
            <article><span>Provider reach</span><strong>{radius} km</strong><small>Faisalabad pilot area</small></article>
            <article><span>Active alerts</span><strong>08</strong><small className="warning">3 need review</small></article>
          </section>
          <section className="si-overview-grid">
            <article className="si-card si-card-map">
              <div className="si-card-heading"><div><p className="si-eyebrow">CITY COVERAGE</p><h2>Faisalabad operating picture</h2></div><button type="button" className="si-link-button" onClick={() => setPanel("map")}>Open 3D map →</button></div>
              <div className="si-mini-map"><div className="si-map-grid" /><span className="si-map-radius" /><span className="si-map-center"><MapPin weight="fill" /></span>{stations.map((station, index) => <span key={station.name} className={`si-map-marker m${index}`}><MapPin weight="fill" /></span>)}</div>
            </article>
            <article className="si-card">
              <div className="si-card-heading"><div><p className="si-eyebrow">SIGNALS</p><h2>What needs attention</h2></div><Sparkle weight="fill" /></div>
              <ul className="si-signal-list">
                <li><span className="si-signal-icon warning"><Pulse weight="fill" /></span><div><strong>Diesel confidence dropped</strong><small>Canal View Station · 8 min ago</small></div><b>Review</b></li>
                <li><span className="si-signal-icon blue"><WifiHigh weight="fill" /></span><div><strong>Provider coverage gap</strong><small>East Canal Road · 2.1 km outside radius</small></div><b>Adjust</b></li>
                <li><span className="si-signal-icon green"><Bell weight="fill" /></span><div><strong>Watchlist alert resolved</strong><small>D-Ground Fuel Point · 14 min ago</small></div><b>Done</b></li>
              </ul>
            </article>
          </section>
          <section className="si-card si-quick-start"><div><p className="si-eyebrow">QUICK START</p><h2>Test each intelligence layer</h2><p>Use the tabs above to simulate operations flows with seeded Faisalabad data.</p></div><div className="si-quick-actions"><button type="button" onClick={() => setPanel("assistant")}><Robot /> Ask the assistant</button><button type="button" onClick={() => setPanel("reports")}><Target /> Explore reports</button><button type="button" onClick={() => setPanel("alerts")}><Bell /> Configure alerts</button></div></section>
        </>
      )}

      {panel === "map" && (
        <section className="si-card si-panel-card">
          <div className="si-panel-heading"><div><p className="si-eyebrow">MAPLIBRE 3D / CESIUM SHOWCASE</p><h2>Pilot area in 3D</h2><p>Toggle terrain and tilt the view to inspect station density and reachable coverage.</p></div><span className="si-badge si-badge-green">WebGL ready</span></div>
          <div className="si-map-toolbar"><label>Pitch <input type="range" min="0" max="70" value={pitch} onChange={(event) => setPitch(Number(event.target.value))} /> <b>{pitch}°</b></label><label><input type="checkbox" checked={terrain} onChange={(event) => setTerrain(event.target.checked)} /> Terrain & building heights</label><button type="button" className="si-secondary" onClick={() => setPanel("reports")}>Show layers</button></div>
          <div className={`si-3d-stage ${terrain ? "terrain-on" : ""}`} style={{ ["--si-pitch" as string]: `${pitch}deg` }}><div className="si-3d-horizon" /><div className="si-3d-roads" /><div className="si-3d-buildings">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ ["--i" as string]: index }} />)}</div>{stations.map((station, index) => <span key={station.name} className={`si-3d-pin p${index}`}><MapPin weight="fill" /></span>)}<div className="si-3d-label"><Cube weight="fill" /> {terrain ? "Tilted terrain preview" : "2D fallback mode"}</div></div>
          <div className="si-showcase-strip"><div><strong>Cesium showcase</strong><span>Full-scene pilot flyover · 4 stations · 12 km radius</span></div><button type="button" className="si-primary" onClick={() => setSaved(true)}>{saved ? "Showcase queued" : "Launch showcase preview"}</button></div>
        </section>
      )}

      {panel === "reports" && (
        <section className="si-card si-panel-card"><div className="si-panel-heading"><div><p className="si-eyebrow">SPATIAL SIGNALS</p><h2>Report heat map</h2><p>See where availability reports cluster, expire and conflict.</p></div><div className="si-filter-pills"><button className="active" type="button">All reports</button><button type="button">Petrol</button><button type="button">Diesel</button></div></div><div className="si-heatmap"><div className="si-heat-grid" /><span className="heat h1" /><span className="heat h2" /><span className="heat h3" /><span className="heat h4" /><span className="heat h5" /><div className="si-heat-legend"><span>Low</span><i /><i /><i /><i /><span>High</span></div><span className="si-heat-label l1">D-Ground</span><span className="si-heat-label l2">Susan Road</span><span className="si-heat-label l3">Canal Road</span></div><div className="si-report-table"><div><span>Fresh reports</span><strong>124</strong><small>within 30 minutes</small></div><div><span>Conflicting reports</span><strong className="warning-text">09</strong><small>needs moderation</small></div><div><span>Reachable area</span><strong>68%</strong><small>within 10 minutes</small></div></div></section>
      )}

      {panel === "assistant" && (
        <section className="si-assistant-layout"><article className="si-card si-assistant-card"><div className="si-panel-heading"><div><p className="si-eyebrow">STATION ASSISTANT V2</p><h2>Ask with text or voice</h2><p>Grounded answers combine reports, distance, queue risk and provider reach.</p></div><span className="si-ai-orb"><Robot weight="fill" /></span></div><div className="si-chat-window"><div className="si-chat-bubble user">Find petrol with no queue near D-Ground</div><div className="si-chat-bubble assistant"><span className="si-chat-avatar"><Sparkle weight="fill" /></span><div><p>I found <strong>3 grounded options</strong>. Susan Road PSO is the best match with a fresh report and 2.4 km distance.</p><div className="si-chat-results"><span>✓ Fresh report</span><span>↗ 2.4 km</span><span>◷ Low queue risk</span></div></div></div>{assistantAnswer && <div className="si-chat-bubble assistant"><span className="si-chat-avatar"><Sparkle weight="fill" /></span><p>{assistantAnswer}</p></div>}</div><div className="si-prompt-row">{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => askAssistant(prompt)}>{prompt}</button>)}</div><form className="si-chat-input" onSubmit={(event) => { event.preventDefault(); askAssistant(); }}><button type="button" className={voice ? "recording" : ""} onClick={() => setVoice(!voice)} aria-label="Toggle voice input"><Microphone weight="fill" /></button><input value={assistantMessage} onChange={(event) => setAssistantMessage(event.target.value)} placeholder="Ask about stations, fuel or queues..." /><button type="submit"><Sparkle weight="fill" /></button></form></article><aside className="si-card si-tool-card"><p className="si-eyebrow">TOOLS</p><h3>Assistant guardrails</h3><label><input type="checkbox" defaultChecked /> Only cite station reports</label><label><input type="checkbox" defaultChecked /> Include freshness timestamp</label><label><input type="checkbox" defaultChecked /> Explain confidence level</label><div className="si-confidence"><span>Answer confidence</span><strong>87%</strong><div><i /></div></div></aside></section>
      )}

      {panel === "alerts" && (
        <section className="si-alert-layout"><article className="si-card si-panel-card"><div className="si-panel-heading"><div><p className="si-eyebrow">WATCHLIST & WEB PUSH</p><h2>Never miss a station change</h2><p>Get a browser notification when a watched station runs out or a fresh report changes confidence.</p></div><span className="si-alert-bell"><Bell weight="fill" /></span></div><div className="si-push-banner"><div><strong>{alerts ? "Browser alerts are enabled" : "Browser alerts are ready to enable"}</strong><span>{alerts ? "You will receive watchlist changes on this device." : "Permission is requested only after you choose Enable alerts."}</span></div><button type="button" className="si-primary" onClick={() => void enableAlerts()}>{alerts ? "Enabled ✓" : "Enable alerts"}</button></div><h3 className="si-subheading">Watched stations</h3><div className="si-watch-list">{stations.slice(0, 3).map((station) => <label key={station.name}><span><input type="checkbox" defaultChecked /> <MapPin weight="fill" /> {station.name}</span><small>{station.warning ? "Alert on change" : "All fuel types"}</small></label>)}</div></article><aside className="si-card si-event-card"><p className="si-eyebrow">RECENT EVENTS</p><h3>Alert timeline</h3><div><b>08:42</b><span>Diesel unavailable reported<br /><small>Canal View Station</small></span></div><div><b>08:16</b><span>Petrol restored<br /><small>D-Ground Fuel Point</small></span></div><div><b>07:54</b><span>New watch added<br /><small>Susan Road PSO</small></span></div></aside></section>
      )}

      {panel === "provider" && (
        <section className="si-provider-layout"><article className="si-card si-panel-card"><div className="si-panel-heading"><div><p className="si-eyebrow">PROVIDER COVERAGE</p><h2>Set your service radius</h2><p>Requests outside this boundary stay out of your queue. Adjust the radius to match your real operating area.</p></div><span className="si-provider-icon"><SlidersHorizontal weight="fill" /></span></div><div className="si-radius-control"><div className="si-radius-value"><strong>{radius}</strong><span>km</span></div><input type="range" min="2" max="30" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /><div className="si-range-labels"><span>2 km</span><span>30 km</span></div></div><div className="si-provider-map"><span className="si-provider-circle" style={{ ["--radius-scale" as string]: `${radius / 12}` }} /><span className="si-provider-pin"><MapPin weight="fill" /></span><span className="si-provider-map-label">{radius} km coverage radius</span><div className="si-provider-station ps1">3 requests</div><div className="si-provider-station ps2">1 request</div></div><div className="si-provider-summary"><div><span>Eligible requests</span><strong>12</strong></div><div><span>Outside radius</span><strong className="warning-text">3</strong></div><div><span>Avg response</span><strong>18 min</strong></div></div><button type="button" className="si-primary" onClick={() => setSaved(true)}>{saved ? "Coverage saved ✓" : "Save coverage settings"}</button></article><aside className="si-card si-evaluation-card"><p className="si-eyebrow">ASSISTANT EVALUATION</p><h3>Golden questions</h3><p>Run the four-language checks before changing the radius or alert rules.</p><div className="si-language-row"><span>English</span><b>8/8</b></div><div className="si-language-row"><span>Urdu</span><b>7/8</b></div><div className="si-language-row"><span>Roman Urdu</span><b>8/8</b></div><div className="si-language-row"><span>Punjabi</span><b>6/8</b></div><button type="button" className="si-secondary" onClick={() => setPanel("assistant")}>Run sample questions →</button></aside></section>
      )}

      {panel === "overview" && <div className="si-powered"><WifiHigh /> Prototype data is clearly labelled. Connect Supabase, VAPID keys and map credentials to move these controls from demo to live.</div>}
      {panel === "map" && <div className="si-powered"><WifiHigh /> MapLibre uses the existing map renderer; Cesium showcase is represented as a launch-ready preview surface.</div>}
    </main>
  );
}
