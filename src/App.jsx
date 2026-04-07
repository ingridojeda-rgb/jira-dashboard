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

    const avgResolution =
      jsonData.reduce((acc, row) => acc + (parseFloat(row["Time to resolution"]) || 0), 0) / total;

    const avgFirstResponse =
      jsonData.reduce((acc, row) => acc + (parseFloat(row["Time to first response"]) || 0), 0) / total;

    // 🔥 Agrupar por persona
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

    // 🔥 Distribución de tiempos
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

    // 🚨 INSIGHTS PRO
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

    // 🔴 Tickets críticos
    const criticalTickets = jsonData.filter(
      row => parseFloat(row["Time to resolution"]) > 48
    );

    if (criticalTickets.length > 0) {
      insightsList.push(`🔴 ${criticalTickets.length} tickets críticos (>48h)`);
    }

    // 🐢 Más lento
    const sorted = [...byPersonData].sort((a, b) => b.value - a.value);

    if (sorted.length > 0) {
      insightsList.push(`🐢 Más lento: ${sorted[0].name}`);
    }

    // ⚡ Más rápido
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
  };

  return (
    <div style={{
      padding: 20,
      fontFamily: "Arial",
      backgroundColor: "#f5f6fa",
      minHeight: "100vh"
    }}>
      <h1>📊 Dashboard Jira PRO</h1>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div style={{ background: "white", padding: 20, borderRadius: 10 }}>
          <h3>📂 Tickets</h3>
          <p>{metrics.tickets}</p>
        </div>

        <div style={{ background: "white", padding: 20, borderRadius: 10 }}>
          <h3>⏱️ Resolución</h3>
          <p>{metrics.avg_resolution?.toFixed(2)} horas</p>
        </div>

        <div style={{ background: "white", padding: 20, borderRadius: 10 }}>
          <h3>⚡ Primera respuesta</h3>
          <p>{metrics.avg_first_response?.toFixed(2)} horas</p>
        </div>
      </div>

      {/* Gráfica por persona */}
      <h2>👥 Tiempo de resolución por persona</h2>

      <BarChart width={700} height={300} data={byPerson}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Bar dataKey="value" />
      </BarChart>

      {/* Pie chart */}
      <h2>📊 Distribución de tiempos</h2>

      <PieChart width={400} height={300}>
        <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100}>
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} />
          ))}
        </Pie>
        <Legend />
        <Tooltip />
      </PieChart>

      {/* Insights */}
      <h2>🚨 Insights</h2>

      <ul>
        {insights.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;