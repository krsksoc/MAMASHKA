import { getDb } from "../../data/db.js";

export function getStatsData() {
  const db = getDb();

  // Messages per hour (last 7 days)
  const hourRows = db
    .prepare(`
      SELECT strftime('%H', created_at) as hour, COUNT(*) as cnt
      FROM messages
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY hour
      ORDER BY hour
    `)
    .all() as Array<{ hour: string; cnt: number }>;

  // User growth by date (last 30 days)
  const growthRows = db
    .prepare(`
      SELECT date(first_seen_at) as dt, COUNT(*) as cnt
      FROM users
      WHERE first_seen_at >= datetime('now', '-30 days')
      GROUP BY dt
      ORDER BY dt
    `)
    .all() as Array<{ dt: string; cnt: number }>;

  // Top users
  const topRows = db
    .prepare(`
      SELECT display_name, username, message_count
      FROM users
      ORDER BY message_count DESC
      LIMIT 20
    `)
    .all() as Array<{
    display_name: string | null;
    username: string | null;
    message_count: number;
  }>;

  // Messages by weekday (last 30 days)
  const weekdayRows = db
    .prepare(`
      SELECT strftime('%w', created_at) as wd, COUNT(*) as cnt
      FROM messages
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY wd
      ORDER BY wd
    `)
    .all() as Array<{ wd: string; cnt: number }>;

  // Total counts
  const totalMsg = db.prepare("SELECT COUNT(*) as cnt FROM messages").get() as { cnt: number };
  const totalUsers = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };

  return {
    messagesByHour: hourRows.map((r) => ({ hour: `${r.hour}:00`, count: r.cnt })),
    userGrowth: growthRows.map((r) => ({ date: r.dt, count: r.cnt })),
    topUsers: topRows.map((r) => ({
      name: r.display_name ?? r.username ?? "Unknown",
      messages: r.message_count,
    })),
    messagesByWeekday: weekdayRows.map((r) => {
      const names = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      return { day: names[parseInt(r.wd, 10)], count: r.cnt };
    }),
    totals: {
      messages: totalMsg.cnt,
      users: totalUsers.cnt,
    },
  };
}

export function renderStatsPage(data: ReturnType<typeof getStatsData>): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mamoolya Stats</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    *{box-sizing:border-box}
    body{background:#0f0f23;color:#e0e0e0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:20px}
    h1{margin:0 0 20px;font-size:1.8rem}
    .totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin-bottom:25px}
    .card{background:#1a1a3e;border-radius:10px;padding:18px;text-align:center}
    .card .num{font-size:2rem;font-weight:700;color:#7ee787}
    .card .lbl{font-size:.85rem;color:#888;margin-top:4px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:20px}
    .chart-card{background:#1a1a3e;border-radius:10px;padding:15px}
    .chart-card h3{margin:0 0 12px;font-size:1rem;color:#ccc}
    canvas{max-height:280px}
    @media(max-width:500px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <h1>📊 Mamoolya Stats</h1>
  <div class="totals">
    <div class="card"><div class="num">${data.totals.messages.toLocaleString()}</div><div class="lbl">Сообщений</div></div>
    <div class="card"><div class="num">${data.totals.users.toLocaleString()}</div><div class="lbl">Юзеров</div></div>
  </div>
  <div class="grid">
    <div class="chart-card"><h3>Сообщения по часам (7 дней)</h3><canvas id="msgHour"></canvas></div>
    <div class="chart-card"><h3>Новые юзеры (30 дней)</h3><canvas id="userGrowth"></canvas></div>
    <div class="chart-card"><h3>Топ-20 по сообщениям</h3><canvas id="topUsers"></canvas></div>
    <div class="chart-card"><h3>Активность по дням недели</h3><canvas id="weekday"></canvas></div>
  </div>
  <script>
    const DATA=${json};
    Chart.defaults.color='#999';
    Chart.defaults.borderColor='#333';
    new Chart(document.getElementById('msgHour'),{type:'bar',data:{labels:DATA.messagesByHour.map(d=>d.hour),datasets:[{label:'Сообщений',data:DATA.messagesByHour.map(d=>d.count),backgroundColor:'#7ee787',borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    new Chart(document.getElementById('userGrowth'),{type:'line',data:{labels:DATA.userGrowth.map(d=>d.date.slice(5)),datasets:[{label:'Новые',data:DATA.userGrowth.map(d=>d.count),borderColor:'#70a1ff',backgroundColor:'rgba(112,161,255,0.15)',fill:true,tension:.3,pointRadius:2}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
    new Chart(document.getElementById('topUsers'),{type:'bar',data:{labels:DATA.topUsers.map(d=>d.name.slice(0,15)),datasets:[{label:'Сообщений',data:DATA.topUsers.map(d=>d.messages),backgroundColor:'#ff9ff3',borderRadius:4}]},options:{indexAxis:'y',responsive:true,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});
    new Chart(document.getElementById('weekday'),{type:'bar',data:{labels:DATA.messagesByWeekday.map(d=>d.day),datasets:[{label:'Сообщений',data:DATA.messagesByWeekday.map(d=>d.count),backgroundColor:'#feca57',borderRadius:4}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});
  </script>
</body>
</html>`;
}
