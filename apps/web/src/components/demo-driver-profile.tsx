"use client";

import { useState } from "react";
import { BookmarkSimple, Car, Check, Clock, DownloadSimple, GasPump, PencilSimple, Plus, Trash, Wallet, X } from "@phosphor-icons/react";
import { demoStations } from "@/lib/station-data";
import { Link } from "@/i18n/navigation";
import { useDemoAccount, type DemoAccount, type DemoVehicle } from "./use-demo-account";

const tabs = ["overview", "details", "vehicles", "fuel", "activity", "preferences"] as const;
type Tab = typeof tabs[number];
const labels: Record<Tab, string> = { overview: "Overview", details: "Personal details", vehicles: "Vehicles", fuel: "Fuel logs", activity: "Activity", preferences: "Preferences" };
const money = (amount: number) => `PKR ${amount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;

export function DemoDriverProfile({ initialTab = "overview" }: { initialTab?: Tab }) {
  const { account, update, reset } = useDemoAccount();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [notice, setNotice] = useState("");
  const [editingVehicle, setEditingVehicle] = useState<DemoVehicle | "new" | null>(null);
  const [addingLog, setAddingLog] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [month, setMonth] = useState("all");
  function save(change: (current: DemoAccount) => DemoAccount, message = "Demo changes saved on this browser.") {
    const success = update(change);
    setNotice(success ? message : "Browser storage is unavailable. Changes could not be saved.");
    return success;
  }
  const logs = account.logs.filter(log => (vehicleFilter === "all" || log.vehicleId === vehicleFilter) && (month === "all" || log.date.startsWith(month)));
  const total = logs.reduce((sum, log) => sum + log.amount, 0);
  const litres = logs.reduce((sum, log) => sum + log.litres, 0);
  function exportDemo() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(account, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "chalo-yaar-demo-profile.json"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Demo account exported. The file contains sample data and your local edits.");
  }
  return <div className="demo-account">
    <section className="demo-account-identity" aria-label="Demo account summary">
      <span className={`demo-account-avatar avatar-${account.avatar}`}>{account.name.trim().slice(0, 1).toUpperCase() || "D"}</span>
      <div><span className="demo-label">Demo account</span><h2>{account.name}</h2><p>{account.email} <span aria-hidden="true">/</span> {account.city}</p></div>
      <button className="demo-secondary" onClick={() => setTab("details")}><PencilSimple />Edit profile</button>
    </section>
    <p className="demo-data-note">All records below are demo data. Local edits stay in this browser; no providers are contacted and no reports are published.</p>
    <div className="demo-account-tabs" role="tablist" aria-label="Driver profile">{tabs.map(value => <button key={value} role="tab" id={`tab-${value}`} aria-selected={value === tab} aria-controls="profile-panel" tabIndex={value === tab ? 0 : -1} onClick={() => { setTab(value); setNotice(""); }} onKeyDown={event => {
      const index = tabs.indexOf(value);
      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
      if (next !== null) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`tab-${tabs[next]}`)?.focus(); }
    }}>{labels[value]}</button>)}</div>
    {notice && <p className="demo-notice" role="status">{notice}</p>}
    <section id="profile-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
      {tab === "overview" && <>
        <div className="demo-account-stats"><div><Car /><span>Demo vehicles</span><strong>{account.vehicles.length}</strong></div><div><GasPump /><span>Logged fuel (demo)</span><strong>{account.logs.reduce((sum, log) => sum + log.litres, 0).toLocaleString()} L</strong></div><div><Wallet /><span>Recorded spend (demo)</span><strong>{money(account.logs.reduce((sum, log) => sum + log.amount, 0))}</strong></div></div>
        <div className="demo-account-heading"><h2>Saved stations</h2><Link href="/demo/stations">Browse demo stations</Link></div>
        <div className="demo-account-list">{account.savedStations.map(id => { const station = demoStations.find(item => item.id === id); return station && <article key={id}><BookmarkSimple /><div><h3>{station.name}</h3><p>Demo data / Stock and prices unknown</p></div><button className="demo-icon-button" aria-label={`Remove saved ${station.name}`} title="Remove saved station" onClick={() => save(current => ({ ...current, savedStations: current.savedStations.filter(value => value !== id) }))}><X /></button></article>; })}{!account.savedStations.length && <p>No saved demo stations.</p>}</div>
        <div className="demo-account-heading"><h2>Recent activity</h2><button className="demo-text-button" onClick={() => setTab("activity")}>View history</button></div>
        {account.requests.slice(0, 2).map(request => <div className="demo-history-row" key={request.id}><Clock /><div><strong>{request.service}</strong><p>{request.id} / {request.date}</p></div><span className="demo-label">{request.status}</span></div>)}
      </>}
      {tab === "details" && <form className="demo-account-form" key={`${account.name}-${account.email}-${account.city}-${account.avatar}`} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name")).trim(); const city = String(data.get("city")).trim();
        if (!name || !city) { setNotice("Name and city cannot be blank."); return; }
        save(current => ({ ...current, name, email: String(data.get("email")).trim(), city, avatar: String(data.get("avatar")) }));
      }}><h2>Personal details</h2><div className="demo-form-grid"><label>Display name<input name="name" defaultValue={account.name} required maxLength={60} /></label><label>Demo email<input name="email" type="email" defaultValue={account.email} required maxLength={120} /></label><label>City<input name="city" defaultValue={account.city} required maxLength={60} /></label><label>Account type<input value="Demo driver" readOnly /></label></div><fieldset className="demo-avatar-options"><legend>Avatar colour</legend>{["green", "orange", "blue", "rose"].map(colour => <label key={colour} className={`avatar-${colour}`} title={colour}><input type="radio" name="avatar" value={colour} defaultChecked={account.avatar === colour} aria-label={`${colour} avatar`} /><span /></label>)}</fieldset><button className="demo-primary" type="submit"><Check />Save profile</button></form>}
      {tab === "vehicles" && <>
        <div className="demo-account-heading"><h2>Your demo vehicles</h2><button className="demo-primary" onClick={() => setEditingVehicle("new")}><Plus />Add vehicle</button></div>
        <div className="demo-account-list">{account.vehicles.map(vehicle => <article key={vehicle.id}><Car /><div><h3>{vehicle.name}</h3><p>{vehicle.fuel} / {vehicle.economy} km/L (user-entered estimate)</p><label className="demo-primary-vehicle"><input type="radio" name="primary" checked={vehicle.id === account.primaryVehicle} onChange={() => save(current => ({ ...current, primaryVehicle: vehicle.id }))} />Primary vehicle</label></div><button className="demo-icon-button" title="Edit vehicle" aria-label={`Edit ${vehicle.name}`} onClick={() => setEditingVehicle(vehicle)}><PencilSimple /></button><button className="demo-icon-button" title="Remove vehicle" aria-label={`Remove ${vehicle.name}`} onClick={() => {
          if (account.logs.some(log => log.vehicleId === vehicle.id)) { setNotice("Remove this vehicle's fuel logs before removing the vehicle."); return; }
          save(current => ({ ...current, vehicles: current.vehicles.filter(v => v.id !== vehicle.id), primaryVehicle: current.primaryVehicle === vehicle.id ? current.vehicles.find(v => v.id !== vehicle.id)?.id ?? "" : current.primaryVehicle }));
        }}><Trash /></button></article>)}</div>
        {!account.vehicles.length && <p className="demo-empty">No vehicles. Add one to start a demo fuel log.</p>}
        {editingVehicle && <form className="demo-account-form demo-inline-editor" key={editingVehicle === "new" ? "new" : editingVehicle.id} onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget); const economy = Number(data.get("economy")); const name = String(data.get("name")).trim();
          if (!name || !Number.isFinite(economy) || economy <= 0 || economy > 200) { setNotice("Enter a vehicle name and economy between 0.1 and 200 km/L."); return; }
          const vehicle: DemoVehicle = { id: editingVehicle === "new" ? crypto.randomUUID() : editingVehicle.id, name, fuel: data.get("fuel") === "diesel" ? "diesel" : "petrol", economy };
          if (save(current => ({ ...current, vehicles: editingVehicle === "new" ? [...current.vehicles, vehicle] : current.vehicles.map(v => v.id === vehicle.id ? vehicle : v), primaryVehicle: current.primaryVehicle || vehicle.id }))) setEditingVehicle(null);
        }}><h3>{editingVehicle === "new" ? "Add demo vehicle" : "Edit demo vehicle"}</h3><div className="demo-form-grid"><label>Vehicle name<input name="name" required maxLength={60} defaultValue={editingVehicle === "new" ? "" : editingVehicle.name} /></label><label>Fuel type<select name="fuel" defaultValue={editingVehicle === "new" ? "petrol" : editingVehicle.fuel}><option value="petrol">Petrol</option><option value="diesel">Diesel</option></select></label><label>Fuel economy (km/litre)<input name="economy" type="number" min="0.1" max="200" step="0.1" required defaultValue={editingVehicle === "new" ? "" : editingVehicle.economy} /></label></div><div className="demo-form-actions"><button className="demo-primary" type="submit"><Check />Save vehicle</button><button className="demo-secondary" type="button" onClick={() => setEditingVehicle(null)}>Cancel</button></div></form>}
      </>}
      {tab === "fuel" && <>
        <div className="demo-account-heading"><h2>Demo fuel logs</h2><button className="demo-primary" disabled={!account.vehicles.length} onClick={() => setAddingLog(true)}><Plus />Add fuel log</button></div>
        <div className="demo-log-filters"><label>Vehicle<select value={vehicleFilter} onChange={event => setVehicleFilter(event.target.value)}><option value="all">All vehicles</option>{account.vehicles.map(v => <option value={v.id} key={v.id}>{v.name}</option>)}</select></label><label>Month<select value={month} onChange={event => setMonth(event.target.value)}><option value="all">All months</option>{Array.from(new Set(account.logs.map(log => log.date.slice(0, 7)))).sort().reverse().map(value => <option key={value}>{value}</option>)}</select></label></div>
        <p className="demo-log-total">{logs.length} demo entries / {litres.toLocaleString()} L / {money(total)} recorded. These are sample purchases, not current fuel prices.</p>
        <div className="demo-table-scroll"><table className="demo-account-table"><caption className="sr-only">Sample fuel purchases</caption><thead><tr><th>Date</th><th>Vehicle</th><th>Litres</th><th>Amount (demo)</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{log.date}</td><td>{account.vehicles.find(v => v.id === log.vehicleId)?.name ?? "Removed vehicle"}</td><td>{log.litres}</td><td>{money(log.amount)}</td><td><button className="demo-icon-button" aria-label={`Delete fuel log ${log.date}`} title="Delete demo fuel log" onClick={() => save(current => ({ ...current, logs: current.logs.filter(value => value.id !== log.id) }))}><Trash /></button></td></tr>)}</tbody></table></div>{!logs.length && <p className="demo-empty">No fuel logs match these filters.</p>}
        {addingLog && <form className="demo-account-form demo-inline-editor" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget); const amount = Number(data.get("amount")); const litres = Number(data.get("litres"));
          if (!Number.isFinite(amount) || !Number.isFinite(litres) || amount <= 0 || litres <= 0) { setNotice("Litres and amount must be positive numbers."); return; }
          if (save(current => ({ ...current, logs: [{ id: crypto.randomUUID(), vehicleId: String(data.get("vehicle")), date: String(data.get("date")), litres, amount }, ...current.logs] }))) setAddingLog(false);
        }}><h3>Add sample fuel purchase</h3><div className="demo-form-grid"><label>Vehicle<select name="vehicle" defaultValue={account.primaryVehicle}>{account.vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label><label>Date<input name="date" type="date" required defaultValue="2026-10-11" /></label><label>Litres<input name="litres" type="number" min="0.01" max="1000" step="0.01" required /></label><label>Recorded amount (PKR)<input name="amount" type="number" min="0.01" max="1000000" step="0.01" required /></label></div><div className="demo-form-actions"><button className="demo-primary" type="submit"><Check />Save fuel log</button><button className="demo-secondary" type="button" onClick={() => setAddingLog(false)}>Cancel</button></div></form>}
      </>}
      {tab === "activity" && <><h2>Roadside request history</h2><p className="demo-data-note">Simulated requests only. Status changes do not dispatch a provider.</p>{account.requests.map(request => <article className="demo-history-row" key={request.id}><Clock /><div><h3>{request.service}</h3><p>{request.id} / {request.date}</p><span className="demo-label">{request.status}</span></div>{request.status === "Previewed" && <button className="demo-secondary" onClick={() => save(current => ({ ...current, requests: current.requests.map(item => item.id === request.id ? { ...item, status: "Cancelled (simulated)" } : item) }), "Demo request cancelled locally. No provider was contacted.")}>Cancel preview</button>}</article>)}<h2 className="demo-history-title">Submitted reports</h2>{account.reports.map(report => <article className="demo-history-row" key={report.id}><GasPump /><div><h3>{report.station}</h3><p>{report.id} / {report.date}</p><span className="demo-label">{report.status}</span></div>{report.status === "Pending (simulated)" && <button className="demo-secondary" onClick={() => save(current => ({ ...current, reports: current.reports.map(item => item.id === report.id ? { ...item, status: "Withdrawn (simulated)" } : item) }))}>Withdraw demo report</button>}</article>)}</>}
      {tab === "preferences" && <><h2>Demo preferences</h2><div className="demo-preferences">{([{ key: "autoRead", label: "Read screens aloud", description: "Use a supported voice on this device." }, { key: "notifications", label: "Demo notification preference", description: "Preference only. No push notifications or emails are sent." }, { key: "reducedMotion", label: "Reduce motion", description: "Minimise dashboard transitions." }] as const).map(({ key, label, description }) => <label key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={account.preferences[key]} onChange={event => save(current => ({ ...current, preferences: { ...current.preferences, [key]: event.target.checked } }))} /></label>)}</div><div className="demo-account-heading"><div><h2>Your demo data</h2><p className="demo-data-note">Export local edits or restore the original sample account.</p></div><button className="demo-secondary" onClick={exportDemo}><DownloadSimple />Export demo data</button></div><button className="demo-secondary demo-danger" onClick={() => setResetting(true)}><Trash />Reset demo account</button>{resetting && <div className="demo-reset-confirm" role="group" aria-label="Confirm demo reset"><p>Restore all sample details? This removes local demo edits, vehicles and logs.</p><div className="demo-form-actions"><button className="demo-primary" onClick={() => { setNotice(reset() ? "Original demo account restored." : "Reset failed: browser storage unavailable."); setResetting(false); }}>Restore sample account</button><button className="demo-secondary" onClick={() => setResetting(false)}>Keep my edits</button></div></div>}</>}
    </section>
  </div>;
}
