import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

function App() {
  const [metrics, setMetrics] = useState({});
  const [byPerson, setByPerson] = useState([]);
  const [insights, setInsights] = useState([]);
  const [pieData, setPieData] = useState([]);
  const [firstResponseChart, setFirstResponseChart] = useState([]);

  useEffect(() => {
    loadExcel();
  }, []);

  const loadExcel = async () => {
    const response = await fetch("/Week30.3.xlsx");
    const data = await response.arrayBuffer();

    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const total = jsonData.length;

    // Promedios reales
    const resolutionValues = jsonData
      .map(row => parseFloat(row["Time to resolution"]))
      .filter(val => !isNaN(val));

    const avgResolution = resolutionValues.length
      ? resolutionValues.reduce((a, b) => a + b, 0) / resolutionValues.length
      : 0;

    const firstResponseValues = jsonData
      .map(row => parseFloat(row["Time to first response"]))
      .filter(val => !isNaN(val));

    const avgFirstResponse = firstResponseValues.length
      ? firstResponseValues.reduce((a, b) => a + b, 0) / firstResponseValues.length
      : 0;

    // Agrupar por persona
    const grouped = {};

    jsonData.forEach(row => {
      const person = row["Persona asignada"] || "Sin asignar";
      const time = parseFloat(row["Time to resolution"]) || 0;

      if (!grouped[person]) {
        grouped[person] = { total: 0, count: 0 };
      }

      grouped[person].total += time;
      grouped[person].count += 1;
    });

    const byPersonData = Object.keys(grouped).map(person => ({
      name: person,
      value: grouped[person].total / grouped[person].count
    }));

    // Distribución resolución
    const buckets = {
      "0-24h": 0,
      "24-48h": 0,
      "48h+": 0
    };

    jsonData.forEach(row => {
      const time = parseFloat(row["Time to resolution"]) || 0;

      if (time <= 24) buckets["0-24h"]++;
      else if (time <= 48) buckets["24-48h"]++;
      else buckets["48h+"]++;
    });

    const pieDataFormatted = Object.keys(buckets).map(key => ({
      name: key,
      value: buckets[key]
    }));

    // Distribución primera respuesta
    const firstResponseBuckets = {
      "< 1h": 0,
      "1 - 4h": 0,
      "> 4h": 0
    };

    jsonData.forEach(row => {
      const time = parseFloat(row["Time to first response"]);

      if (isNaN(time)) return;

      if (time <= 1) firstResponseBuckets["< 1h"]++;
      else if (time <= 4) firstResponseBuckets["1 - 4h"]++;
      else firstResponseBuckets["> 4h"]++;
    });

    const firstResponseData = Object.keys(firstResponseBuckets).map(key => ({
      name: key,
      value: firstResponseBuckets[key]
    }));

    // Insights
    const insightsList = [];

    if (avgResolution > 24) {
      insightsList.push("⚠️ Tiempo de resolución alto");
    }

    if (avgFirstResponse > 4) {
      insightsList.push("⚠️ Tiempo de primera respuesta alto");
    }

    const slowPeople = byPersonData.filter(p => p.value > avgResolution);

    if (slowPeople.length > 0) {
      insightsList.push("⚠️ Hay personas con tiempos por encima del promedio");
    }

    const criticalTickets = jsonData.filter(
      row => parseFloat(row["Time to resolution"]) > 48
    );

    if (criticalTickets.length > 0) {
      insightsList.push(`🔴 ${criticalTickets.length} tickets críticos (>48h)`);
    }

    const sorted = [...byPersonData].sort((a, b) => b.value - a.value);

    if (sorted.length > 0) {
      insightsList.push(`🐢 Más lento: ${sorted[0].name}`);
    }

    const fastest = [...byPersonData].sort((a, b) => a.value - b.value);

    if (fastest.length > 0) {
      insightsList.push(`⚡ Más rápido: ${fastest[0].name}`);
    }

    setMetrics({
      tickets: total,
      avg_resolution: avgResolution,
      avg_first_response: avgFirstResponse
    });

    setByPerson(byPersonData);
    setInsights(insightsList);
    setPieData(pieDataFormatted);
    setFirstResponseChart(firstResponseData);
  };

  const cardStyle = {
    background: "white",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
    flex: 1
  };

  const maxValue = Math.max(...byPerson.map(p => p.value));
  const minValue = Math.min(...byPerson.map(p => p.value));

  const COLORS = ["#60a5fa", "#fbbf24", "#34d399"];

  return (
    <div style={{
      padding: "30px",
      fontFamily: "Inter, sans-serif",
      background: "linear-gradient(135deg, #eef2ff, #f8fafc)",
      minHeight: "100vh"
    }}>
      <h1 style={{ color: "#1e3a8a" }}>
  📊 Dashboard Jira PRO
</h1>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 20, marginBottom: 30 }}>
        <div style={cardStyle}>
          <h4>📂 Tickets</h4>
          <h2 style={{ color: "#2563eb" }}>{metrics.tickets}</h2>
        </div>

        <div style={cardStyle}>
          <h4>⏱️ Resolución</h4>
          <h2 style={{ color: "#2563eb" }}>
            {metrics.avg_resolution?.toFixed(2)}h
          </h2>
        </div>

        <div style={cardStyle}>
          <h4>🚀 Tiempo de primera respuesta</h4>
          <h2 style={{ color: "#2563eb" }}>
            {metrics.avg_first_response?.toFixed(2)}h
          </h2>
        </div>
      </div>

      {/* Gráfica por persona */}
      <h2 style={{ color: "#1e3a8a", marginTop: 40 }}>
        👥 Tiempo promedio de resolución por persona
      </h2>

      <BarChart
        width={700}
        height={450}
        data={byPerson}
        margin={{ top: 20, right: 30, left: 20, bottom: 150 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" angle={-90} textAnchor="end" interval={0} />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" radius={[8, 8, 0, 0]}>
          {byPerson.map((entry, index) => {
            let color = "#6366f1";
            if (entry.value === maxValue) color = "#fbcfe8";
            if (entry.value === minValue) color = "#bbf7d0";
            return <Cell key={index} fill={color} />;
          })}
        </Bar>
      </BarChart>

      {/* Donut */}
      <h2 style={{ color: "#1e3a8a", marginTop: 40 }}>
        📊 Distribución de tiempos
      </h2>

      <PieChart width={500} height={350}>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          outerRadius={100}
          innerRadius={60}
          label={({ name, percent }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
        >
          {pieData.map((entry, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Legend verticalAlign="bottom" />
        <Tooltip />
      </PieChart>

      {/* Primera respuesta */}
      <h2 style={{ color: "#1e3a8a", marginTop: 40 }}>
        🚀 Distribución del tiempo de primera respuesta
      </h2>

      <BarChart width={500} height={300} data={firstResponseChart}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" fill="#22c55e" radius={[8, 8, 0, 0]} />
      </BarChart>

      {/* Insights */}
      <h2 style={{ marginTop: 40 }}>🚨 Insights</h2>

      <ul>
        {insights.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;