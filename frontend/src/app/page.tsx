const lines = [
  { name: "Line 1", label: "Yonge-University", status: "Normal", tone: "green" },
  { name: "Line 2", label: "Bloor-Danforth", status: "Delay", tone: "amber" },
  { name: "Line 4", label: "Sheppard", status: "Normal", tone: "green" },
  { name: "Line 5", label: "Eglinton", status: "Ready", tone: "neutral" },
];

const alerts = [
  {
    title: "Line 2 delay",
    detail: "Eastbound service impact between St George and Broadview.",
    time: "Updated 8 min ago",
  },
  {
    title: "Planned closure",
    detail: "Weekend work window placeholder for segment-level closure display.",
    time: "Upcoming",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f7f2] text-[#17201b]">
      <header className="border-b border-[#d9ded1] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#b3202d]">
              Unofficial TTC reliability
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">LineWatch TO</h1>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Metric label="Live alerts" value="1" />
            <Metric label="Planned" value="1" />
            <Metric label="Last poll" value="10:06" />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="min-h-[520px] border border-[#cfd6c7] bg-white">
          <div className="flex items-center justify-between border-b border-[#d9ded1] px-4 py-3">
            <h2 className="text-base font-semibold">Subway/LRT Network</h2>
            <span className="rounded-full bg-[#fff0c2] px-3 py-1 text-sm font-medium text-[#715300]">
              1 active impact
            </span>
          </div>
          <div className="grid min-h-[470px] place-items-center p-5">
            <div className="w-full max-w-3xl">
              <div className="relative h-[320px] border border-[#d9ded1] bg-[#fbfcf8]">
                <LineRail className="left-[16%] top-[12%] h-[75%] w-2 bg-[#f2c84b]" />
                <LineRail className="left-[32%] top-[38%] h-2 w-[48%] bg-[#1f8f4d]" />
                <LineRail className="left-[58%] top-[20%] h-[46%] w-2 bg-[#d62828]" />
                <LineRail className="left-[46%] top-[61%] h-2 w-[26%] bg-[#8b5cf6]" />
                <StationDot className="left-[14.8%] top-[35%]" label="St Clair" />
                <StationDot className="left-[30.8%] top-[35%]" label="St George" />
                <StationDot className="left-[56.8%] top-[35%]" label="Bloor-Yonge" />
                <StationDot className="left-[77.8%] top-[35%]" label="Kennedy" />
                <div className="absolute left-[31%] top-[36.5%] h-3 w-[27%] bg-[#e48a1f]" />
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <section className="border border-[#cfd6c7] bg-white">
            <div className="border-b border-[#d9ded1] px-4 py-3">
              <h2 className="text-base font-semibold">Line Status</h2>
            </div>
            <div className="divide-y divide-[#edf0e8]">
              {lines.map((line) => (
                <div key={line.name} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{line.name}</p>
                    <p className="text-sm text-[#657063]">{line.label}</p>
                  </div>
                  <StatusPill tone={line.tone}>{line.status}</StatusPill>
                </div>
              ))}
            </div>
          </section>

          <section className="border border-[#cfd6c7] bg-white">
            <div className="border-b border-[#d9ded1] px-4 py-3">
              <h2 className="text-base font-semibold">Alerts</h2>
            </div>
            <div className="space-y-3 p-4">
              {alerts.map((alert) => (
                <article key={alert.title} className="border-l-4 border-[#b3202d] bg-[#faf7f4] px-3 py-2">
                  <h3 className="font-medium">{alert.title}</h3>
                  <p className="mt-1 text-sm text-[#4f5a51]">{alert.detail}</p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.1em] text-[#7a3a35]">
                    {alert.time}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section className="border border-[#cfd6c7] bg-white p-4">
            <h2 className="text-base font-semibold">Saved Commute</h2>
            <div className="mt-3 border border-[#d9ded1] bg-[#fbfcf8] p-3">
              <p className="font-medium">Finch to Union</p>
              <p className="mt-1 text-sm text-[#657063]">No active impact on the selected segment.</p>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#d9ded1] bg-[#fbfcf8] px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#657063]">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const classes =
    tone === "green"
      ? "bg-[#dff3df] text-[#14522b]"
      : tone === "amber"
        ? "bg-[#fff0c2] text-[#715300]"
        : "bg-[#eef1ea] text-[#4f5a51]";

  return <span className={`min-w-20 px-3 py-1 text-center text-sm font-medium ${classes}`}>{children}</span>;
}

function LineRail({ className }: { className: string }) {
  return <div className={`absolute rounded-full ${className}`} />;
}

function StationDot({ className, label }: { className: string; label: string }) {
  return (
    <div className={`absolute ${className}`}>
      <div className="h-5 w-5 rounded-full border-2 border-[#17201b] bg-white" />
      <span className="absolute left-1/2 top-7 w-24 -translate-x-1/2 text-center text-xs font-medium text-[#4f5a51]">
        {label}
      </span>
    </div>
  );
}
